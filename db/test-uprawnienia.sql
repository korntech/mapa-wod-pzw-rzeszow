-- Test uprawnień (RLS + granty) do uruchomienia w SQL Editor na bazie TESTOWEJ (albo na kopii).
-- Sprawdza macierz: anon / zalogowany spoza allow-listy / operator aal1 / operator aal2 /
-- operator zablokowany — odczyt zbiorników, dostęp do operators/zgloszenia/historia_zmian,
-- update, insert i delete. Niczego nie zostawia: działa w transakcji i kończy ROLLBACK.
--
-- Podmień dwa adresy e-mail niżej na istniejące konta z auth.users (operator = na allow-liście).
-- Wynik: tabela z kolumnami rola | test | wynik (OK / BŁĄD: ...). Oczekiwane wartości w kolumnie „oczekiwane”.

begin;

create temp table wyniki (lp serial, rola text, test text, oczekiwane text, wynik text);
grant all on wyniki to anon, authenticated;
grant all on sequence wyniki_lp_seq to anon, authenticated;

do $$
declare
  v_operator text := 'operator@przyklad.pl';   -- <-- konto z allow-listy operators
  v_zwykly   text := 'zwykly@przyklad.pl';     -- <-- konto zalogowane, NIE na allow-liście
  v_op_id uuid; v_zw_id uuid; v_ban_id uuid;
  r record;
  przypadki jsonb;
  p jsonb;
  n bigint;
begin
  select id into v_op_id from auth.users where lower(email) = lower(v_operator);
  select id into v_zw_id from auth.users where lower(email) = lower(v_zwykly);
  if v_op_id is null or v_zw_id is null then
    raise exception 'Podmień adresy e-mail na istniejące konta (operator: %, zwykły: %)', v_operator, v_zwykly;
  end if;
  -- Zablokowany operator: to samo konto operatora z tymczasowym banned_until (cofnięte przez ROLLBACK).
  v_ban_id := v_op_id;

  przypadki := jsonb_build_array(
    jsonb_build_object('rola','anon (klucz publiczny)','role','anon','sub','','aal','','ban',false,
      'zapis',false),
    jsonb_build_object('rola','zalogowany spoza allow-listy, aal2','role','authenticated','sub',v_zw_id::text,'aal','aal2','ban',false,
      'zapis',false),
    jsonb_build_object('rola','operator aal1 (samo hasło)','role','authenticated','sub',v_op_id::text,'aal','aal1','ban',false,
      'zapis',false),
    jsonb_build_object('rola','operator aal2 (hasło + TOTP)','role','authenticated','sub',v_op_id::text,'aal','aal2','ban',false,
      'zapis',true),
    jsonb_build_object('rola','operator zablokowany, aal2','role','authenticated','sub',v_ban_id::text,'aal','aal2','ban',true,
      'zapis',false)
  );

  for p in select * from jsonb_array_elements(przypadki) loop
    if (p->>'ban')::boolean then
      update auth.users set banned_until = now() + interval '1 day' where id = v_ban_id;
    else
      update auth.users set banned_until = null where id = v_op_id;
    end if;
    perform set_config('request.jwt.claim.sub', p->>'sub', true);
    perform set_config('request.jwt.claims', jsonb_build_object('role', p->>'role', 'aal', p->>'aal', 'sub', p->>'sub')::text, true);
    execute format('set local role %I', p->>'role');

    -- odczyt zbiorników: zawsze OK
    begin
      execute 'select count(*) from public.zbiorniki' into n;
      insert into wyniki(rola,test,oczekiwane,wynik) values (p->>'rola','odczyt zbiorniki','OK','OK ('||n||' wierszy)');
    exception when others then
      insert into wyniki(rola,test,oczekiwane,wynik) values (p->>'rola','odczyt zbiorniki','OK','BŁĄD: '||sqlerrm);
    end;
    -- tabele wewnętrzne: zawsze ODMOWA
    for r in select unnest(array['operators','zgloszenia','historia_zmian']) as t loop
      begin
        execute format('select count(*) from public.%I', r.t) into n;
        insert into wyniki(rola,test,oczekiwane,wynik) values (p->>'rola','odczyt '||r.t,'ODMOWA','BŁĄD: odczyt możliwy ('||n||')');
      exception when insufficient_privilege then
        insert into wyniki(rola,test,oczekiwane,wynik) values (p->>'rola','odczyt '||r.t,'ODMOWA','OK (odmowa)');
      end;
    end loop;
    -- zapis: tylko operator aal2
    begin
      execute 'insert into public.granice (n, lat, lon, d) values (''TEST-UPRAWNIEN'', 50.0, 22.0, ''test'')';
      execute 'update public.granice set d = ''test2'' where n = ''TEST-UPRAWNIEN''';
      execute 'delete from public.granice where n = ''TEST-UPRAWNIEN''';
      insert into wyniki(rola,test,oczekiwane,wynik) values (p->>'rola','insert/update/delete granice',
        case when (p->>'zapis')::boolean then 'OK' else 'ODMOWA' end,
        case when (p->>'zapis')::boolean then 'OK (zapis możliwy)' else 'BŁĄD: zapis możliwy!' end);
    exception when others then
      insert into wyniki(rola,test,oczekiwane,wynik) values (p->>'rola','insert/update/delete granice',
        case when (p->>'zapis')::boolean then 'OK' else 'ODMOWA' end,
        case when (p->>'zapis')::boolean then 'BŁĄD: '||sqlerrm else 'OK (odmowa: '||sqlstate||')' end);
    end;
    reset role;
  end loop;
end $$;

select rola, test, oczekiwane, wynik,
       case when wynik like 'OK%' then '✓' else '✗' end as zgodne
from wyniki order by lp;

rollback;
