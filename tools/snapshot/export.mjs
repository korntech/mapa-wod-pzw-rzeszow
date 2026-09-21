#!/usr/bin/env node
/**
 * Eksport danych łowisk z Supabase do public/data.json.
 *
 * Dwa cele w jednym uruchomieniu:
 *  1. Snapshot — data.json w repozytorium jest zawsze świeżą kopią bazy, więc mapa
 *     działa nawet gdy baza nie odpowiada, a historia zmian danych zostaje w Git.
 *  2. Keep-alive — samo zapytanie do bazy liczy się jako aktywność i zapobiega
 *     pauzowaniu projektu Supabase w darmowym progu (pauza po 7 dniach bezczynności).
 *
 * Bez zależności (Node 20+, wbudowany fetch). Klucz publiczny (anon) wystarcza,
 * bo reguły RLS dają rolę anon publiczny odczyt — żaden sekret nie jest potrzebny.
 *
 * Bezpieczniki: jeśli baza zwróci wyraźnie mniej danych niż jest w obecnym
 * data.json (mniej wierszy albo o >30 % mniej wierzchołków rzek), eksport
 * KOŃCZY SIĘ BŁĘDEM i nie nadpisuje pliku. Chroni to przed przypadkowym
 * cofnięciem danych, gdy baza jest np. świeżo po reseedzie albo częściowo pusta.
 *
 * Użycie:
 *   node tools/snapshot/export.mjs            # zapis do data.json, kod 0 gdy ok
 *   PZW_FORCE=1 node tools/snapshot/export.mjs # pomiń bezpieczniki (świadomie)
 *   PZW_OUT=/tmp/x.json node ...              # inna ścieżka wyjścia
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.PZW_OUT || resolve(ROOT, 'public', 'data.json');
const FORCE = process.env.PZW_FORCE === '1';

function readConfig() {
  const src = readFileSync(resolve(ROOT, 'config.js'), 'utf8');
  const url = /SUPABASE_URL:\s*'([^']+)'/.exec(src)?.[1];
  const key = /SUPABASE_ANON_KEY:\s*'([^']+)'/.exec(src)?.[1];
  if (!url || !key) throw new Error('config.js: brak SUPABASE_URL lub SUPABASE_ANON_KEY');
  return { url, key };
}

async function fetchTable(cfg, table, order = 'id') {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?select=*&order=${order}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

// Mapowanie na kształt data.json — celowo identyczne z loadFromSupabase() w index.html,
// żeby snapshot i odczyt na żywo dawały ten sam wynik co do bajta.
const mapZb = (r) => ({ n: r.n, p: [r.lat, r.lon], ha: r.ha || '—', t: r.t || '', r: r.r || '', a: r.a || 0 });
const mapRiver = (r) => ({ n: r.n, c: r.c, o: r.o, d: r.d, r: r.r, pts: r.pts });
const mapGranica = (r) => ({ n: r.n, p: [r.lat, r.lon], d: r.d });

const vertices = (rivers) => rivers.reduce((s, r) => s + (Array.isArray(r.pts) ? r.pts.length : 0), 0);

function guard(next, prevPath) {
  if (!existsSync(prevPath)) return [];
  let prev;
  try { prev = JSON.parse(readFileSync(prevPath, 'utf8')); } catch { return ['obecny data.json nie jest poprawnym JSON — pomijam porównanie']; }
  const problems = [];
  for (const k of ['zb', 'rivers', 'granice']) {
    const a = prev[k]?.length ?? 0, b = next[k].length;
    if (b < a) problems.push(`${k}: baza ma ${b} wierszy, data.json ma ${a} — ubyło danych`);
  }
  const va = vertices(prev.rivers || []), vb = vertices(next.rivers);
  if (va > 0 && vb < va * 0.7) problems.push(`rzeki: ${vb} wierzchołków wobec ${va} w data.json (spadek >30 %) — geometria mogła zostać cofnięta`);
  return problems;
}

async function main() {
  const cfg = readConfig();
  const t0 = Date.now();
  const [zb, rivers, granice] = await Promise.all([
    fetchTable(cfg, 'zbiorniki'), fetchTable(cfg, 'rivers'), fetchTable(cfg, 'granice'),
  ]);
  const next = {
    zb: zb.map(mapZb),
    rivers: rivers.map(mapRiver),
    granice: granice.map(mapGranica),
    meta: {
      zrodla: {
        tresc: 'Wykaz wód PZW Okręgu w Rzeszowie',
        geometria: 'BDOT10k — Główny Urząd Geodezji i Kartografii (PZGiK)',
        podklad: 'Usługi WMTS Geoportalu (GUGiK)',
      },
      snapshot: new Date().toISOString().slice(0, 19) + 'Z',
      uwaga: 'Dane przestrzenne z PZGiK — bezpłatne do ponownego wykorzystania, wymagane podanie źródła. Wiążący jest oficjalny wykaz wód i zezwolenie.',
    },
  };
  console.log(`Pobrano: ${next.zb.length} zbiorników, ${next.rivers.length} rzek (${vertices(next.rivers)} wierzchołków), ${next.granice.length} granic — ${Date.now() - t0} ms`);

  const problems = guard(next, OUT);
  if (problems.length) {
    console.error('BEZPIECZNIK: eksport wstrzymany.');
    for (const p of problems) console.error('  - ' + p);
    if (!FORCE) { console.error('Jeśli to zamierzone, uruchom z PZW_FORCE=1.'); process.exit(2); }
    console.error('PZW_FORCE=1 — kontynuuję mimo ostrzeżeń.');
  }

  // Porównanie bez pola snapshot, żeby nie commitować samej daty.
  const strip = (o) => JSON.stringify({ ...o, meta: { ...o.meta, snapshot: undefined } });
  let unchanged = false;
  if (existsSync(OUT)) {
    try { unchanged = strip(JSON.parse(readFileSync(OUT, 'utf8'))) === strip(next); } catch { /* nadpisz */ }
  }
  if (unchanged) { console.log('Bez zmian względem data.json — nic do zapisania.'); return; }
  writeFileSync(OUT, JSON.stringify(next) + '\n');
  console.log(`Zapisano ${OUT}`);
}

main().catch((e) => { console.error('BŁĄD:', e.message); process.exit(1); });
