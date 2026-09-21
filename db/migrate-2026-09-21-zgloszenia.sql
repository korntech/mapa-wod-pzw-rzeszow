-- Zgłoszenia błędów z formularza na mapie: dziennik i podstawa limitu na adres IP.
-- Pisze i czyta tylko funkcja Supabase kluczem serwisowym; klucz publiczny nie ma dostępu.
-- Idempotentne. Uruchom w SQL Editor projektu.
begin;

create table if not exists public.zgloszenia (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip text not null,
  typ text not null check (typ in ('zb', 'rzeka')),
  nazwa text not null,
  lat double precision not null,
  lon double precision not null,
  opis text not null,
  kontakt text,
  issue_numer integer,
  issue_url text
);

create index if not exists zgloszenia_ip_created_at on public.zgloszenia (ip, created_at desc);

alter table public.zgloszenia enable row level security;
revoke all on public.zgloszenia from anon, authenticated;

commit;
