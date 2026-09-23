/* Rodzaj zbiornika i flaga NO-KILL — słownik wspólny dla mapy, panelu operatora,
 * wykazu do druku i skryptów snapshotu (tools/snapshot). Bez zależności od Vite. */

/** Rodzaje zbiorników (klucz w danych → etykieta). Kolejność = kolejność w filtrach. */
export const RODZAJE = {
  zaporowy: 'Zbiorniki zaporowe',
  pozwirowy: 'Wyrobiska pożwirowe',
  staw: 'Stawy',
  inny: 'Inne zbiorniki',
};

export const RODZAJE_KLUCZE = Object.keys(RODZAJE);

/** Etykieta rodzaju w liczbie pojedynczej (do popupu i wykazu). */
export const RODZAJ_NAZWA = {
  zaporowy: 'zaporowy',
  pozwirowy: 'pożwirowy',
  staw: 'staw',
  inny: 'inny',
};

const bezOgonkow = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

/** Rodzaj zbiornika wyprowadzony z opisu typu z wykazu (pole `t`). */
export function rodzajZOpisu(t) {
  const s = bezOgonkow(t);
  if (s.includes('zaporow')) return 'zaporowy';
  if (s.includes('zwir') || s.includes('wyrobisk')) return 'pozwirowy';
  if (s.includes('staw')) return 'staw';
  return 'inny';
}

/** Czy opis typu lub nazwa wskazuje łowisko NO-KILL. */
export function noKillZOpisu(t, n) {
  return /no[\s-]?kill/i.test(`${t || ''} ${n || ''}`);
}

/** Poprawny klucz rodzaju albo wyprowadzenie z opisu, gdy brak/nieznany. */
export function rodzajZbiornika(k, t) {
  return RODZAJE_KLUCZE.includes(k) ? k : rodzajZOpisu(t);
}
