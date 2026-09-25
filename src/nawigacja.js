/* Nawigacja do łowiska: wybór aplikacji (config.json → links.navigation) zapamiętany w przeglądarce. */

const KLUCZ = 'pzw-nawigacja';

/** Adres nawigacji w danej aplikacji do punktu [lat, lon] z nazwą celu. */
export function adresNawigacji(aplikacja, [lat, lon], nazwa) {
  return aplikacja.url
    .replaceAll('{lat}', lat)
    .replaceAll('{lon}', lon)
    .replaceAll('{name}', encodeURIComponent(nazwa));
}

/** Aplikacje dostępne na tym urządzeniu (adres geo: tylko na Androidzie). */
export function aplikacjeNaUrzadzeniu(aplikacje, userAgent) {
  const android = /android/i.test(userAgent);
  return aplikacje.filter((a) => android || !a.tylkoAndroid);
}

/** Zapamiętana aplikacja albo null (brak wyboru, brak dostępu do localStorage, aplikacja już nieobsługiwana). */
export function zapamietana(aplikacje) {
  try {
    const id = localStorage.getItem(KLUCZ);
    return aplikacje.find((a) => a.id === id) || null;
  } catch {
    return null;
  }
}

export function zapamietaj(id) {
  try {
    if (id) localStorage.setItem(KLUCZ, id);
    else localStorage.removeItem(KLUCZ);
  } catch {
    /* tryb prywatny — wybór obowiązuje tylko do przeładowania */
  }
}
