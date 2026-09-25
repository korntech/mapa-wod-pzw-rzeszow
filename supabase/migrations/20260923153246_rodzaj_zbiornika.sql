-- Rodzaj zbiornika, flaga NO-KILL i obwód rybacki dla zbiorników (podstawa filtrów na mapie).
-- Idempotentna.
--
-- Nowe kolumny w public.zbiorniki:
--   k   text     rodzaj: 'zaporowy' | 'pozwirowy' | 'staw' | 'inny'   (domyślnie 'inny')
--   nk  smallint 1 = łowisko NO-KILL                                    (domyślnie 0)
--   o   text     obwód rybacki, np. 'Wisłok 3' (opcjonalnie; pusty = nieprzypisany)
-- Pole t (opis typu z wykazu, np. „2 stawy”) zostaje bez zmian.
--
-- Wartości początkowe są wyprowadzane z opisu t tą samą regułą co w src/zbiorniki-typ.js;
-- backfill dotyczy tylko wierszy, które mają jeszcze wartość domyślną.

alter table public.zbiorniki add column if not exists k  text     not null default 'inny';
alter table public.zbiorniki add column if not exists nk smallint not null default 0;
alter table public.zbiorniki add column if not exists o  text     default '';

update public.zbiorniki set o = '' where o is null;

-- translate() zamiast rozszerzenia unaccent (nie jest włączone w projekcie).
update public.zbiorniki set k = sub.k
from (
  select id,
    case
      when s like '%zaporow%' then 'zaporowy'
      when s like '%zwir%' or s like '%wyrobisk%' then 'pozwirowy'
      when s like '%staw%' then 'staw'
      else 'inny'
    end as k
  from (select id, translate(lower(t), 'ąćęłńóśźż', 'acelnoszz') as s from public.zbiorniki) x
) sub
where public.zbiorniki.id = sub.id and public.zbiorniki.k = 'inny';

update public.zbiorniki set nk = 1
where nk = 0 and (t || ' ' || n) ~* 'no[[:space:]-]?kill';

alter table public.zbiorniki drop constraint if exists zbiorniki_rodzaj_check;
alter table public.zbiorniki add constraint zbiorniki_rodzaj_check check (
  k in ('zaporowy', 'pozwirowy', 'staw', 'inny')
  and nk in (0, 1)
  and o is not null and length(o) <= 100
  and o !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'
);

-- Podsumowanie po migracji.
select k as rodzaj, count(*) as zbiornikow, sum(nk) as no_kill
from public.zbiorniki group by k order by k;
