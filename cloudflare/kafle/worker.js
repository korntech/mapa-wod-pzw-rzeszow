/* Cache kafli Geoportalu (GUGiK) na Cloudflare Workers + R2.
 *
 * Przeglądarka pyta ten Worker zamiast Geoportalu, z tym samym adresem WMTS (ścieżka usługi
 * i parametry KVP bez zmian — w aplikacji zmienia się tylko `basemaps.kafleUrl`). Worker:
 *   1. przyjmuje wyłącznie GetTile dla usług z listy (ALLOWED_PATHS) i poprawnych numerów kafla,
 *   2. oddaje kafel z pamięci brzegowej (Cache API), potem z R2,
 *   3. przy braku pobiera z Geoportalu z ponowieniami (bywa HTTP 500 na losowych żądaniach),
 *      zapisuje w R2 i oddaje; nieudane pobranie = 502 bez zapisu,
 *   4. nagłówki: Cache-Control 30 dni, CORS tylko dla dozwolonych źródeł (ALLOWED_ORIGINS).
 * Dzięki temu awaria Geoportalu jest niewidoczna dla kafli, które ktokolwiek już oglądał,
 * a Geoportal dostaje ułamek żądań. Regulamin Geoportalu nie zabrania buforowania danych PZGiK
 * (w odróżnieniu od OSM); podanie źródła jest w atrybucji mapy.
 *
 * Zmienne (wrangler.toml → [vars]): GEOPORTAL (adres źródła), ALLOWED_ORIGINS (CSV; puste = *),
 * TTL_SEC (czas życia kafla), R2 binding: KAFLE. */

export const ALLOWED_PATHS = new Set([
  'WMTS/guest/wmts/G2_MOBILE_500',
  'WMTS/guest/wmts/TOPO',
  'PZGIK/ORTO/WMTS/StandardResolution',
]);

const RETRY_DELAYS_MS = [300, 700];
const IMAGE_TYPES = /^image\/(png|jpeg|jpg|webp)/i;

/** Rozbiera adres żądania na ścieżkę usługi i parametry kafla; null, gdy nie jest to poprawny GetTile. */
export function parseTileRequest(url) {
  const u = new URL(url);
  const m = /^\/wss\/service\/(.+)$/.exec(u.pathname);
  if (!m || !ALLOWED_PATHS.has(m[1])) return null;
  const q = u.searchParams;
  const get = (k) => {
    for (const [key, val] of q) if (key.toUpperCase() === k) return val;
    return null;
  };
  if ((get('SERVICE') || '').toUpperCase() !== 'WMTS' || (get('REQUEST') || '').toUpperCase() !== 'GETTILE')
    return null;
  const layer = get('LAYER');
  const format = get('FORMAT') || '';
  const matrixSet = get('TILEMATRIXSET') || '';
  const matrix = get('TILEMATRIX') || '';
  const row = get('TILEROW');
  const col = get('TILECOL');
  if (!layer || !/^[\w .-]{1,60}$/.test(layer)) return null;
  if (!/^image\/(png|jpeg|jpg)$/i.test(format)) return null;
  if (!/^EPSG:\d{4,5}$/.test(matrixSet)) return null;
  const level = /^EPSG:\d{4,5}:(\d{1,2})$/.exec(matrix);
  if (!level) return null;
  if (!/^\d{1,7}$/.test(row || '') || !/^\d{1,7}$/.test(col || '')) return null;
  const ext = /jpe?g/i.test(format) ? 'jpg' : 'png';
  return {
    path: m[1],
    layer,
    format,
    matrixSet,
    level: Number(level[1]),
    row: Number(row),
    col: Number(col),
    ext,
    key: `${m[1]}/${layer}/${matrixSet}/${level[1]}/${row}/${col}.${ext}`,
  };
}

/** Kanoniczny adres źródłowy (parametry w stałej kolejności — jeden klucz cache na kafel). */
export function originUrl(geoportal, t) {
  const q = new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetTile',
    VERSION: '1.0.0',
    LAYER: t.layer,
    STYLE: 'default',
    FORMAT: t.format,
    TILEMATRIXSET: t.matrixSet,
    TILEMATRIX: `${t.matrixSet}:${t.level}`,
    TILEROW: String(t.row),
    TILECOL: String(t.col),
  });
  return `${geoportal.replace(/\/$/, '')}/wss/service/${t.path}?${q}`;
}

