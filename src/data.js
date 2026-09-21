/* Warstwa danych: odczyt łowisk z bazy (Supabase) z zapasem w postaci snapshotu
 * publikowanego razem ze stroną. Każda z trzech kolekcji wraca do snapshotu
 * niezależnie, gdy jej odczyt z bazy się nie powiedzie. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE, SNAPSHOT } from './config.js';

const COLLECTIONS = ['zb', 'rivers', 'granice'];
let client = null;

/** Współdzielony klient Supabase; null, gdy konfiguracja jest pusta. */
export function getSupabase() {
  if (client) return client;
  if (!SUPABASE.url || !SUPABASE.anonKey) return null;
  client = createClient(SUPABASE.url, SUPABASE.anonKey);
  return client;
}

/* Mapowanie rekordów bazy na format snapshotu (ten sam co w tools/snapshot/export.mjs). */
const mapZbiornik = (z) => ({
  n: z.n,
  p: [z.lat, z.lon],
  ha: z.ha || '—',
  t: z.t || '',
  r: z.r || '',
  a: z.a || 0,
});
const mapRiver = (r) => ({
  n: r.n,
  c: r.c || 'niz',
  o: r.o || '',
  d: r.d || '',
  r: r.r || '',
  pts: r.pts || [],
});
const mapGranica = (g) => ({ n: g.n, p: [g.lat, g.lon], d: g.d || '' });

/** Kolekcje odczytane z bazy; brak klucza oznacza nieudany odczyt tej kolekcji. */
export async function loadFromSupabase() {
  const sb = getSupabase();
  if (!sb) return {};
  const { tables } = SUPABASE;
  try {
    const [zb, rivers, granice] = await Promise.all([
      sb.from(tables.zbiorniki).select('n,lat,lon,ha,t,r,a').order('n'),
      sb.from(tables.rivers).select('n,c,o,d,r,pts').order('n'),
      sb.from(tables.granice).select('n,lat,lon,d').order('n'),
    ]);
    const out = {};
    if (!zb.error && zb.data) out.zb = zb.data.map(mapZbiornik);
    if (!rivers.error && rivers.data) out.rivers = rivers.data.map(mapRiver);
    if (!granice.error && granice.data) out.granice = granice.data.map(mapGranica);
    return out;
  } catch {
    return {};
  }
}

/** Snapshot danych opublikowany razem ze stroną. */
export async function loadSnapshot() {
  const response = await fetch(import.meta.env.BASE_URL + SNAPSHOT.file);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

/** Dane do wyświetlenia: snapshot nadpisany kolekcjami odczytanymi z bazy. */
export async function loadData() {
  const data = await loadSnapshot();
  const live = await loadFromSupabase();
  for (const key of COLLECTIONS) {
    if (live[key] && live[key].length) data[key] = live[key];
  }
  return data;
}

/** Escapowanie tekstu przed wstawieniem do HTML. */
export function esc(value) {
  return (value == null ? '' : String(value)).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}
