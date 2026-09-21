#!/usr/bin/env node
/**
 * Walidacja data.json — uruchamiana po eksporcie ze Supabase i przy każdym pushu.
 * Kończy się kodem 1 przy błędzie, żeby workflow nie zacommitował/nie wdrożył
 * uszkodzonych danych. Ostrzeżenia nie blokują.
 *
 * Sprawdza: poprawność JSON i struktury, liczbę wierszy, współrzędne w obrysie
 * Podkarpacia, ciągłość linii rzek (brak skoków > 2 km), brak pustych geometrii,
 * duplikaty nazw zbiorników (ostrzeżenie).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = process.argv[2] || resolve(ROOT, 'public', 'data.json');

// Obrys z zapasem: Okręg PZW Rzeszów leży w lat 49,6–50,5 / lon 21,1–22,8.
const BOX = { lat: [49.0, 51.0], lon: [20.5, 23.6] };
const MIN = { zb: 40, rivers: 20, granice: 10 };

const errors = [], warnings = [];
const inBox = (p) => Array.isArray(p) && p.length === 2 &&
  p[0] >= BOX.lat[0] && p[0] <= BOX.lat[1] && p[1] >= BOX.lon[0] && p[1] <= BOX.lon[1];
const meters = (a, b) => {
  const ky = 111320, kx = 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * ky, (b[1] - a[1]) * kx);
};

let d;
try { d = JSON.parse(readFileSync(FILE, 'utf8')); }
catch (e) { console.error(`BŁĄD: ${FILE} nie jest poprawnym JSON: ${e.message}`); process.exit(1); }

for (const k of ['zb', 'rivers', 'granice']) {
  if (!Array.isArray(d[k])) errors.push(`brak tablicy "${k}"`);
  else if (d[k].length < MIN[k]) errors.push(`"${k}": tylko ${d[k].length} wierszy (minimum ${MIN[k]}) — dane niekompletne`);
}
if (errors.length) { errors.forEach((e) => console.error('BŁĄD: ' + e)); process.exit(1); }

for (const z of d.zb) {
  if (typeof z.n !== 'string' || !z.n.trim()) errors.push('zbiornik bez nazwy');
  if (!inBox(z.p)) errors.push(`zbiornik „${z.n}”: współrzędne poza obrysem: ${JSON.stringify(z.p)}`);
  if (z.a !== 0 && z.a !== 1) errors.push(`zbiornik „${z.n}”: pole a musi być 0 lub 1`);
}
for (const g of d.granice) {
  if (!inBox(g.p)) errors.push(`granica „${g.n}”: współrzędne poza obrysem`);
}
for (const r of d.rivers) {
  if (!Array.isArray(r.pts) || r.pts.length < 2) { errors.push(`rzeka „${r.n}”: pusta geometria`); continue; }
  if (!['niz', 'gor'].includes(r.c)) errors.push(`rzeka „${r.n}”: kraina „${r.c}” (oczekiwane niz/gor)`);
  for (let i = 0; i < r.pts.length; i++) {
    if (!inBox(r.pts[i])) { errors.push(`rzeka „${r.n}”: wierzchołek ${i} poza obrysem`); break; }
    if (i > 0 && meters(r.pts[i - 1], r.pts[i]) > 2000) { errors.push(`rzeka „${r.n}”: skok ${Math.round(meters(r.pts[i - 1], r.pts[i]))} m przy wierzchołku ${i} — linia nieciągła`); break; }
  }
}
const names = new Map();
for (const z of d.zb) names.set(z.n, (names.get(z.n) || 0) + 1);
for (const [n, c] of names) if (c > 1) warnings.push(`zduplikowana nazwa zbiornika: „${n}” ×${c}`);

const verts = d.rivers.reduce((s, r) => s + r.pts.length, 0);
console.log(`data.json: ${d.zb.length} zbiorników (${d.zb.filter((z) => z.a === 1).length} przybliżonych), ${d.rivers.length} rzek (${verts} wierzchołków), ${d.granice.length} granic`);
warnings.forEach((w) => console.warn('OSTRZEŻENIE: ' + w));
if (errors.length) { errors.forEach((e) => console.error('BŁĄD: ' + e)); process.exit(1); }
console.log('Walidacja OK.');
