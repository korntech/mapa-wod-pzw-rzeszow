-- Minimalna atrapa środowiska Supabase dla testu migracji na czystym Postgresie (CI i lokalnie):
-- role, schemat auth z tabelą users oraz funkcje auth.uid()/auth.jwt() czytające ustawienia sesji.
-- Na prawdziwym projekcie Supabase NIE uruchamiać — tam wszystko to już istnieje.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
-- Domyślne uprawnienia Supabase: role API widzą schemat public; migracje je zawężają.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
