-- Migracja 2026-09-24: typ zgłoszenia „inne” (brakujące łowisko albo uwaga ogólna).
-- Takie zgłoszenie nie wskazuje rekordu na mapie: nazwę wpisuje zgłaszający, a współrzędnych
-- nie ma (null). Typy „zb” i „rzeka” nadal wymagają współrzędnych — pilnuje tego CHECK.
-- Idempotentna. Kolejność wdrożenia: najpierw ta migracja, potem nowa wersja funkcji zglos-blad
-- (stara funkcja z nową bazą działa; nowa funkcja ze starą bazą odrzuci zgłoszenia „inne”).
-- (transakcję otwiera i zamyka Supabase CLI — każda migracja to jedna transakcja)

alter table public.zgloszenia drop constraint if exists zgloszenia_typ_check;
alter table public.zgloszenia add constraint zgloszenia_typ_check
  check (typ in ('zb', 'rzeka', 'inne'));

alter table public.zgloszenia alter column lat drop not null;
alter table public.zgloszenia alter column lon drop not null;

-- Zakresy pól jak w migracji 20260923172015, ale współrzędne: albo obie null (tylko „inne”),
-- albo obie podane i w zakresie. „is not null” jest konieczne: samo „between” z null daje null,
-- a CHECK przepuszcza null jak prawdę.
alter table public.zgloszenia drop constraint if exists zgloszenia_pola_check;
alter table public.zgloszenia add constraint zgloszenia_pola_check check (
  length(ip) between 1 and 100
  and length(nazwa) between 1 and 200
  and length(opis) between 1 and 2001
  and (kontakt is null or length(kontakt) <= 200)
  and (
    (lat is null and lon is null and typ = 'inne')
    or (lat is not null and lon is not null and lat between -90 and 90 and lon between -180 and 180)
  )
);

-- Ta sama funkcja co w 20260923172015 (podpis bez zmian); p_lat/p_lon mogą być null.
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

  -- Współrzędne null tylko przy typie „inne” (CHECK zgloszenia_pola_check odrzuci inne przypadki).
  insert into public.zgloszenia (ip, typ, nazwa, lat, lon, opis, kontakt, status)
  values (p_ip, p_typ, p_nazwa, p_lat, p_lon, p_opis, nullif(p_kontakt, ''), 'oczekuje')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.zgloszenie_rezerwuj(text, text, text, double precision, double precision, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.zgloszenie_rezerwuj(text, text, text, double precision, double precision, text, text, integer, integer, integer) to service_role;
