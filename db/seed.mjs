// Jednorazowe załadowanie zbiorników z data.json do tabeli `zbiorniki` w Supabase.
//
// Wymaga klucza SERVICE ROLE (omija RLS — pełny zapis). Znajdziesz go w:
//   Supabase → Project Settings → API → "service_role" (sekret, NIE commituj!).
//
// Użycie (z katalogu projektu):
//   npm install @supabase/supabase-js
//   SUPABASE_URL="https://twojprojekt.supabase.co" \
//   SUPABASE_SERVICE_KEY="eyJ...service_role..." \
//   node db/seed.mjs
//
// Skrypt jest idempotentny: jeśli tabela ma już rekordy, pyta o potwierdzenie
// i (po --force) czyści ją przed ponownym załadowaniem.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const FORCE = process.argv.includes('--force');

if (!URL || !KEY) {
  console.error('Brak SUPABASE_URL lub SUPABASE_SERVICE_KEY w zmiennych środowiskowych.');
  console.error('Zobacz instrukcję na górze pliku.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, '..', 'data.json');
const data = JSON.parse(await readFile(dataPath, 'utf8'));

const rows = data.zb.map(z => ({
  n: z.n,
  lat: z.p[0],
  lon: z.p[1],
  ha: z.ha ?? '—',
  t: z.t ?? '',
  r: z.r ?? '',
  a: z.a ? 1 : 0
}));

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const { count } = await db
  .from('zbiorniki')
  .select('*', { count: 'exact', head: true });

if (count && count > 0) {
  if (!FORCE) {
    console.error(`Tabela "zbiorniki" ma już ${count} rekordów.`);
    console.error('Uruchom ponownie z flagą --force, aby ją wyczyścić i załadować od nowa.');
    process.exit(1);
  }
  console.log(`Czyszczę istniejące ${count} rekordów (--force)...`);
  const { error: delErr } = await db.from('zbiorniki').delete().gt('id', 0);
  if (delErr) { console.error('Błąd czyszczenia:', delErr.message); process.exit(1); }
}

const { error } = await db.from('zbiorniki').insert(rows);
if (error) { console.error('Błąd zapisu:', error.message); process.exit(1); }

console.log(`Załadowano ${rows.length} zbiorników do Supabase.`);
