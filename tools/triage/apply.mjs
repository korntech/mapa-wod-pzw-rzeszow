#!/usr/bin/env node
/**
 * Odczytuje odpowiedź modelu, sprawdza ją względem dozwolonych wartości i nadaje etykiety
 * oraz komentarz pod issue. Wartości spoza konfiguracji są odrzucane (model nie może
 * utworzyć dowolnej etykiety ani wykonać innej akcji niż etykieta i komentarz).
 *
 * Użycie: node tools/triage/apply.mjs <odpowiedz.txt> <numer-issue> [--dry-run]
 * Wymaga gh CLI z GITHUB_TOKEN (issues: write) i zmiennej GITHUB_REPOSITORY.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig, gh } from './lib.mjs';

const [responsePath, issueNumber, flag] = process.argv.slice(2);
const dryRun = flag === '--dry-run';
if (!responsePath || !issueNumber) {
  console.error('Użycie: apply.mjs <odpowiedz.txt> <numer-issue> [--dry-run]');
  process.exit(1);
}
const cfg = loadConfig();
const repo = process.env.GITHUB_REPOSITORY;

/** Pierwszy obiekt JSON z odpowiedzi (model bywa gadatliwy mimo instrukcji). */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('brak obiektu JSON w odpowiedzi');
  return JSON.parse(text.slice(start, end + 1));
}

const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function normalize(raw) {
  const kategoria = Object.hasOwn(cfg.etykiety.kategoria, raw.kategoria) ? raw.kategoria : 'inne';
  const pewnosc = Object.hasOwn(cfg.etykiety.pewnosc, raw.pewnosc) ? raw.pewnosc : 'niska';
  const kandydat =
    Number.isInteger(raw.kandydat) && raw.kandydat >= 1 && raw.kandydat <= cfg.maxKandydatow
      ? raw.kandydat
      : null;
  return {
    kategoria,
    pewnosc,
    kandydat,
    streszczenie: text(raw.streszczenie, 300),
    propozycja: text(raw.propozycja, 600),
    uzasadnienie: text(raw.uzasadnienie, 400),
  };
}

function ensureLabel(def) {
  const existing = gh([
    'label',
    'list',
    '--repo',
    repo,
    '--search',
    def.nazwa,
    '--json',
    'name',
    '--jq',
    '.[].name',
  ]);
  if (existing.split('\n').includes(def.nazwa)) return;
  gh([
    'label',
    'create',
    def.nazwa,
    '--repo',
    repo,
    '--color',
    def.kolor,
    '--description',
    def.opis,
    '--force',
  ]);
}

function commentBody(w) {
  const lines = [
    cfg.komentarz.naglowek,
    '',
    `- **Kategoria:** ${cfg.etykiety.kategoria[w.kategoria].nazwa.replace('kategoria: ', '')}`,
    `- **Pewność:** ${cfg.etykiety.pewnosc[w.pewnosc].nazwa.replace('pewność: ', '')}`,
  ];
  if (w.streszczenie) lines.push(`- **Streszczenie:** ${w.streszczenie}`);
  if (w.propozycja) lines.push('', `**Co sprawdzić w panelu:** ${w.propozycja}`);
  if (w.kandydat)
    lines.push(
      '',
      `Wskazany kandydat akwenu: **nr ${w.kandydat}** na liście przy tym zbiorniku w panelu operatora.`
    );
  if (w.uzasadnienie) lines.push('', `_Uzasadnienie:_ ${w.uzasadnienie}`);
  lines.push('', cfg.komentarz.stopka);
  return lines.join('\n') + '\n';
}

let wynik;
try {
  wynik = normalize(extractJson(readFileSync(responsePath, 'utf8')));
} catch (e) {
  wynik = normalize({
    kategoria: 'inne',
    pewnosc: 'niska',
    streszczenie: 'Nie udało się odczytać odpowiedzi modelu.',
  });
  console.error('Odpowiedź modelu nieczytelna:', e.message);
}

const labels = [cfg.etykiety.kategoria[wynik.kategoria], cfg.etykiety.pewnosc[wynik.pewnosc]];
const body = commentBody(wynik);
writeFileSync('triage-komentarz.md', body);
console.log(JSON.stringify(wynik));

if (dryRun) {
  console.log('--dry-run: etykiety', labels.map((l) => l.nazwa).join(', '));
  console.log(body);
  process.exit(0);
}
if (!repo) {
  console.error('Brak GITHUB_REPOSITORY');
  process.exit(1);
}
for (const l of labels) ensureLabel(l);
gh([
  'issue',
  'edit',
  String(issueNumber),
  '--repo',
  repo,
  '--add-label',
  labels.map((l) => l.nazwa).join(','),
]);
gh(['issue', 'comment', String(issueNumber), '--repo', repo, '--body-file', 'triage-komentarz.md']);
console.log(`Issue #${issueNumber}: ${labels.map((l) => l.nazwa).join(', ')}`);
