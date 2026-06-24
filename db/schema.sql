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

-- Row Level Security: publiczny odczyt, zapis tylko dla zalogowanych operatorów
alter table public.zbiorniki enable row level security;

drop policy if exists "publiczny odczyt" on public.zbiorniki;
create policy "publiczny odczyt"
  on public.zbiorniki for select
  to anon, authenticated
  using (true);

drop policy if exists "zapis dla zalogowanych" on public.zbiorniki;
create policy "zapis dla zalogowanych"
  on public.zbiorniki for insert
  to authenticated
  with check (true);

drop policy if exists "edycja dla zalogowanych" on public.zbiorniki;
create policy "edycja dla zalogowanych"
  on public.zbiorniki for update
  to authenticated
  using (true) with check (true);

drop policy if exists "usuwanie dla zalogowanych" on public.zbiorniki;
create policy "usuwanie dla zalogowanych"
  on public.zbiorniki for delete
  to authenticated
  using (true);
