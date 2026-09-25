/* Walidacja zgłoszenia z mapy i treść issue na GitHubie. Moduł bez zależności,
 * współdzielony przez stronę (podgląd i link zapasowy) i funkcję Supabase. */

export const LIMITY = {
  opisMin: 10,
  opisMax: 2000,
  /** Nazwa wpisana ręcznie przy typie „inne”; nazwy z listy są zawsze dłuższe. */
  nazwaMin: 2,
  nazwaMax: 200,
  naGodzine: 5,
  lacznieNaGodzine: 20,
  lacznieNaDobe: 60,
  retencjaDni: 30,
  /** Maksymalny rozmiar treści żądania (bajty) — sprawdzany przed parsowaniem JSON. */
  bodyBajty: 16 * 1024,
};

/* „zb” i „rzeka” to pozycje z listy na mapie (nazwa i współrzędne z danych);
 * „inne” to brakujące łowisko albo uwaga ogólna — nazwę wpisuje zgłaszający, współrzędnych brak. */
export const TYPY = { zb: 'zbiornik', rzeka: 'rzeka', inne: 'inne' };

/** Jedyne dozwolone pola wejścia; każde inne oznacza odrzucenie (ścisły schemat).
 *  „kontakt” jest przyjmowany, ale ignorowany: formularz już go nie ma (od 25.09.2026 nie zbieramy
 *  danych kontaktowych), a strona z pamięci podręcznej przeglądarki może jeszcze wysłać puste pole. */
const POLA = new Set(['typ', 'nazwa', 'lat', 'lon', 'opis', 'kontakt', 'www']);

const tekst = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const brak = (v) => v === null || v === undefined || v === '';
/** Współrzędna z liczby albo niepustego napisu; wszystko inne (w tym '' → 0) to NaN. */
const liczba = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

/** Sprawdza dane z formularza; zwraca { ok, report } albo { ok: false, error } z nazwą pola. */
export function validateReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'typ' };
  // Tylko własne pola obiektu: „constructor” czy „__proto__” nie są typem wody.
  for (const key of Object.keys(input)) if (!POLA.has(key)) return { ok: false, error: 'schemat' };
  if (typeof input.typ !== 'string' || !Object.hasOwn(TYPY, input.typ)) return { ok: false, error: 'typ' };
  if (tekst(input.www, 1)) return { ok: false, error: 'spam' };
  // Nazwa w jednej linii: przy „inne” pochodzi od użytkownika i trafia do issue poza blokiem kodu.
  const nazwa = tekst(input.nazwa, LIMITY.nazwaMax).replace(/\s+/g, ' ').trim();
  if (!nazwa || (input.typ === 'inne' && nazwa.length < LIMITY.nazwaMin))
    return { ok: false, error: 'nazwa' };
  // Współrzędne: dla wody z listy wymagane; dla „inne” opcjonalne (obie puste → null),
  // ale jeśli podane, muszą być poprawne.
  let lat = null;
  let lon = null;
  if (input.typ !== 'inne' || !brak(input.lat) || !brak(input.lon)) {
    lat = liczba(input.lat);
    lon = liczba(input.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return { ok: false, error: 'wspolrzedne' };
    }
    const round = (x) => Math.round(x * 1e6) / 1e6;
    lat = round(lat);
    lon = round(lon);
  }
  const opis = tekst(input.opis, LIMITY.opisMax + 1);
  if (opis.length < LIMITY.opisMin || opis.length > LIMITY.opisMax) return { ok: false, error: 'opis' };
  return { ok: true, report: { typ: input.typ, nazwa, lat, lon, opis } };
}

/* Tekst użytkownika trafia do ogrodzonego bloku kodu: GitHub nie interpretuje w nim Markdown,
 * HTML, linków ani wzmianek @użytkownik (brak powiadomień). Ogrodzenie jest dłuższe niż
 * najdłuższy ciąg odwrotnych apostrofów w tekście, więc treść nie może go zamknąć. */
export function blokKodu(s) {
  // Najpierw normalizacja końców linii (CRLF, CR, NEL, LS, PS → LF), potem długość ogrodzenia:
  // liczona na tym samym tekście, który trafia do bloku.
  const tekst = String(s ?? '').replace(/\r\n|\r|\u0085|\u{2028}|\u{2029}/gu, '\n');
  const runs = tekst.match(/`+/g) || [];
  const dlugosc = Math.max(3, ...runs.map((r) => r.length + 1));
  const plot = '`'.repeat(dlugosc);
  return `${plot}text\n${tekst}\n${plot}`;
}

/** Nazwa bez znaków Markdown, wzmianek i odwołań (# i @) — do tytułu i linii „Woda”. */
const czystaNazwa = (nazwa) => nazwa.replace(/[`*_~[\]<>#@]/g, '').trim() || '(bez nazwy)';

/** Tytuł i treść issue dla zgłoszenia; mapUrl to adres publicznej mapy.
 *  Nazwa w treści jest w kodzie liniowym (odwrotne apostrofy usunięte, więc nie da się go zamknąć):
 *  przy typie „inne” to tekst użytkownika, a w kodzie GitHub nie tworzy linków ani wzmianek. */
export function issueContent(report, mapUrl) {
  const lines = [`**Woda:** \`${czystaNazwa(report.nazwa)}\` (${TYPY[report.typ]})`];
  if (report.lat != null && report.lon != null) lines.push(`**Współrzędne:** ${report.lat}, ${report.lon}`);
  lines.push(
    '',
    '**Opis zgłoszenia:**',
    '',
    blokKodu(report.opis),
    '',
    `_Zgłoszono z formularza na mapie: ${mapUrl}_`
  );
  return { title: `Zgłoszenie: ${czystaNazwa(report.nazwa)}`, body: lines.join('\n') };
}
