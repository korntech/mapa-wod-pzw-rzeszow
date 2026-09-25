/* Testy czystej logiki service workera (public/sw.js): plik jest klasycznym skryptem,
 * więc wczytujemy go przez node:vm bez środowiska SW — część nasłuchująca zdarzeń
 * nie uruchamia się (brak `caches`), a funkcje deklarowane globalnie są dostępne w kontekście. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ URL, Headers, Response, setTimeout, fetch: undefined });
vm.runInContext(src, ctx, { filename: 'sw.js' });
// Stałe `const` nie trafiają na obiekt kontekstu (w przeciwieństwie do deklaracji funkcji).
const { dobierzStrategie, wazny, nadmiar, kafelDoZapisu, KAFLE_LIMIT, KAFLE_WAZNOSC_MS } = vm.runInContext(
  '({ dobierzStrategie, wazny, nadmiar, kafelDoZapisu, KAFLE_LIMIT, KAFLE_WAZNOSC_MS })',
  ctx
);

const scope = 'https://pzw-rzeszow.github.io/mapa-wod-pzw-rzeszow/';
const kafel =
  'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/G2_MOBILE_500?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=G2_MOBILE_500&STYLE=default&FORMAT=image%2Fpng&TILEMATRIXSET=EPSG:2180&TILEMATRIX=EPSG:2180:8&TILEROW=44&TILECOL=45';

test('kafle Geoportalu: tylko GetTile, niezależnie od usługi', () => {
  assert.equal(dobierzStrategie(kafel, scope), 'kafel');
  assert.equal(
    dobierzStrategie(
      'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetTile&LAYER=ORTOFOTOMAPA',
      scope
    ),
    'kafel'
  );
  assert.equal(
    dobierzStrategie(
      'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/TOPO?REQUEST=GetCapabilities',
      scope
    ),
    null,
    'GetCapabilities nie jest kaflem'
  );
  assert.equal(
    dobierzStrategie(
      'https://pzw-kafle.example.workers.dev/wss/service/WMTS/guest/wmts/G2_MOBILE_500?SERVICE=WMTS&REQUEST=GetTile&TILEROW=1&TILECOL=2',
      scope
    ),
    'kafel',
    'własny cache kafli (inny host) — też kafel'
  );
  assert.equal(dobierzStrategie('https://inny.host.pl/x?a=1', scope), null, 'obcy host bez GetTile');
});

test('pliki strony: data.json, assets, html; reszta bez udziału SW', () => {
  assert.equal(dobierzStrategie(scope + 'data.json', scope), 'dane');
  assert.equal(dobierzStrategie(scope + 'assets/main-Ab12Cd34.js', scope), 'asset');
  assert.equal(dobierzStrategie(scope + 'assets/main-Ab12Cd34.css', scope), 'asset');
  assert.equal(dobierzStrategie(scope, scope, 'navigate'), 'html');
  assert.equal(dobierzStrategie(scope + 'wykaz.html', scope), 'html');
  assert.equal(dobierzStrategie(scope + 'admin.html?x=1', scope, 'navigate'), 'html');
  assert.equal(dobierzStrategie(scope + 'kandydaci-zbiorniki.json', scope), null, 'używany tylko w panelu');
  assert.equal(dobierzStrategie(scope + 'sw.js', scope), null);
  assert.equal(dobierzStrategie('https://cnmuvkymtacspfrqnhma.supabase.co/rest/v1/zbiorniki', scope), null);
  assert.equal(
    dobierzStrategie('https://pzw-rzeszow.github.io/inna-strona/data.json', scope),
    null,
    'poza zasięgiem'
  );
  assert.equal(dobierzStrategie('nie-url', scope), null);
});

test('ważność wpisu: 30 dni od zapisu, brak znacznika = nieważny', () => {
  const teraz = 1_800_000_000_000;
  assert.equal(wazny(String(teraz - 1000), teraz, KAFLE_WAZNOSC_MS), true);
  assert.equal(wazny(String(teraz - KAFLE_WAZNOSC_MS + 1), teraz, KAFLE_WAZNOSC_MS), true);
  assert.equal(wazny(String(teraz - KAFLE_WAZNOSC_MS), teraz, KAFLE_WAZNOSC_MS), false);
  assert.equal(wazny(null, teraz, KAFLE_WAZNOSC_MS), false);
  assert.equal(wazny('abc', teraz, KAFLE_WAZNOSC_MS), false);
  assert.equal(KAFLE_WAZNOSC_MS, 30 * 24 * 3600 * 1000);
});

test('limit wpisów: usuwane są tylko najstarsze ponad limit', () => {
  assert.equal(nadmiar(KAFLE_LIMIT - 1, KAFLE_LIMIT), 0);
  assert.equal(nadmiar(KAFLE_LIMIT, KAFLE_LIMIT), 0);
  assert.equal(nadmiar(KAFLE_LIMIT + 7, KAFLE_LIMIT), 7);
  assert.ok(KAFLE_LIMIT >= 1000 && KAFLE_LIMIT <= 2000, 'rząd wielkości limitu');
});

test('do cache trafia tylko poprawny obraz (HTTP 500 Geoportalu i XML wyjątku nie)', () => {
  assert.equal(kafelDoZapisu(200, 'image/png'), true);
  assert.equal(kafelDoZapisu(200, 'image/jpeg'), true);
  assert.equal(kafelDoZapisu(500, 'text/html;charset=utf-8'), false);
  assert.equal(kafelDoZapisu(200, 'text/xml;charset=UTF-8'), false);
  assert.equal(kafelDoZapisu(304, 'image/png'), false);
  assert.equal(kafelDoZapisu(200, null), false);
});
