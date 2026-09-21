/* Podkłady mapowe — usługi WMTS Głównego Urzędu Geodezji i Kartografii
 * (geoportal.gov.pl): mapa topograficzna BDOT10k i ortofotomapa lotnicza.
 *
 * Usługi GUGiK: "brak ograniczeń" w dostępie (ows:AccessConstraints),
 * korzystanie oznacza akceptację regulaminu Geoportalu. Wymagana atrybucja.
 *
 * Decyzja 2026-09-20: projekt korzysta wyłącznie z polskich źródeł państwowych.
 * Kafle zewnętrzne usunięto także z roli podkładu awaryjnego — ich regulamin
 * zabrania pobierania na zapas (co blokowałoby tryb offline), a mapa ma trafić
 * do Okręgu PZW jako narzędzie oficjalne. Podkładem awaryjnym jest druga usługa
 * GUGiK; gdy i ona nie odpowiada, mapa działa bez podkładu — same dane łowisk.
 */
import L from 'leaflet';

export const ATTR_GUGIK = 'Podkład i geometrie: <a href="https://www.geoportal.gov.pl/" target="_blank" rel="noopener">GUGiK · BDOT10k</a>';

// Buduje URL kafla w standardzie WMTS 1.0.0 (profil KVP) dla siatki EPSG:3857,
// czyli tej samej, której domyślnie używa Leaflet — bez proj4leaflet.
function wmts(url, layer, o = {}) {
  const q = [
    'SERVICE=WMTS', 'REQUEST=GetTile', 'VERSION=1.0.0',
    'LAYER=' + layer,
    'STYLE=' + (o.style || 'default'),
    'FORMAT=' + (o.format || 'image/png'),
    'TILEMATRIXSET=EPSG:3857',
    'TILEMATRIX=EPSG:3857:{z}',
    'TILEROW={y}', 'TILECOL={x}',
  ].join('&');
  return L.tileLayer(url + '?' + q, {
    attribution: o.attribution || ATTR_GUGIK,
    minZoom: o.minZoom || 6,
    maxZoom: o.maxZoom || 19,
    maxNativeZoom: o.maxNativeZoom || 18,
    // Geoportal bywa wolny — mniej równoległych żądań, mniej porzuconych kafli.
    updateWhenIdle: true,
    keepBuffer: 3,
  });
}

// Przełącza na podkład awaryjny dopiero, gdy z usługi nie wczytał się ANI JEDEN
// kafel — pojedyncze błędy na skraju zasięgu nie są awarią.
function guard(primary, fallback, map, onSwitch) {
  let loaded = 0, errors = 0, switched = false;
  primary.on('tileload', () => { loaded++; });
  primary.on('tileerror', () => {
    errors++;
    if (switched || loaded > 0 || errors < 6) return;
    switched = true;
    if (map.hasLayer(primary)) { map.removeLayer(primary); map.addLayer(fallback); }
    if (onSwitch) onSwitch();
  });
}

function notice(map, text) {
  const c = L.control({ position: 'bottomleft' });
  c.onAdd = () => {
    const d = L.DomUtil.create('div');
    d.style.cssText = 'background:#fff8e1;border:1px solid #ffe082;border-radius:6px;' +
      'padding:6px 10px;font:12px/1.4 system-ui,sans-serif;max-width:260px;box-shadow:0 1px 4px rgba(0,0,0,.2)';
    d.innerHTML = text;
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  c.addTo(map);
}

/* Dodaje podkłady do mapy i zwraca ich zestaw.
 * opts.def: 'topo' (domyślnie) albo 'orto' — warstwa włączona na starcie. */
export function initBasemaps(map, opts = {}) {
  // Mapa topograficzna z Bazy Danych Obiektów Topograficznych (BDOT10k).
  const topo = wmts('https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/BDOT10k', 'BDOT10k',
    { format: 'image/png', maxNativeZoom: 18 });
  // Ortofotomapa lotnicza (rozdzielczość standardowa) — parametry potwierdzone
  // w GetCapabilities usługi: warstwa ORTOFOTOMAPA, EPSG:3857, poziomy 0–19.
  const orto = wmts('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution', 'ORTOFOTOMAPA',
    { format: 'image/jpeg', maxNativeZoom: 19 });

  const def = opts.def === 'orto' ? orto : topo;
  def.addTo(map);

  // Awaryjnie druga usługa GUGiK; gdy i ona milczy — mapa bez podkładu.
  guard(def, def === topo ? orto : topo, map, () => {
    notice(map, '⚠ Mapa topograficzna Geoportalu jest chwilowo niedostępna — ' +
      'włączono ortofotomapę GUGiK. Dane łowisk pozostają aktualne.');
  });

  L.control.layers({ 'Mapa topograficzna': topo, 'Ortofotomapa': orto }, null, { position: 'topright' }).addTo(map);
  return { topo, orto };
}
