#!/usr/bin/env node
/**
 * Walidacja pliku snapshotu. Kod wyjścia 1 przy błędzie; ostrzeżenia nie blokują.
 *
 * Sprawdza strukturę, minimalną liczbę wierszy, położenie współrzędnych w obrysie,
 * ciągłość linii rzek i duplikaty nazw zbiorników (parametry: config.json → snapshot).
 *
 * Użycie: node tools/snapshot/validate.mjs [ścieżka-do-pliku]
 */
import { readFileSync } from 'node:fs';
import { loadConfig, snapshotPath } from './config.mjs';

const config = loadConfig();
const FILE = process.argv[2] || snapshotPath(config);
const { bbox, minRows, maxSegmentMeters } = config.snapshot;

const errors = [];
const warnings = [];

const inBox = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
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
  data = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`BŁĄD: ${FILE} nie jest poprawnym JSON: ${e.message}`);
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
  if (typeof z.n !== 'string' || !z.n.trim()) errors.push('zbiornik bez nazwy');
  if (!inBox(z.p)) errors.push(`zbiornik „${z.n}”: współrzędne poza obrysem: ${JSON.stringify(z.p)}`);
  if (z.a !== 0 && z.a !== 1) errors.push(`zbiornik „${z.n}”: pole a musi być 0 lub 1`);
}
for (const g of data.granice) {
  if (!inBox(g.p)) errors.push(`granica „${g.n}”: współrzędne poza obrysem`);
}
for (const r of data.rivers) {
  if (!Array.isArray(r.pts) || r.pts.length < 2) {
    errors.push(`rzeka „${r.n}”: pusta geometria`);
    continue;
  }
  if (!['niz', 'gor'].includes(r.c)) errors.push(`rzeka „${r.n}”: kraina „${r.c}” (oczekiwane niz/gor)`);
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
