/* Scalanie snapshotu z kolekcjami odczytanymi z bazy (bez zależności — testowane w Node). */

export const COLLECTIONS = ['zb', 'rivers', 'granice'];

/** Zawartość kolekcji niezależnie od kolejności (baza sortuje inaczej niż eksport snapshotu). */
const zawartosc = (lista) =>
  (lista || [])
    .map((x) => JSON.stringify(x))
    .sort()
    .join('\n');

/** Snapshot nadpisany niepustymi kolekcjami z bazy. `zmienione` — baza różni się od snapshotu treścią;
 *  `zBazy` — wszystkie kolekcje pochodzą z bazy (dane bieżące). */
export function polaczDane(snapshot, live) {
  const data = { ...snapshot };
  let zmienione = false;
  for (const key of COLLECTIONS) {
    if (!live[key] || !live[key].length) continue;
    // Te same dane w innej kolejności — zostaje kolejność snapshotu (bez zbędnego przerysowania).
    if (zawartosc(live[key]) === zawartosc(snapshot[key])) continue;
    zmienione = true;
    data[key] = live[key];
  }
  const zBazy = COLLECTIONS.every((key) => live[key] && live[key].length);
  return { data, zmienione, zBazy };
}
