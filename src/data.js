/* Warstwa danych wspólna dla mapy i panelu operatora.
 *
 * Źródło prawdy: baza Supabase (tabele zbiorniki, rivers, granice).
 * Bezpiecznik: public/data.json — nocny snapshot bazy z GitHub Actions.
 * Każda warstwa z osobna spada do snapshotu, gdy baza nie odpowiada,
 * więc awaria bazy degraduje mapę do stanu z ostatniej nocy, nie do białej strony. */
import { createClient } from '@supabase/supabase-js';
import { PZW_CONFIG } from '../config.js';

let client = null;

/** Klient Supabase albo null, gdy config.js jest pusty. Jeden na stronę. */
export function getSupabase() {
  if (client) return client;
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = PZW_CONFIG || {};
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

// Mapowanie rekordów bazy na kształt data.json — identyczne z tools/snapshot/export.mjs,
// żeby odczyt na żywo i snapshot dawały ten sam wynik.
const mapZb = (z) => ({ n: z.n, p: [z.lat, z.lon], ha: z.ha || '—', t: z.t || '', r: z.r || '', a: z.a || 0 });
const mapRiver = (r) => ({ n: r.n, c: r.c || 'niz', o: r.o || '', d: r.d || '', r: r.r || '', pts: r.pts || [] });
const mapGranica = (g) => ({ n: g.n, p: [g.lat, g.lon], d: g.d || '' });

/** Trzy warstwy z bazy; brakująca warstwa = nie udało się jej pobrać. */
export async function loadFromSupabase() {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const [zb, rivers, granice] = await Promise.all([
      sb.from('zbiorniki').select('n,lat,lon,ha,t,r,a').order('n'),
      sb.from('rivers').select('n,c,o,d,r,pts').order('n'),
      sb.from('granice').select('n,lat,lon,d').order('n'),
    ]);
    const out = {};
    if (!zb.error && zb.data) out.zb = zb.data.map(mapZb);
    if (!rivers.error && rivers.data) out.rivers = rivers.data.map(mapRiver);
    if (!granice.error && granice.data) out.granice = granice.data.map(mapGranica);
    return out;
  } catch { return {}; }
}

/** Snapshot z repo (public/data.json). Rzuca błąd, gdy pliku nie ma. */
export async function loadSnapshot() {
  const r = await fetch(import.meta.env.BASE_URL + 'data.json');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** Dane do wyświetlenia: snapshot jako baza, warstwy z bazy nadpisują go, gdy dostępne. */
export async function loadData() {
  const data = await loadSnapshot();
  const live = await loadFromSupabase();
  for (const k of ['zb', 'rivers', 'granice']) if (live[k] && live[k].length) data[k] = live[k];
  return data;
}

/** Pola łowisk pochodzą z edytowalnej bazy — escapujemy je przed wstawieniem do HTML. */
export function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
