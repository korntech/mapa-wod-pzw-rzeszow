/* Obliczenia geograficzne na współrzędnych [lat, lon] w stopniach. */

const EARTH_RADIUS_KM = 6371;

/** Odległość po ortodromie między dwoma punktami [km]. */
export function distanceKm(a, b) {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Długość łamanej [km]. */
export function lengthKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceKm(points[i - 1], points[i]);
  return total;
}

/** Współrzędne w zapisie dziesiętnym z oznaczeniem półkuli, np. „50.00492 N, 21.95819 E”. */
export function formatLatLon([lat, lon], digits = 5) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)} ${ns}, ${Math.abs(lon).toFixed(digits)} ${ew}`;
}