/** Nagłówek CORS: dozwolone źródło z listy albo * przy pustej liście. */
export function corsOrigin(allowed, origin) {
  const list = (allowed || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return '*';
  return origin && list.includes(origin) ? origin : list[0];
}

/** Czy żądanie pochodzi z dozwolonej strony (Origin albo Referer); bez listy — zawsze tak. */
export function originAllowed(allowed, request) {
  const list = (allowed || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  const origin = request.headers.get('Origin');
  if (origin) return list.includes(origin);
  const referer = request.headers.get('Referer');
  if (!referer) return false;
  try {
    return list.includes(new URL(referer).origin);
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pobiera kafel z Geoportalu; ponawia przy 5xx/błędzie sieci. Zwraca Response 200 image/* albo null. */
export async function fetchFromOrigin(url, fetchImpl = fetch, delays = RETRY_DELAYS_MS) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'mapa-wod-pzw-rzeszow/kafle-cache', Accept: 'image/*' },
        signal: AbortSignal.timeout(12_000),
      });
      const type = res.headers.get('content-type') || '';
      if (res.status === 200 && IMAGE_TYPES.test(type)) return res;
      // 4xx (np. TileOutOfRange jako 200 text/xml u GeoWebCache) nie ma sensu ponawiać.
      if (res.status >= 400 && res.status < 500) return null;
    } catch {
      /* błąd sieci / timeout → ponowienie */
    }
    if (i >= delays.length) return null;
    await sleep(delays[i]);
  }
}

function tileHeaders(env, contentType, source, request) {
  const ttl = Number(env.TTL_SEC) || 2_592_000;
  return {
    'Content-Type': contentType,
    'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=86400`,
    'Access-Control-Allow-Origin': corsOrigin(env.ALLOWED_ORIGINS, request.headers.get('Origin')),
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
    'X-Kafle': source,
  };
}

export async function handleRequest(request, env, ctx, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const edge = deps.cache || (typeof caches !== 'undefined' ? caches.default : null);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin(env.ALLOWED_ORIGINS, request.headers.get('Origin')),
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('metoda', { status: 405 });
  if (new URL(request.url).pathname === '/zdrowie') return new Response('ok', { status: 200 });
  if (!originAllowed(env.ALLOWED_ORIGINS, request)) return new Response('zabronione', { status: 403 });

  const tile = parseTileRequest(request.url);
  if (!tile) return new Response('nieprawidłowe żądanie kafla', { status: 400 });

  // 1. pamięć brzegowa Cloudflare (klucz = kanoniczny adres, niezależny od kolejności parametrów)
  const cacheKey = new Request(`https://kafle.cache/${tile.key}`);
  if (edge) {
    const hit = await edge.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set('X-Kafle', 'edge');
      h.set('Access-Control-Allow-Origin', corsOrigin(env.ALLOWED_ORIGINS, request.headers.get('Origin')));
      return new Response(request.method === 'HEAD' ? null : hit.body, { status: 200, headers: h });
    }
  }

  // 2. R2
  const stored = await env.KAFLE.get(tile.key);
  if (stored) {
    const type = stored.httpMetadata?.contentType || (tile.ext === 'jpg' ? 'image/jpeg' : 'image/png');
    const res = new Response(request.method === 'HEAD' ? null : stored.body, {
      status: 200,
      headers: tileHeaders(env, type, 'r2', request),
    });
    if (edge && request.method === 'GET') ctx.waitUntil(edge.put(cacheKey, res.clone()));
    return res;
  }

  // 3. Geoportal
  const upstream = await fetchFromOrigin(originUrl(env.GEOPORTAL, tile), fetchImpl);
  if (!upstream) {
    return new Response('źródło kafli niedostępne', {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': corsOrigin(env.ALLOWED_ORIGINS, request.headers.get('Origin')),
        'X-Kafle': 'origin-error',
      },
    });
  }
  const type = upstream.headers.get('content-type');
  const bytes = await upstream.arrayBuffer();
  ctx.waitUntil(env.KAFLE.put(tile.key, bytes, { httpMetadata: { contentType: type } }));
  const res = new Response(request.method === 'HEAD' ? null : bytes, {
    status: 200,
    headers: tileHeaders(env, type, 'origin', request),
  });
  if (edge && request.method === 'GET') ctx.waitUntil(edge.put(cacheKey, res.clone()));
  return res;
}

export default {
  fetch: (request, env, ctx) => handleRequest(request, env, ctx),
};
