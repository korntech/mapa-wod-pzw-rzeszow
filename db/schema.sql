-- Schemat bazy (idempotentny): tabele łowisk, allow-lista operatorów, RLS.

create table if not exists public.zbiorniki (
  id          bigint generated always as identity primary key,
  n           text not null,                       -- nazwa
  lat         double precision not null,           -- szerokość geogr.
  lon         double precision not null,           -- długość geogr.
  ha          text default '—',                    -- powierzchnia (jak w wykazie, np. "3,00")
  t           text default '',                     -- typ (opis z wykazu, np. "2 stawy")
  k           text not null default 'inny',        -- rodzaj: zaporowy / pozwirowy / staw / inny
  nk          smallint not null default 0,         -- 1 = łowisko NO-KILL
  o           text default '',                     -- obwód rybacki (opcjonalnie, np. "Wisłok 3")
  r           text default '',                     -- zasady
  a           smallint not null default 0,         -- 1 = lokalizacja przybliżona
  updated_at  timestamptz not null default now()
);

create table if not exists public.rivers (
  id          bigint generated always as identity primary key,
  n           text not null,                       -- nazwa
  c           text default 'niz',                  -- 'niz' nizinna / 'gor' kraina pstrąga
  o           text default '',                     -- obwód
  d           text default '',                     -- opis granic
  r           text default '',                     -- zasady
  pts         jsonb not null default '[]'::jsonb,  -- [[lat,lon],…]
  updated_at  timestamptz not null default now()
);

create table if not exists public.granice (
  id          bigint generated always as identity primary key,
  n           text not null,                       -- nazwa
  lat         double precision not null,
  lon         double precision not null,
  d           text default '',                     -- opis
  updated_at  timestamptz not null default now()
);

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

drop trigger if exists trg_zbiorniki_updated_at on public.zbiorniki;
create trigger trg_zbiorniki_updated_at
  before update on public.zbiorniki
  for each row execute function public.set_updated_at();

drop trigger if exists trg_rivers_updated_at on public.rivers;
create trigger trg_rivers_updated_at
  before update on public.rivers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_granice_updated_at on public.granice;
create trigger trg_granice_updated_at
  before update on public.granice
  for each row execute function public.set_updated_at();

-- Allow-lista operatorów (po e-mailu): zapis w tabelach łowisk mają tylko wpisane konta.
create table if not exists public.operators (
  email     text primary key,
  added_at  timestamptz not null default now()
);
alter table public.operators enable row level security;
revoke all on table public.operators from anon, authenticated;

-- Czy zalogowany użytkownik jest operatorem: konto z auth.users o e-mailu z allow-listy,
-- potwierdzone, nieusunięte i niezablokowane (SECURITY DEFINER: odczyt operators i auth.users mimo RLS).
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Zapis wymaga sesji po drugim składniku (MFA TOTP, poziom aal2) — patrz panel operatora.
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
revoke execute on function public.is_operator() from public, anon;
grant  execute on function public.is_operator() to authenticated;

-- Diagnostyka dla panelu: konto na allow-liście niezależnie od MFA.
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

-- Row Level Security: publiczny odczyt, zapis tylko dla operatorów z allow-listy.
alter table public.zbiorniki enable row level security;

drop policy if exists "publiczny odczyt" on public.zbiorniki;
create policy "publiczny odczyt"
  on public.zbiorniki for select
  to anon, authenticated
  using (true);

drop policy if exists "zapis dla zalogowanych" on public.zbiorniki;
drop policy if exists "zapis dla operatorów" on public.zbiorniki;
create policy "zapis dla operatorów"
  on public.zbiorniki for insert
  to authenticated
  with check (public.is_operator());

drop policy if exists "edycja dla zalogowanych" on public.zbiorniki;
drop policy if exists "edycja dla operatorów" on public.zbiorniki;
create policy "edycja dla operatorów"
  on public.zbiorniki for update
  to authenticated
  using (public.is_operator()) with check (public.is_operator());

drop policy if exists "usuwanie dla zalogowanych" on public.zbiorniki;
drop policy if exists "usuwanie dla operatorów" on public.zbiorniki;
create policy "usuwanie dla operatorów"
  on public.zbiorniki for delete
  to authenticated
  using (public.is_operator());

-- Te same reguły dla rzek i granic: publiczny odczyt, zapis tylko dla operatorów.
alter table public.rivers enable row level security;

drop policy if exists "rivers odczyt" on public.rivers;
create policy "rivers odczyt"
  on public.rivers for select to anon, authenticated using (true);
drop policy if exists "rivers zapis" on public.rivers;
create policy "rivers zapis"
  on public.rivers for insert to authenticated with check (public.is_operator());
drop policy if exists "rivers edycja" on public.rivers;
create policy "rivers edycja"
  on public.rivers for update to authenticated using (public.is_operator()) with check (public.is_operator());
drop policy if exists "rivers usuwanie" on public.rivers;
create policy "rivers usuwanie"
  on public.rivers for delete to authenticated using (public.is_operator());

alter table public.granice enable row level security;

drop policy if exists "granice odczyt" on public.granice;
create policy "granice odczyt"
  on public.granice for select to anon, authenticated using (true);
drop policy if exists "granice zapis" on public.granice;
create policy "granice zapis"
  on public.granice for insert to authenticated with check (public.is_operator());
drop policy if exists "granice edycja" on public.granice;
create policy "granice edycja"
  on public.granice for update to authenticated using (public.is_operator()) with check (public.is_operator());
drop policy if exists "granice usuwanie" on public.granice;
create policy "granice usuwanie"
  on public.granice for delete to authenticated using (public.is_operator());

-- Rola anon: tylko odczyt (RLS i tak odrzuca zapis — dodatkowa warstwa).
revoke insert, update, delete, truncate, references, trigger
  on public.zbiorniki, public.rivers, public.granice from anon;

-- Ograniczenia CHECK: długości pól, znaki sterujące, kraina, flaga a, obrys współrzędnych,
-- kształt geometrii rzek (limity zgodne z config.json → snapshot.limits i bbox).
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

-- Historia zmian (kto, kiedy, stan przed i po) na tabelach łowisk, niedostępna z API.
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
