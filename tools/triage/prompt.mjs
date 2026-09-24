#!/usr/bin/env node
/**
 * Buduje prompt klasyfikacji zgłoszenia: treść issue + aktualny rekord z mapy + kandydaci akwenów.
 *
 * Użycie: node tools/triage/prompt.mjs <issue.json> <katalog-wyjściowy>
 *   issue.json — odpowiedź `gh api repos/{owner}/{repo}/issues/{n}`
 *   zapisuje <katalog>/system.txt i <katalog>/prompt.txt
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, loadMapData, parseIssueBody, direction } from './lib.mjs';

const [issuePath, outDir] = process.argv.slice(2);
if (!issuePath || !outDir) {
  console.error('Użycie: prompt.mjs <issue.json> <katalog-wyjściowy>');
  process.exit(1);
}

const cfg = loadConfig();
const issue = JSON.parse(readFileSync(issuePath, 'utf8'));
const { data, candidates } = loadMapData();
const ref = parseIssueBody(issue.body);

function findRecord() {
  if (!ref.nazwa) return null;
  if (ref.typ === 'zbiornik') return data.zb.find((z) => z.n === ref.nazwa) || null;
  if (ref.typ === 'rzeka') {
    const r = data.rivers.find((x) => x.n === ref.nazwa);
    return r
      ? { ...r, pts: `${r.pts.length} wierzchołków, początek ${r.pts[0]}, koniec ${r.pts[r.pts.length - 1]}` }
      : null;
  }
  return null;
}

function describeCandidates(record) {
  if (!record || ref.typ !== 'zbiornik') return 'nie dotyczy';
  const list = Object.hasOwn(candidates, record.n) ? candidates[record.n] : [];
  if (!list.length)
    return 'brak (lokalizacja nie jest oznaczona jako przybliżona albo nie znaleziono akwenów)';
  return list
    .slice(0, cfg.maxKandydatow)
    .map((k, i) => {
      const nazwa = k.nazwa_bdot || 'bez nazwy';
      return `${i + 1}. ${nazwa}: ${k.ha.toFixed(2)} ha, ${Math.round(k.odleglosc_m)} m na ${direction(record.p, [k.lat, k.lon])}, ocena ${Math.round(k.ocena)}`;
    })
    .join('\n');
}

const record = findRecord();
// Typ „inne” (brakujące łowisko albo uwaga ogólna) z założenia nie ma rekordu na mapie.
const brakRekordu =
  ref.typ === 'inne'
    ? 'nie dotyczy — zgłoszenie typu „inne” (brakujące łowisko lub uwaga ogólna), bez rekordu na mapie'
    : 'nie znaleziono rekordu o tej nazwie';
const fill = (t) =>
  t
    .replace('{tytul}', String(issue.title || '').slice(0, 300))
    .replace('{tresc}', String(issue.body || '').slice(0, cfg.maxTresci))
    .replace('{rekord}', record ? JSON.stringify(record, null, 1) : brakRekordu)
    .replace('{kandydaci}', describeCandidates(record));

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'system.txt'), cfg.prompt.system + '\n');
writeFileSync(resolve(outDir, 'prompt.txt'), fill(cfg.prompt.user) + '\n');
console.log(
  `Prompt dla issue #${issue.number} (${ref.typ || 'brak typu'}: ${ref.nazwa || '?'}) zapisany w ${outDir}`
);
