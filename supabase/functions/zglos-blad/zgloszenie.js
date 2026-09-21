/* Walidacja zgłoszenia błędu i treść issue na GitHubie. Moduł bez zależności,
 * współdzielony przez stronę (podgląd i link zapasowy) i funkcję Supabase. */

export const LIMITY = { opisMin: 10, opisMax: 2000, kontaktMax: 200, nazwaMax: 200, naGodzine: 5 };

export const TYPY = { zb: 'zbiornik', rzeka: 'rzeka' };

const tekst = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Sprawdza dane z formularza; zwraca { ok, report } albo { ok: false, error } z nazwą pola. */
export function validateReport(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'typ' };
  if (!(input.typ in TYPY)) return { ok: false, error: 'typ' };
  if (tekst(input.www, 1)) return { ok: false, error: 'spam' };
  const nazwa = tekst(input.nazwa, LIMITY.nazwaMax);
  if (!nazwa) return { ok: false, error: 'nazwa' };
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: 'wspolrzedne' };
  }
  const opis = tekst(input.opis, LIMITY.opisMax + 1);
  if (opis.length < LIMITY.opisMin || opis.length > LIMITY.opisMax) return { ok: false, error: 'opis' };
  const kontakt = tekst(input.kontakt, LIMITY.kontaktMax);
  const round = (x) => Math.round(x * 1e6) / 1e6;
  return { ok: true, report: { typ: input.typ, nazwa, lat: round(lat), lon: round(lon), opis, kontakt } };
}

/* Tekst użytkownika trafia do bloku cytatu z wyłączonym HTML, więc nie zmienia struktury issue. */
const cytat = (s) =>
  s
    .replace(/</g, '&lt;')
    .split('\n')
    .map((line) => '> ' + line.replace(/^(\s*)([#>*+-]|\d+\.)(\s)/, '$1\\$2$3'))
    .join('\n');

/** Tytuł i treść issue dla zgłoszenia; mapUrl to adres publicznej mapy. */
export function issueContent(report, mapUrl) {
  const lines = [
    `**Woda:** ${report.nazwa} (${TYPY[report.typ]})`,
    `**Współrzędne:** ${report.lat}, ${report.lon}`,
  ];
  if (report.kontakt) lines.push(`**Kontakt:** ${cytat(report.kontakt).slice(2)}`);
  lines.push('', '**Opis zgłoszenia:**', '', cytat(report.opis), '', `_Zgłoszono z formularza na mapie: ${mapUrl}_`);
  return { title: `Zgłoszenie: ${report.nazwa}`, body: lines.join('\n') };
}
