/* Podkłady mapowe z usług WMTS zdefiniowanych w config.json (sekcja basemaps). */
import L from 'leaflet';
import { BASEMAPS } from './config.js';
import { CRS_CODE, TILE_SIZE, ZOOM } from './crs.js';

const { attribution, layers, fallbackAfterErrors, fallbackNotice } = BASEMAPS;
/** Źródło kafli: własny cache (Cloudflare Worker + R2, cloudflare/kafle/), gdy skonfigurowany,
 *  inaczej Geoportal bezpośrednio. Adresy mają tę samą strukturę, więc reszta kodu tego nie widzi. */
const serviceUrl = BASEMAPS.kafleUrl || BASEMAPS.serviceUrl;

export const ATTRIBUTION = `<a href="${attribution.url}" target="_blank" rel="noopener noreferrer">${attribution.text}</a>`;

/** Opóźnienia kolejnych prób wczytania kafla po błędzie (Geoportal bywa chwilowo niedostępny —
 *  pojedyncze żądania kończą się HTTP 500 i bez ponowienia kafel zostałby pusty). */
export const RETRY_DELAYS_MS = [700, 2000];

/** Adres kafla WMTS 1.0.0 (kodowanie KVP) dla podanej usługi i warstwy. */
function tileUrl(def) {
  const query = [
    'SERVICE=WMTS',
    'REQUEST=GetTile',
    'VERSION=1.0.0',
    'LAYER=' + encodeURIComponent(def.layer),
    'STYLE=default',
    'FORMAT=' + encodeURIComponent(def.format),
    'TILEMATRIXSET=' + CRS_CODE,
    'TILEMATRIX=' + CRS_CODE + ':{z}',
    'TILEROW={y}',
    'TILECOL={x}',
  ].join('&');
  return serviceUrl + def.path + '?' + query;
}

/** Warstwa kafli dla jednej definicji podkładu. Zakres native dotyczy poziomów mapy;
 *  zoomOffset przelicza poziom mapy na numer macierzy usługi. */
function tileLayer(def) {
  return L.tileLayer(tileUrl(def), {
    attribution: ATTRIBUTION,
    tileSize: TILE_SIZE,
    zoomOffset: def.zoomOffset,
    minNativeZoom: def.minNativeZoom,
    maxNativeZoom: def.maxNativeZoom,
    minZoom: ZOOM.min,
    maxZoom: ZOOM.max,
    // Kafle wczytywane dopiero po zakończeniu zoomu (nie na każdym pośrednim poziomie
    // przy szczypaniu), a przy przesuwaniu na telefonie po zakończeniu ruchu — mniej
    // porzuconych żądań przy słabym zasięgu. keepBuffer trzyma kafle wokół widoku,
    // więc cofnięcie ruchu nie wymaga ponownego pobrania.
    updateWhenZooming: false,
    updateWhenIdle: L.Browser.mobile,
    updateInterval: 250,
    keepBuffer: 3,
    // Żądania CORS: Geoportal odsyła Access-Control-Allow-Origin: *, a dzięki temu service
    // worker (public/sw.js) widzi status odpowiedzi i buforuje tylko poprawne kafle.
    crossOrigin: 'anonymous',
  });
}

/**
 * Ponawia wczytanie kafla po błędzie (z rosnącym odstępem), o ile kafel nadal jest na mapie
 * i poziom zoomu się nie zmienił. Po wyczerpaniu prób warstwa emituje zdarzenie `tilegiveup`.
 * Leaflet sam nie ponawia — nieudany kafel zostaje pusty do zmiany widoku.
 */
export function retryFailedTiles(layer, delays = RETRY_DELAYS_MS) {
  const attempts = new WeakMap();
  layer.on('tileerror', (e) => {
    const tile = e.tile;
    const n = attempts.get(tile) || 0;
    if (n >= delays.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      layer.fire('tilegiveup', { tile, coords: e.coords });
      return;
    }
    attempts.set(tile, n + 1);
    setTimeout(() => {
      // _tileZoom: bieżący poziom kafli warstwy (po ograniczeniu do zakresu native).
      if (!tile.isConnected || !layer._map || layer._tileZoom !== e.coords.z) return;
      if (tile.getAttribute('src') === L.Util.emptyImageUrl) return;
      tile.src = layer.getTileUrl(e.coords);
    }, delays[n]);
  });
}

/** Podmienia warstwę na zapasową, gdy pierwsze kafle (po wyczerpaniu ponowień) kończą się
 *  błędem i żaden kafel nie został wczytany. */
function withFallback(map, primary, fallback, onSwitch) {
  let loaded = 0,
    errors = 0,
    switched = false;
  primary.on('tileload', () => {
    loaded++;
  });
  primary.on('tilegiveup', () => {
    errors++;
    if (switched || loaded > 0 || errors < fallbackAfterErrors) return;
    switched = true;
    if (map.hasLayer(primary)) {
      map.removeLayer(primary);
      map.addLayer(fallback);
    }
    onSwitch();
  });
}

/** Zamykalny komunikat w rogu mapy. */
function showNotice(map, text) {
  const control = L.control({ position: 'bottomleft' });
  control.onAdd = () => {
    const box = L.DomUtil.create('div', 'pzw-notice');
    box.style.cssText =
      'background:#fff8e1;border:1px solid #ffe082;border-radius:6px;' +
      'padding:6px 28px 6px 10px;font:12px/1.4 system-ui,sans-serif;max-width:250px;position:relative;box-shadow:0 1px 4px rgba(0,0,0,.2)';
    box.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Zamknij');
    close.textContent = '×';
    close.style.cssText =
      'position:absolute;top:2px;right:4px;border:0;background:none;font-size:16px;cursor:pointer;color:#6d4c00';
    close.onclick = () => control.remove();
    box.appendChild(close);
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  control.addTo(map);
  return control;
}

/**
 * Dodaje do mapy podkłady z konfiguracji i przełącznik warstw.
 * @param {L.Map} map
 * @param {string} defaultId identyfikator podkładu włączonego na starcie
 * @returns {Record<string, L.TileLayer>} podkłady wg identyfikatora
 */
export function initBasemaps(map, defaultId) {
  const byId = {};
  const control = {};
  for (const def of layers) {
    byId[def.id] = tileLayer(def);
    retryFailedTiles(byId[def.id]);
    control[def.title] = byId[def.id];
  }

  const primary = byId[defaultId] || byId[layers[0].id];
  const fallback = layers.map((d) => byId[d.id]).find((l) => l !== primary);
  primary.addTo(map);
  if (fallback) withFallback(map, primary, fallback, () => showNotice(map, fallbackNotice));

  L.control.layers(control, null, { position: 'topright', collapsed: true }).addTo(map);
  return byId;
}
