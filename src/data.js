/* Warstwa danych: odczyt łowisk z bazy (Supabase) z zapasem w postaci snapshotu
 * publikowanego razem ze stroną. Każda z trzech kolekcji wraca do snapshotu
 * niezależnie, gdy jej odczyt z bazy się nie powiedzie. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE, SNAPSHOT } from './config.js';
import { rodzajZbiornika, noKillZOpisu } from './zbiorniki-typ.js';

const COLLECTIONS = ['zb', 'rivers', 'granice'];
let client = null;

/** Współdzielony klient Supabase; null, gdy konfiguracja jest pusta. */
export function getSupabase() {
  if (client) return client;
  if (!SUPABASE.url || !SUPABASE.anonKey) return null;
  client = createClient(SUPABASE.url, SUPABASE.anonKey, { auth: { detectSessionInUrl: false } });
  return client;
}

const text = (v) => (typeof v === 'string' ? v : '');

/* Mapowanie rekordów bazy na format snapshotu (ten sam co w tools/snapshot/export.mjs).
 * Wartości spoza oczekiwanego typu są zastępowane pustymi, aby jeden błędny rekord
 * w bazie nie zatrzymał renderowania całej mapy. */
const mapZbiornik = (z) => ({
  n: text(z.n),
  p: [z.lat, z.lon],
  ha: text(z.ha) || '—',
  t: text(z.t),
  k: rodzajZbiornika(z.k, z.t),
  nk: z.nk == null ? (noKillZOpisu(z.t, z.n) ? 1 : 0) : z.nk ? 1 : 0,
  o: text(z.o),
  r: text(z.r),
  a: z.a ? 1 : 0,
});
const mapRiver = (r) => ({
  n: text(r.n),
  c: r.c === 'gor' ? 'gor' : 'niz',
  o: text(r.o),
  d: text(r.d),
  r: text(r.r),
  pts: Array.isArray(r.pts) ? r.pts : [],
});
const mapGranica = (g) => ({ n: text(g.n), p: [g.lat, g.lon], d: text(g.d) });

/** Kolekcje odczytane z bazy; brak klucza oznacza nieudany odczyt tej kolekcji. */
export async function loadFromSupabase() {
  const sb = getSupabase();
  if (!sb) return {};
  const { tables } = SUPABASE;
  try {
    const [zb, rivers, granice] = await Promise.all([
      // Wszystkie kolumny: mapowanie wyprowadza k/nk z opisu t, gdy migracja rodzaju zbiornika
      // nie została jeszcze uruchomiona (zamiast błędu 400 i cofnięcia do snapshotu).
      sb.from(tables.zbiorniki).select('*').order('n'),
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

/** Klucz, pod którym klient Supabase trzyma sesję w localStorage. */
function sessionStorageKey(sb) {
  return sb.auth.storageKey || `sb-${new URL(SUPABASE.url).hostname.split('.')[0]}-auth-token`;
}

/** Kończy sesję operatora niezależnie od dostępności serwera: token znika lokalnie od razu,
 *  a unieważnienie po stronie serwera jest wysyłane bez czekania na odpowiedź. */
export function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  const key = sessionStorageKey(sb);
  let token = null;
  try {
    token = JSON.parse(localStorage.getItem(key) || 'null')?.access_token || null;
  } catch {
    token = null;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* brak dostępu do storage — sesja i tak nie została zapisana */
  }
  if (!token) return;
  fetch(`${SUPABASE.url}/auth/v1/logout?scope=global`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
}

/** Escapowanie tekstu przed wstawieniem do HTML (treść oraz atrybuty w cudzysłowie lub apostrofie). */
export function esc(value) {
  return (value == null ? '' : String(value)).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
