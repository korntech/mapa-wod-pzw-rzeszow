-- Zgłoszenia bez danych kontaktowych: istniejące kontakty są kasowane, CHECK blokuje nowe.
-- Kolumna `kontakt` i parametr `p_kontakt` zostają (zawsze null / ignorowany), bo odwołują się
-- do nich wcześniejsze migracje, a podpis funkcji bez zmian pozwala wdrażać bazę i funkcję
-- w dowolnej kolejności. Idempotentna.

update public.zgloszenia set kontakt = null where kontakt is not null;

alter table public.zgloszenia drop constraint if exists zgloszenia_bez_kontaktu;
alter table public.zgloszenia add constraint zgloszenia_bez_kontaktu check (kontakt is null);

comment on column public.zgloszenia.kontakt is
  'Nieużywana od 2026-09-25 (kontaktów nie zbieramy; CHECK zgloszenia_bez_kontaktu).';

-- Ta sama funkcja co w 20260924104542 (podpis bez zmian), ale p_kontakt jest ignorowany.
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
  -- Kontaktu nie zapisujemy (p_kontakt ignorowany).
  insert into public.zgloszenia (ip, typ, nazwa, lat, lon, opis, status)
  values (p_ip, p_typ, p_nazwa, p_lat, p_lon, p_opis, 'oczekuje')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.zgloszenie_rezerwuj(text, text, text, double precision, double precision, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.zgloszenie_rezerwuj(text, text, text, double precision, double precision, text, text, integer, integer, integer) to service_role;
