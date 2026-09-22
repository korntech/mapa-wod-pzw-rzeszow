#!/usr/bin/env node
/**
 * Eksport tabel łowisk z Supabase do pliku snapshotu (public/<snapshot.file>).
 *
 * Eksport jest przerywany z kodem 2, gdy baza zwraca mniej wierszy niż obecny
 * snapshot albo o więcej niż `snapshot.maxVertexDrop` mniej wierzchołków rzek.
 *
 * Zmienne środowiskowe:
 *   PZW_OUT    inna ścieżka pliku wyjściowego
 *   PZW_FORCE  1 = zapisz mimo ostrzeżeń
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig, snapshotPath } from './config.mjs';

const config = loadConfig();
const OUT = process.env.PZW_OUT || snapshotPath(config);
const FORCE = process.env.PZW_FORCE === '1';
const { url, anonKey, tables } = config.supabase;

if (!url || !anonKey) {
  console.error('config.json: brak supabase.url lub supabase.anonKey');
  process.exit(1);
}

async function fetchTable(table, order = 'id') {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

const text = (v) => (typeof v === 'string' ? v : '');

/* Mapowanie rekordów bazy na format snapshotu (ten sam co w src/data.js). Pola tekstowe
 * są normalizowane do łańcuchów, żeby null z bazy nie trafił do snapshotu jako null. */
const mapZbiornik = (r) => ({
  n: text(r.n),
  p: [r.lat, r.lon],
  ha: text(r.ha) || '—',
  t: text(r.t),
  r: text(r.r),
  a: r.a ? 1 : 0,
});
const mapRiver = (r) => ({
  n: text(r.n),
  c: r.c === 'gor' ? 'gor' : 'niz',
  o: text(r.o),
  d: text(r.d),
  r: text(r.r),
  pts: Array.isArray(r.pts) ? r.pts : [],
});
const mapGranica = (r) => ({ n: text(r.n), p: [r.lat, r.lon], d: text(r.d) });

const vertexCount = (rivers) => rivers.reduce((s, r) => s + (Array.isArray(r.pts) ? r.pts.length : 0), 0);

/** Lista problemów, gdy nowy snapshot ma mniej danych niż poprzedni. */
function compareWithPrevious(next, prevPath) {
  if (!existsSync(prevPath)) return [];
  let prev;
  try {
    prev = JSON.parse(readFileSync(prevPath, 'utf8'));
  } catch {
    return ['obecny snapshot nie jest poprawnym JSON — pomijam porównanie'];
  }
  const problems = [];
  for (const k of ['zb', 'rivers', 'granice']) {
    const before = prev[k]?.length ?? 0;
    const after = next[k].length;
    if (after < before) problems.push(`${k}: baza ma ${after} wierszy, snapshot ma ${before}`);
  }
  const vBefore = vertexCount(prev.rivers || []);
  const vAfter = vertexCount(next.rivers);
  if (vBefore > 0 && vAfter < vBefore * (1 - config.snapshot.maxVertexDrop)) {
    problems.push(`rzeki: ${vAfter} wierzchołków wobec ${vBefore} w snapshocie`);
  }
  return problems;
}

/** Porównanie treści bez znacznika czasu snapshotu. */
const withoutTimestamp = (o) => JSON.stringify({ ...o, meta: { ...o.meta, snapshot: undefined } });

async function main() {
  const t0 = Date.now();
  const [zb, rivers, granice] = await Promise.all([
    fetchTable(tables.zbiorniki),
    fetchTable(tables.rivers),
    fetchTable(tables.granice),
  ]);
  const next = {
    zb: zb.map(mapZbiornik),
    rivers: rivers.map(mapRiver),
    granice: granice.map(mapGranica),
    meta: { ...config.snapshot.meta, snapshot: new Date().toISOString().slice(0, 19) + 'Z' },
  };
  console.log(
    `Pobrano: ${next.zb.length} zbiorników, ${next.rivers.length} rzek (${vertexCount(next.rivers)} wierzchołków), ${next.granice.length} granic — ${Date.now() - t0} ms`
  );

  const problems = compareWithPrevious(next, OUT);
  if (problems.length) {
    console.error('Eksport wstrzymany — baza zawiera mniej danych niż snapshot:');
    for (const p of problems) console.error('  - ' + p);
    if (!FORCE) {
      console.error('Aby zapisać mimo to, uruchom z PZW_FORCE=1.');
      process.exit(2);
    }
    console.error('PZW_FORCE=1 — zapisuję mimo ostrzeżeń.');
  }

  let unchanged = false;
  if (existsSync(OUT)) {
    try {
      unchanged = withoutTimestamp(JSON.parse(readFileSync(OUT, 'utf8'))) === withoutTimestamp(next);
    } catch {
      /* nadpisz */
    }
  }
  if (unchanged) {
    console.log('Bez zmian względem snapshotu — nic do zapisania.');
    return;
  }
  writeFileSync(OUT, JSON.stringify(next) + '\n');
  console.log(`Zapisano ${OUT}`);
}

main().catch((e) => {
  console.error('BŁĄD:', e.message);
  process.exit(1);
});
