#!/usr/bin/env node
/**
 * Walidacja pliku snapshotu. Kod wyjścia 1 przy błędzie; ostrzeżenia nie blokują.
 *
 * Sprawdza strukturę, minimalną liczbę wierszy, typy i długości pól tekstowych,
 * położenie współrzędnych w obrysie, ciągłość linii rzek i duplikaty nazw zbiorników
 * (parametry: config.json → snapshot). Limity długości odpowiadają ograniczeniom CHECK
 * w bazie (supabase/migrations/), aby snapshot nie przeniósł do
 * repozytorium i na stronę danych, których baza nie powinna była przyjąć.
 *
 * Użycie: node tools/snapshot/validate.mjs [ścieżka-do-pliku]
 */
import { readFileSync } from 'node:fs';
import { loadConfig, snapshotPath } from './config.mjs';
import { RODZAJE_KLUCZE } from '../../src/zbiorniki-typ.js';

const config = loadConfig();
const FILE = process.argv[2] || snapshotPath(config);
const { bbox, minRows, maxSegmentMeters } = config.snapshot;

/* Limity długości pól, liczby wierzchołków i rozmiaru pliku — config.json → snapshot.limits. */
const LIMITS = config.snapshot.limits;
const MAX_FILE_BYTES = LIMITS.fileBytes;

const errors = [];
const warnings = [];

/** Pole tekstowe: łańcuch o długości w limicie (puste dozwolone, gdy required = false). */
function checkText(label, obj, field, required = false) {
  const v = obj[field];
  if (typeof v !== 'string') {
    errors.push(`${label}: pole „${field}” nie jest tekstem`);
    return;
  }
  if (required && !v.trim()) errors.push(`${label}: puste pole „${field}”`);
  if (v.length > LIMITS[field])
    errors.push(`${label}: pole „${field}” ma ${v.length} znaków (limit ${LIMITS[field]})`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
    errors.push(`${label}: znaki sterujące w polu „${field}”`);
}

const inBox = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  p[0] >= bbox.lat[0] &&
  p[0] <= bbox.lat[1] &&
  p[1] >= bbox.lon[0] &&
  p[1] <= bbox.lon[1];

const meters = (a, b) => {
  const ky = 111320;
  const kx = 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * ky, (b[1] - a[1]) * kx);
};

let data;
try {
  const raw = readFileSync(FILE, 'utf8');
  if (Buffer.byteLength(raw) > MAX_FILE_BYTES) {
    console.error(`BŁĄD: ${FILE} ma ${Buffer.byteLength(raw)} bajtów (limit ${MAX_FILE_BYTES})`);
    process.exit(1);
  }
  data = JSON.parse(raw);
} catch (e) {
  console.error(`BŁĄD: ${FILE} nie jest poprawnym JSON: ${e.message}`);
  process.exit(1);
}
if (!data || typeof data !== 'object' || Array.isArray(data)) {
  console.error(`BŁĄD: ${FILE} nie zawiera obiektu snapshotu`);
  process.exit(1);
}

for (const k of ['zb', 'rivers', 'granice']) {
  if (!Array.isArray(data[k])) errors.push(`brak tablicy "${k}"`);
  else if (data[k].length < minRows[k])
    errors.push(`"${k}": tylko ${data[k].length} wierszy (minimum ${minRows[k]})`);
}
if (errors.length) {
  errors.forEach((e) => console.error('BŁĄD: ' + e));
  process.exit(1);
}

for (const z of data.zb) {
  const label = `zbiornik „${z.n}”`;
  checkText(label, z, 'n', true);
  checkText(label, z, 't');
  checkText(label, z, 'ha');
  checkText(label, z, 'o');
  checkText(label, z, 'r');
  if (!RODZAJE_KLUCZE.includes(z.k))
    errors.push(`${label}: rodzaj „${z.k}” (oczekiwane ${RODZAJE_KLUCZE.join('/')})`);
  if (z.nk !== 0 && z.nk !== 1) errors.push(`${label}: pole nk musi być 0 lub 1`);
  if (!inBox(z.p)) errors.push(`${label}: współrzędne poza obrysem: ${JSON.stringify(z.p)}`);
  if (z.a !== 0 && z.a !== 1) errors.push(`${label}: pole a musi być 0 lub 1`);
}
for (const g of data.granice) {
  const label = `granica „${g.n}”`;
  checkText(label, g, 'n', true);
  checkText(label, g, 'd');
  if (!inBox(g.p)) errors.push(`${label}: współrzędne poza obrysem`);
}
for (const r of data.rivers) {
  const label = `rzeka „${r.n}”`;
  checkText(label, r, 'n', true);
  checkText(label, r, 'o');
  checkText(label, r, 'd');
  checkText(label, r, 'r');
  if (!Array.isArray(r.pts) || r.pts.length < 2) {
    errors.push(`${label}: pusta geometria`);
    continue;
  }
  if (r.pts.length > LIMITS.pts) errors.push(`${label}: ${r.pts.length} wierzchołków (limit ${LIMITS.pts})`);
  if (!['niz', 'gor'].includes(r.c)) errors.push(`${label}: kraina „${r.c}” (oczekiwane niz/gor)`);
  for (let i = 0; i < r.pts.length; i++) {
    if (!inBox(r.pts[i])) {
      errors.push(`rzeka „${r.n}”: wierzchołek ${i} poza obrysem`);
      break;
    }
    if (i > 0 && meters(r.pts[i - 1], r.pts[i]) > maxSegmentMeters) {
      errors.push(
        `rzeka „${r.n}”: skok ${Math.round(meters(r.pts[i - 1], r.pts[i]))} m przy wierzchołku ${i}`
      );
      break;
    }
  }
}

const names = new Map();
for (const z of data.zb) names.set(z.n, (names.get(z.n) || 0) + 1);
for (const [n, c] of names) if (c > 1) warnings.push(`zduplikowana nazwa zbiornika: „${n}” ×${c}`);

const vertices = data.rivers.reduce((s, r) => s + r.pts.length, 0);
console.log(
  `${FILE}: ${data.zb.length} zbiorników (${data.zb.filter((z) => z.a === 1).length} przybliżonych), ${data.rivers.length} rzek (${vertices} wierzchołków), ${data.granice.length} granic`
);
warnings.forEach((w) => console.warn('OSTRZEŻENIE: ' + w));
if (errors.length) {
  errors.forEach((e) => console.error('BŁĄD: ' + e));
  process.exit(1);
}
console.log('Walidacja OK.');
