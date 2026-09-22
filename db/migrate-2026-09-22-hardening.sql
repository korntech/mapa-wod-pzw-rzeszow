-- Wzmocnienie bazy po przeglądzie bezpieczeństwa (2026-09-22):
--  1. is_operator(): tożsamość po auth.uid() i bieżącym stanie auth.users (e-mail potwierdzony,
--     konto nie zablokowane, nie usunięte), porównanie e-maili bez rozróżniania wielkości liter;
--  2. search_path funkcji pomocniczych ustawiony na pusty (zalecenie lintera Supabase);
--  3. rola anon bez uprawnień do zapisu na tabelach łowisk (RLS i tak odrzuca — dodatkowa warstwa);
--  4. ograniczenia CHECK: długości pól, znaki sterujące, kraina, flaga a, obrys współrzędnych,
--     kształt geometrii rzek — limity zgodne z tools/snapshot/validate.mjs;
--  5. historia zmian (kto, kiedy, stan przed i po) na tabelach łowisk, niedostępna z API.
-- Idempotentne. Uruchom w SQL Editor projektu.

begin;

-- ===== 1–2. Funkcje pomocnicze =====
create or replace function public.is_operator()
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
revoke execute on function public.is_operator() from public, anon;
grant  execute on function public.is_operator() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ===== 3. Rola anon: tylko odczyt =====
revoke insert, update, delete, truncate, references, trigger
  on public.zbiorniki, public.rivers, public.granice from anon;
revoke all on table public.operators from anon, authenticated;

-- ===== 4. Ograniczenia CHECK =====
-- Wartości null w polach tekstowych zastępowane pustym łańcuchem (jak w aplikacji).
update public.zbiorniki set ha = '—' where ha is null;
update public.zbiorniki set t = '' where t is null;
update public.zbiorniki set r = '' where r is null;
update public.rivers set c = 'niz' where c is null;
update public.rivers set o = '' where o is null;
update public.rivers set d = '' where d is null;
update public.rivers set r = '' where r is null;
update public.granice set d = '' where d is null;

alter table public.zbiorniki drop constraint if exists zbiorniki_pola_check;
alter table public.zbiorniki add constraint zbiorniki_pola_check check (
  length(btrim(n)) between 1 and 200
  and ha is not null and length(ha) <= 40
  and t is not null and length(t) <= 200
  and r is not null and length(r) <= 4000
  and a in (0, 1)
  and (n || ha || t || r) !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'
);
alter table public.zbiorniki drop constraint if exists zbiorniki_obrys_check;
alter table public.zbiorniki add constraint zbiorniki_obrys_check check (
  lat between 49.0 and 51.0 and lon between 20.5 and 23.6
);

alter table public.rivers drop constraint if exists rivers_pola_check;
alter table public.rivers add constraint rivers_pola_check check (
  length(btrim(n)) between 1 and 200
  and c in ('niz', 'gor')
  and o is not null and length(o) <= 100
  and d is not null and length(d) <= 4000
  and r is not null and length(r) <= 4000
  and (n || o || d || r) !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'
);
alter table public.rivers drop constraint if exists rivers_pts_check;
alter table public.rivers add constraint rivers_pts_check check (
  jsonb_typeof(pts) = 'array' and jsonb_array_length(pts) between 2 and 20000
);

alter table public.granice drop constraint if exists granice_pola_check;
alter table public.granice add constraint granice_pola_check check (
  length(btrim(n)) between 1 and 200
  and d is not null and length(d) <= 4000
  and (n || d) !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'
);
alter table public.granice drop constraint if exists granice_obrys_check;
alter table public.granice add constraint granice_obrys_check check (
  lat between 49.0 and 51.0 and lon between 20.5 and 23.6
);

-- ===== 5. Historia zmian =====
create table if not exists public.historia_zmian (
  id         bigint generated always as identity primary key,
  tabela     text not null,
  operacja   text not null,                 -- INSERT / UPDATE / DELETE
  rekord_id  bigint,
  przed      jsonb,                         -- stan wiersza przed zmianą (UPDATE, DELETE)
  po         jsonb,                         -- stan wiersza po zmianie (INSERT, UPDATE)
  kto_uid    uuid,
  kto_email  text,
  kiedy      timestamptz not null default now()
);
alter table public.historia_zmian enable row level security;
revoke all on table public.historia_zmian from public, anon, authenticated;
create index if not exists historia_zmian_kiedy_idx on public.historia_zmian (kiedy desc);

-- SECURITY DEFINER: zapis do historii niezależnie od uprawnień roli, która zmienia dane.
create or replace function public.zapisz_historie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.historia_zmian (tabela, operacja, rekord_id, przed, po, kto_uid, kto_email)
  values (
    tg_table_name,
    tg_op,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid(),
    auth.jwt() ->> 'email'
  );
  return null;
end;
$$;
revoke execute on function public.zapisz_historie() from public, anon, authenticated;

drop trigger if exists trg_zbiorniki_historia on public.zbiorniki;
create trigger trg_zbiorniki_historia
  after insert or update or delete on public.zbiorniki
  for each row execute function public.zapisz_historie();

drop trigger if exists trg_rivers_historia on public.rivers;
create trigger trg_rivers_historia
  after insert or update or delete on public.rivers
  for each row execute function public.zapisz_historie();

drop trigger if exists trg_granice_historia on public.granice;
create trigger trg_granice_historia
  after insert or update or delete on public.granice
  for each row execute function public.zapisz_historie();

-- ===== KONTROLA =====
do $$
declare v_ops int; v_conf int;
begin
  select count(*) into v_ops from public.operators;
  select count(*) into v_conf
    from public.operators o join auth.users u on lower(u.email) = lower(o.email)
    where u.email_confirmed_at is not null;
  raise notice 'operatorów na liście: %, z kontem o potwierdzonym e-mailu: %', v_ops, v_conf;
  if v_ops > 0 and v_conf = 0 then
    raise exception 'Żaden operator z listy nie ma potwierdzonego konta — sprawdź auth.users przed zatwierdzeniem';
  end if;
end $$;

commit;
