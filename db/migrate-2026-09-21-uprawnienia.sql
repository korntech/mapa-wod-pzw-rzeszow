-- Zawężenie uprawnień: allow-lista operatorów niedostępna dla ról aplikacji,
-- funkcje pomocnicze wywoływalne tylko przez zalogowanych.
-- Idempotentne. Uruchom w SQL Editor projektu.

begin;

revoke all on table public.operators from anon, authenticated;

revoke execute on function public.is_operator() from public, anon;
grant  execute on function public.is_operator() to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

commit;
