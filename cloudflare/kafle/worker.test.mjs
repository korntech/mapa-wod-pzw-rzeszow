import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTileRequest,
  originUrl,
  corsOrigin,
  originAllowed,
  fetchFromOrigin,
  handleRequest,
} from './worker.js';

const BASE = 'https://kafle.example';
const URL_OK =
  BASE +
  '/wss/service/WMTS/guest/wmts/G2_MOBILE_500?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=G2_MOBILE_500&STYLE=default&FORMAT=image%2Fpng&TILEMATRIXSET=EPSG%3A2180&TILEMATRIX=EPSG%3A2180%3A9&TILEROW=447&TILECOL=454';

test('parseTileRequest: poprawny GetTile → klucz i parametry', () => {
  const t = parseTileRequest(URL_OK);
  assert.equal(t.path, 'WMTS/guest/wmts/G2_MOBILE_500');
  assert.equal(t.level, 9);
  assert.equal(t.row, 447);
  assert.equal(t.col, 454);
  assert.equal(t.key, 'WMTS/guest/wmts/G2_MOBILE_500/G2_MOBILE_500/EPSG:2180/9/447/454.png');
});

test('parseTileRequest: odrzuca inne usługi, inne żądania i złe numery', () => {
  assert.equal(parseTileRequest(BASE + '/wss/service/INNA/usluga?SERVICE=WMTS&REQUEST=GetTile'), null);
  assert.equal(parseTileRequest(URL_OK.replace('GetTile', 'GetCapabilities')), null);
  assert.equal(parseTileRequest(URL_OK.replace('TILEROW=447', 'TILEROW=-1')), null);
  assert.equal(parseTileRequest(URL_OK.replace('TILECOL=454', 'TILECOL=abc')), null);
  assert.equal(parseTileRequest(URL_OK.replace('image%2Fpng', 'text%2Fhtml')), null);
  assert.equal(parseTileRequest(URL_OK.replace('LAYER=G2_MOBILE_500', 'LAYER=..%2F..%2Fetc')), null);
  assert.equal(parseTileRequest(BASE + '/'), null);
});

test('originUrl: kanoniczna kolejność parametrów niezależnie od kolejności w żądaniu', () => {
  const a = parseTileRequest(URL_OK);
  const shuffled =
    BASE +
    '/wss/service/WMTS/guest/wmts/G2_MOBILE_500?TILECOL=454&TILEROW=447&REQUEST=GetTile&SERVICE=WMTS&LAYER=G2_MOBILE_500&FORMAT=image/png&TILEMATRIXSET=EPSG:2180&TILEMATRIX=EPSG:2180:9';
  const b = parseTileRequest(shuffled);
  assert.equal(a.key, b.key);
  assert.equal(originUrl('https://mapy.geoportal.gov.pl', a), originUrl('https://mapy.geoportal.gov.pl/', b));
  assert.match(
    originUrl('https://mapy.geoportal.gov.pl', a),
    /^https:\/\/mapy\.geoportal\.gov\.pl\/wss\/service\/WMTS\/guest\/wmts\/G2_MOBILE_500\?SERVICE=WMTS&REQUEST=GetTile/
  );
});

test('CORS i dozwolone źródła', () => {
  assert.equal(corsOrigin('', 'https://x'), '*');
  assert.equal(corsOrigin('https://a,https://b', 'https://b'), 'https://b');
  assert.equal(corsOrigin('https://a,https://b', 'https://zly'), 'https://a');
  const req = (h) => new Request(URL_OK, { headers: h });
  assert.equal(originAllowed('', req({})), true);
  assert.equal(originAllowed('https://a', req({ Origin: 'https://a' })), true);
  assert.equal(originAllowed('https://a', req({ Referer: 'https://a/mapa/' })), true);
  assert.equal(originAllowed('https://a', req({ Referer: 'https://zly/' })), false);
  assert.equal(originAllowed('https://a', req({})), false);
});

const png = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });

