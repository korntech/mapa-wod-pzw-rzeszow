/* Walidacja zgłoszenia błędu i treść issue na GitHubie. Moduł bez zależności,
 * współdzielony przez stronę (podgląd i link zapasowy) i funkcję Supabase. */

export const LIMITY = {
  opisMin: 10,
  opisMax: 2000,
  kontaktMax: 200,
  nazwaMax: 200,
  naGodzine: 5,
  lacznieNaGodzine: 20,
  lacznieNaDobe: 60,
  retencjaDni: 30,
  /** Maksymalny rozmiar treści żądania (bajty) — sprawdzany przed parsowaniem JSON. */
  bodyBajty: 16 * 1024,
};

export const TYPY = { zb: 'zbiornik', rzeka: 'rzeka' };

/** Jedyne dozwolone pola wejścia; każde inne oznacza odrzucenie (ścisły schemat). */
const POLA = new Set(['typ', 'nazwa', 'lat', 'lon', 'opis', 'kontakt', 'www']);

const tekst = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Sprawdza dane z formularza; zwraca { ok, report } albo { ok: false, error } z nazwą pola. */
export function validateReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'typ' };
  // Tylko własne pola obiektu: „constructor” czy „__proto__” nie są typem wody.
  for (const key of Object.keys(input)) if (!POLA.has(key)) return { ok: false, error: 'schemat' };
  if (typeof input.typ !== 'string' || !Object.hasOwn(TYPY, input.typ)) return { ok: false, error: 'typ' };
  if (tekst(input.www, 1)) return { ok: false, error: 'spam' };
  const nazwa = tekst(input.nazwa, LIMITY.nazwaMax);
  if (!nazwa) return { ok: false, error: 'nazwa' };
  const lat = typeof input.lat === 'number' || typeof input.lat === 'string' ? Number(input.lat) : NaN;
  const lon = typeof input.lon === 'number' || typeof input.lon === 'string' ? Number(input.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: 'wspolrzedne' };
  }
  const opis = tekst(input.opis, LIMITY.opisMax + 1);
  if (opis.length < LIMITY.opisMin || opis.length > LIMITY.opisMax) return { ok: false, error: 'opis' };
  const kontakt = tekst(input.kontakt, LIMITY.kontaktMax);
  const round = (x) => Math.round(x * 1e6) / 1e6;
  return { ok: true, report: { typ: input.typ, nazwa, lat: round(lat), lon: round(lon), opis, kontakt } };
}

/* Tekst użytkownika trafia do ogrodzonego bloku kodu: GitHub nie interpretuje w nim Markdown,
 * HTML, linków ani wzmianek @użytkownik (brak powiadomień). Ogrodzenie jest dłuższe niż
 * najdłuższy ciąg odwrotnych apostrofów w tekście, więc treść nie może go zamknąć. */
export function blokKodu(s) {
  // Najpierw normalizacja końców linii (CRLF, CR, NEL, LS, PS → LF), potem długość ogrodzenia:
  // liczona na tym samym tekście, który trafia do bloku.
  const tekst = String(s ?? '').replace(/\r\n|\r|\u0085|\u2028|\u2029/g, '\n');
  const runs = tekst.match(/`+/g) || [];
  const dlugosc = Math.max(3, ...runs.map((r) => r.length + 1));
  const plot = '`'.repeat(dlugosc);
  return `${plot}text\n${tekst}\n${plot}`;
}

/** Tytuł i treść issue dla zgłoszenia; mapUrl to adres publicznej mapy, id — numer wpisu w bazie.
 *  Kontakt nie jest publikowany: zostaje w bazie Okręgu (retencja jak dla adresu IP). */
export function issueContent(report, mapUrl, id) {
  const lines = [
    `**Woda:** ${report.nazwa.replace(/[`*_~[\]<>]/g, '')} (${TYPY[report.typ]})`,
    `**Współrzędne:** ${report.lat}, ${report.lon}`,
  ];
  if (report.kontakt) {
    lines.push(`**Kontakt:** podany — dostępny operatorom w bazie${id ? ` (wpis nr ${id})` : ''}`);
  }
  lines.push(
    '',
    '**Opis zgłoszenia:**',
    '',
    blokKodu(report.opis),
    '',
    `_Zgłoszono z formularza na mapie: ${mapUrl}_`
  );
  return { title: `Zgłoszenie: ${report.nazwa.replace(/[`*_~[\]<>#@]/g, '')}`, body: lines.join('\n') };
}
