/* Linki do pojedynczych łowisk: adres …/#w=<id>, gdzie id pochodzi z nazwy (stabilne przy zmianie
 * kolejności danych, czytelne w udostępnionym linku). */

const PREFIKS = '#w=';

/** Nazwa → fragment adresu: małe litery bez polskich znaków, słowa rozdzielone myślnikiem. */
export function slug(tekst) {
  return String(tekst)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Nadaje wpisom unikalne id: prefiks rodzaju + nazwa (+ obwód dla odcinków o tej samej nazwie);
 * gdyby i to się powtórzyło, kolejny numer. Zwraca mapę id → wpis.
 * @param {{ f: string, name: string, baseName?: string, obwod?: string }[]} wpisy
 */
export function nadajId(wpisy) {
  const prefiks = { zb: 'zb', niz: 'rz', gor: 'rz', gr: 'gr' };
  const ile = {};
  for (const w of wpisy) {
    const k = prefiks[w.f] + ':' + slug(w.baseName || w.name);
    ile[k] = (ile[k] || 0) + 1;
  }
  const wynik = new Map();
  for (const w of wpisy) {
    const nazwa = slug(w.baseName || w.name);
    let id = `${prefiks[w.f]}-${nazwa}`;
    if (ile[prefiks[w.f] + ':' + nazwa] > 1 && w.obwod) id += '-' + slug(w.obwod);
    let kandydat = id;
    for (let n = 2; wynik.has(kandydat); n++) kandydat = `${id}-${n}`;
    w.id = kandydat;
    wynik.set(kandydat, w);
  }
  return wynik;
}

/** Id łowiska z fragmentu adresu albo null. */
export function idZHasha(hash) {
  if (!hash || !hash.startsWith(PREFIKS)) return null;
  try {
    return decodeURIComponent(hash.slice(PREFIKS.length)) || null;
  } catch {
    return null;
  }
}

export const hashDlaId = (id) => PREFIKS + encodeURIComponent(id);
