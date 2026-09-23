/* Filtry mapy publicznej — czysta logika bez DOM i Leaflet (testowalna w Node). */
import { RODZAJE } from './zbiorniki-typ.js';

/** Stan filtrów mapy publicznej. */
export function createFilters() {
  return {
    active: new Set(['zb', 'niz', 'gor']), // warstwy
    kinds: new Set(Object.keys(RODZAJE)), // rodzaje zbiorników
    nokillOnly: false, // tylko łowiska NO-KILL
    obwod: '', // obwód rybacki ('' = wszystkie)
  };
}

/** Czy wpis przechodzi przez filtry (bez wyszukiwarki). */
export function passesFilters(e, f) {
  if (!f.active.has(e.f)) return false;
  if (e.f === 'zb') {
    if (!f.kinds.has(e.kind)) return false;
    if (f.nokillOnly && !e.nokill) return false;
  }
  if (f.obwod && (e.f === 'zb' || e.f === 'niz' || e.f === 'gor') && e.obwod !== f.obwod) return false;
  return true;
}

/** Lista obwodów rybackich występujących w danych, posortowana po polsku. */
export function obwodyList(entries) {
  const set = new Set(entries.map((e) => e.obwod).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }));
}

/** Czy filtry dodatkowe różnią się od domyślnych. */
export function extraFiltersActive(f) {
  return f.kinds.size !== Object.keys(RODZAJE).length || f.nokillOnly || !!f.obwod;
}
