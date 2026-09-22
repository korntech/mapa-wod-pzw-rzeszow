/* Wspólne funkcje triage'u zgłoszeń: konfiguracja, dane mapy, geometria, wywołania gh. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, 'tools', 'triage', 'config.json'), 'utf8'));
}

export function loadAppConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
}

/** Snapshot i kandydaci akwenów z katalogu public/. */
export function loadMapData() {
  const app = loadAppConfig();
  const data = JSON.parse(readFileSync(resolve(ROOT, 'public', app.snapshot.file), 'utf8'));
  let candidates = {};
  try {
    const k = JSON.parse(readFileSync(resolve(ROOT, 'public', app.snapshot.candidatesFile), 'utf8'));
    for (const w of k.wyniki || []) if (typeof w.nazwa === 'string') candidates[w.nazwa] = w.kandydaci || [];
  } catch {
    candidates = {};
  }
  return { data, candidates };
}

/** Pola „Woda” i „Współrzędne” z treści issue założonego przez formularz. */
export function parseIssueBody(body) {
  const text = String(body || '');
  const woda = /\*\*Woda:\*\*\s*(.+?)\s*\((zbiornik|rzeka)\)/.exec(text);
  const wsp = /\*\*Współrzędne:\*\*\s*([-\d.]+),\s*([-\d.]+)/.exec(text);
  return {
    nazwa: woda ? woda[1].trim() : null,
    typ: woda ? woda[2] : null,
    lat: wsp ? Number(wsp[1]) : null,
    lon: wsp ? Number(wsp[2]) : null,
  };
}

/** Kierunek geograficzny z punktu a do b (8 kierunków, po polsku). */
export function direction(a, b) {
  const dLat = b[0] - a[0];
  const dLon = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  const deg = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
  const names = [
    'północ',
    'północny wschód',
    'wschód',
    'południowy wschód',
    'południe',
    'południowy zachód',
    'zachód',
    'północny zachód',
  ];
  return names[Math.round(deg / 45) % 8];
}

/** Wywołanie gh CLI bez powłoki; argumenty przekazywane jako tablica. */
export function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}
