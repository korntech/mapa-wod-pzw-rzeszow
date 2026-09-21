/* Układ współrzędnych mapy zbudowany z parametrów siatki WMTS w config.json
 * (kod EPSG, definicja proj4, punkt początkowy siatki, rozdzielczości poziomów). */
import L from 'leaflet';
import proj4 from 'proj4';
import 'proj4leaflet';
import { MAP } from './config.js';

const { code, proj4: definition, origin, bounds, resolutions, tileSize } = MAP.crs;

proj4.defs(code, definition);

/** CRS Leaflet o poziomach zoomu równych indeksom macierzy kafli usługi WMTS. */
export const crs = new L.Proj.CRS(code, definition, {
  origin,
  resolutions,
  bounds: L.bounds(bounds[0], bounds[1]),
});

export const CRS_CODE = code;
export const TILE_SIZE = tileSize;
export const ZOOM = MAP.zoom;
export const CENTER = MAP.center;
