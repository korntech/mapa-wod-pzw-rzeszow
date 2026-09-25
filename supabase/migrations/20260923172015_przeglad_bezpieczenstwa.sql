-- Atomowa rezerwacja limitu zgłoszeń, retencja zgłoszeń (pg_cron), zapis w panelu tylko po MFA.
-- Idempotentna. Wymaga funkcji zglos-blad wywołującej zgloszenie_rezerwuj i panelu z obsługą MFA.

-- ===== Atomowa rezerwacja limitu zgłoszeń =====
-- Wpis w tabeli powstaje PRZED założeniem issue, w jednej transakcji z policzeniem limitów,
-- pod blokadą doradczą — równoległe żądania nie omijają limitu, a żądanie, które nie
-- zwiększyło licznika, nigdy nie tworzy issue (obsługa: supabase/functions/zglos-blad).
alter table public.zgloszenia
  add column if not exists status text not null default 'wyslane';
alter table public.zgloszenia drop constraint if exists zgloszenia_status_check;
alter table public.zgloszenia add constraint zgloszenia_status_check
  check (status in ('oczekuje', 'wyslane', 'blad'));
alter table public.zgloszenia drop constraint if exists zgloszenia_pola_check;
alter table public.zgloszenia add constraint zgloszenia_pola_check check (
  length(ip) between 1 and 100
  and length(nazwa) between 1 and 200
  and length(opis) between 1 and 2001
  and (kontakt is null or length(kontakt) <= 200)
  and lat between -90 and 90 and lon between -180 and 180
);
create index if not exists zgloszenia_created_at on public.zgloszenia (created_at desc);

create or replace function public.zgloszenie_rezerwuj(
  p_ip text, p_typ text, p_nazwa text, p_lat double precision, p_lon double precision,
  p_opis text, p_kontakt text,
  p_na_godzine integer, p_lacznie_na_godzine integer, p_lacznie_na_dobe integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_godzina timestamptz := now() - interval '1 hour';
  v_doba timestamptz := now() - interval '24 hours';
begin
  -- Jedna blokada dla wszystkich rezerwacji: liczniki globalne i per adres są spójne.
  perform pg_advisory_xact_lock(hashtext('public.zgloszenia.rezerwacja'));

  if (select count(*) from public.zgloszenia where ip = p_ip and created_at >= v_godzina) >= p_na_godzine
     or (select count(*) from public.zgloszenia where created_at >= v_godzina) >= p_lacznie_na_godzine
     or (select count(*) from public.zgloszenia where created_at >= v_doba) >= p_lacznie_na_dobe then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;

  -- Powtórka: to samo łowisko z tego samego adresu albo identyczny opis w ciągu doby.
  if exists (
    select 1 from public.zgloszenia
    where created_at >= v_doba and ((ip = p_ip and nazwa = p_nazwa) or opis = p_opis)
  ) then
    return jsonb_build_object('ok', false, 'error', 'powtorka');
  end if;

  insert into public.zgloszenia (ip, typ, nazwa, lat, lon, opis, kontakt, status)
  values (p_ip, p_typ, p_nazwa, p_lat, p_lon, p_opis, nullif(p_kontakt, ''), 'oczekuje')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.zgloszenie_rezerwuj(text, text, text, double precision, double precision, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.zgloszenie_rezerwuj(text, text, text, double precision, double precision, text, text, integer, integer, integer) to service_role;

-- ===== Retencja zgłoszeń (pg_cron) =====
-- Wpisy starsze niż 30 dni są kasowane codziennie o 03:15 UTC, niezależnie od ruchu i wyłącznika
-- formularza. Przebiegi i błędy: select * from cron.job_run_details order by start_time desc.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'zgloszenia-retencja') then
      perform cron.unschedule('zgloszenia-retencja');
    end if;
    perform cron.schedule(
      'zgloszenia-retencja', '15 3 * * *',
      $job$ delete from public.zgloszenia where created_at < now() - interval '30 days' $job$
    );
  else
    raise notice 'pg_cron niedostępny — retencję zgłoszeń trzeba zaplanować inaczej';
  end if;
end $$;

-- ===== Zapis w panelu tylko po drugim składniku (MFA, poziom aal2) =====
-- Samo hasło (aal1) pozwala się zalogować i czytać, ale reguły RLS odrzucą każdy zapis,
-- dopóki sesja nie przejdzie weryfikacji TOTP.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1
      from public.operators o
      join auth.users u on lower(u.email) = lower(o.email)
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until < now())
    );
$$;

-- Diagnostyka dla panelu: czy konto jest na allow-liście (bez wymogu MFA), żeby odróżnić
-- „brak uprawnień” od „brak drugiego składnika”.
create or replace function public.is_operator_konto()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.operators o
    join auth.users u on lower(u.email) = lower(o.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now())
  );
$$;
revoke execute on function public.is_operator_konto() from public, anon;
grant  execute on function public.is_operator_konto() to authenticated;


select status, count(*) from public.zgloszenia group by status order by status;
