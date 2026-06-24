-- Schemat bazy panelu operatora PZW Rzeszów (idempotentny).

create table if not exists public.zbiorniki (
  id          bigint generated always as identity primary key,
  n           text not null,                       -- nazwa
  lat         double precision not null,           -- szerokość geogr.
  lon         double precision not null,           -- długość geogr.
  ha          text default '—',                    -- powierzchnia (jak w wykazie, np. "3,00")
  t           text default '',                     -- typ
  r           text default '',                     -- zasady
  a           smallint not null default 0,         -- 1 = lokalizacja przybliżona
  updated_at  timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_zbiorniki_updated_at on public.zbiorniki;
create trigger trg_zbiorniki_updated_at
  before update on public.zbiorniki
  for each row execute function public.set_updated_at();

-- Allow-lista operatorów (po e-mailu). Zapis do zbiorników mają tylko konta,
-- których e-mail jest tu wpisany — niezależnie od ustawień rejestracji w Supabase.
create table if not exists public.operators (
  email     text primary key,
  added_at  timestamptz not null default now()
);
alter table public.operators enable row level security;
-- Brak polityk = brak bezpośredniego dostępu (anon/authenticated nie czytają tej tabeli);
-- zarządzasz nią z SQL Editor (rola omijająca RLS).

-- Czy zalogowany użytkownik jest operatorem. SECURITY DEFINER omija RLS na operators,
-- więc allow-lista nie jest wystawiona na zewnątrz.
create or replace function public.is_operator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.operators
    where email = (auth.jwt() ->> 'email')
  );
$$;

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