test('fetchFromOrigin: ponawia po 500 i oddaje obraz; nie ponawia po 4xx; XML 200 traktuje jak błąd', async () => {
  let calls = 0;
  const flaky = async () => (++calls < 3 ? new Response('err', { status: 500 }) : png());
  const res = await fetchFromOrigin('https://x', flaky, [1, 1]);
  assert.equal(res.status, 200);
  assert.equal(calls, 3);
  calls = 0;
  const notFound = async () => (calls++, new Response('nie ma', { status: 404 }));
  assert.equal(await fetchFromOrigin('https://x', notFound, [1, 1]), null);
  assert.equal(calls, 1);
  calls = 0;
  const xml = async () => (
    calls++,
    new Response('<ExceptionReport/>', { status: 200, headers: { 'content-type': 'text/xml' } })
  );
  assert.equal(await fetchFromOrigin('https://x', xml, [1, 1]), null);
  assert.equal(calls, 3);
});

/** Atrapy: R2 w Mapie, Cache API w Mapie, ctx.waitUntil zbierający obietnice. */
function srodowisko(fetchImpl) {
  const r2 = new Map();
  const cache = new Map();
  const pending = [];
  const env = {
    GEOPORTAL: 'https://mapy.geoportal.gov.pl',
    ALLOWED_ORIGINS: '',
    TTL_SEC: '100',
    KAFLE: {
      get: async (k) =>
        r2.has(k) ? { body: r2.get(k).bytes, httpMetadata: { contentType: r2.get(k).type } } : null,
      put: async (k, bytes, opts) => void r2.set(k, { bytes, type: opts.httpMetadata.contentType }),
    },
  };
  const edge = {
    match: async (req) => cache.get(req.url) || undefined,
    put: async (req, res) => void cache.set(req.url, res),
  };
  const ctx = { waitUntil: (p) => pending.push(p) };
  const run = async (url = URL_OK, init) => {
    const res = await handleRequest(new Request(url, init), env, ctx, { fetch: fetchImpl, cache: edge });
    await Promise.all(pending.splice(0));
    return res;
  };
  return { env, r2, cache, run };
}

test('przebieg: miss → Geoportal → zapis w R2 i edge → kolejne żądania z cache bez sieci', async () => {
  let upstream = 0;
  const s = srodowisko(async () => (upstream++, png()));
  const r1 = await s.run();
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('X-Kafle'), 'origin');
  assert.equal(r1.headers.get('Content-Type'), 'image/png');
  assert.match(r1.headers.get('Cache-Control'), /max-age=100/);
  assert.equal(s.r2.size, 1);
  const r2 = await s.run();
  assert.equal(r2.headers.get('X-Kafle'), 'edge');
  assert.equal(upstream, 1);
  s.cache.clear();
  const r3 = await s.run();
  assert.equal(r3.headers.get('X-Kafle'), 'r2');
  assert.equal(upstream, 1, 'R2 obsłużyło bez Geoportalu');
});

test('awaria Geoportalu: 502 bez zapisu; po odzyskaniu działa', async () => {
  let ok = false;
  const s = srodowisko(async () => (ok ? png() : new Response('x', { status: 500 })));
  const bad = await s.run();
  assert.equal(bad.status, 502);
  assert.equal(bad.headers.get('Cache-Control'), 'no-store');
  assert.equal(s.r2.size, 0);
  ok = true;
  assert.equal((await s.run()).status, 200);
});

test('odrzuca: złe żądanie 400, metoda 405, źródło spoza listy 403, OPTIONS 204, /zdrowie 200', async () => {
  const s = srodowisko(async () => png());
  assert.equal(
    (await s.run(BASE + '/wss/service/WMTS/guest/wmts/TOPO?SERVICE=WMTS&REQUEST=GetCapabilities')).status,
    400
  );
  assert.equal((await s.run(URL_OK, { method: 'POST' })).status, 405);
  assert.equal((await s.run(URL_OK, { method: 'OPTIONS' })).status, 204);
  assert.equal((await s.run(BASE + '/zdrowie')).status, 200);
  s.env.ALLOWED_ORIGINS = 'https://pzw-rzeszow.github.io';
  assert.equal((await s.run(URL_OK, { headers: { Origin: 'https://zly.example' } })).status, 403);
  const okRes = await s.run(URL_OK, {
    headers: { Referer: 'https://pzw-rzeszow.github.io/mapa-wod-pzw-rzeszow/' },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.headers.get('Access-Control-Allow-Origin'), 'https://pzw-rzeszow.github.io');
});
