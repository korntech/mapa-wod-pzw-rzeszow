/* Scalanie snapshotu z kolekcjami odczytanymi z bazy (bez zależności — testowane w Node). */

export const COLLECTIONS = ['zb', 'rivers', 'granice'];

/** Snapshot nadpisany niepustymi kolekcjami z bazy. `zmienione` — baza różni się od snapshotu;
 *  `zBazy` — wszystkie kolekcje pochodzą z bazy (dane bieżące). */
export function polaczDane(snapshot, live) {
  const data = { ...snapshot };
  let zmienione = false;
  for (const key of COLLECTIONS) {
    if (!live[key] || !live[key].length) continue;
    if (JSON.stringify(live[key]) !== JSON.stringify(snapshot[key])) zmienione = true;
    data[key] = live[key];
  }
  const zBazy = COLLECTIONS.every((key) => live[key] && live[key].length);
  return { data, zmienione, zBazy };
}
