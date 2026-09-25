/* Service worker mapy: pamięć podręczna kafli Geoportalu i plików aplikacji.
 *
 * Strategie (dobierzStrategie):
 *  - kafle WMTS z Geoportalu (GetTile) — najpierw cache, potem sieć; limit liczby wpisów
 *    (najstarsze usuwane) i ważność 30 dni; kafel wygasły jest odświeżany z sieci, a przy
 *    braku sieci pokazywany mimo wygaśnięcia. Geoportal odsyła kafle z CORS, więc odpowiedzi
 *    nie są „opaque” i buforowane są wyłącznie poprawne obrazy (status 200, image/*);
 *    błąd serwera (HTTP 5xx) jest raz ponawiany.
 *  - data.json — najpierw sieć, przy braku sieci kopia z cache;
 *  - assets/ Vite (nazwy z hashem) — najpierw cache;
 *  - strony .html — najpierw sieć, przy braku sieci kopia z cache.
 * Pozostałe żądania (baza Supabase itp.) przechodzą bez udziału service workera.
 * To nie jest pełny tryb offline (nic nie jest pobierane z wyprzedzeniem) — tylko bufor tego,
 * co już było oglądane. Zmiana WERSJA czyści stare wpisy przy aktywacji.
 *
 * Plik jest klasycznym skryptem (nie modułem ESM). Funkcje czyste (do „część wykonywana…”)
 * testuje src/sw.test.mjs, wczytując ten plik przez node:vm.
 */

const WERSJA = 'v1';
const CACHE_KAFLE = 'kafle-' + WERSJA;
const CACHE_APP = 'app-' + WERSJA;
/* Kafle rozpoznawane po parametrze REQUEST=GetTile (Geoportal albo nasz cache kafli — inny host). */
const KAFLE_LIMIT = 1500;
const KAFLE_WAZNOSC_MS = 30 * 24 * 60 * 60 * 1000;
const NAGLOWEK_ZAPISANO = 'x-sw-zapisano';
const PONOWIENIE_MS = 400;
const SPRZATAJ_CO = 25;
const LIMIT_SIECI_MS = 8000;

/**
 * Strategia dla adresu żądania: 'kafel' | 'dane' | 'asset' | 'html' | null (bez udziału SW).
 * @param {string} url pełny adres żądania
 * @param {string} scope zasięg service workera (adres bazowy strony, z ukośnikiem na końcu)
 * @param {string} [mode] tryb żądania ('navigate' dla wejścia na stronę)
 */
function dobierzStrategie(url, scope, mode) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (/(^|[?&])REQUEST=GetTile(&|$)/i.test(u.search)) return 'kafel';
  if (!url.startsWith(scope)) return null;
  const sciezka = u.pathname.slice(new URL(scope).pathname.length);
  if (sciezka === 'data.json') return 'dane';
  if (sciezka.startsWith('assets/')) return 'asset';
  if (mode === 'navigate' || sciezka === '' || sciezka.endsWith('.html')) return 'html';
  return null;
}

/** Czy zapis z cache jest jeszcze ważny (brak znacznika = nieważny). */
function wazny(zapisano, teraz, waznoscMs) {
  const t = Number(zapisano);
  return Number.isFinite(t) && t > 0 && teraz - t < waznoscMs;
}

/** Ile najstarszych wpisów usunąć, aby zmieścić się w limicie. */
function nadmiar(liczbaWpisow, limit) {
  return Math.max(0, liczbaWpisow - limit);
}

/** Czy odpowiedź nadaje się do zapisania jako kafel (poprawny obraz). */
function kafelDoZapisu(status, typ) {
  return status === 200 && typeof typ === 'string' && typ.startsWith('image/');
}

/* ---- część wykonywana tylko w service workerze ---- */

const czekaj = (ms) => new Promise((res) => setTimeout(res, ms));

/** Pobranie kafla z jednym ponowieniem po błędzie serwera lub sieci. Nowe żądanie z adresu,
 *  a nie fetch(ev.request): Firefox odrzuca ponowne wysłanie żądania obrazka <img crossorigin>
 *  do innego hosta (NetworkError). */
async function pobierzKafel(zadanie) {
  const pobierz = () => fetch(zadanie.url, { mode: 'cors', credentials: 'omit' });
  try {
    const odp = await pobierz();
    if (odp.status < 500) return odp;
  } catch {
    /* ponowienie niżej */
  }
  await czekaj(PONOWIENIE_MS);
  return pobierz();
}

/** Kopia odpowiedzi ze znacznikiem czasu zapisu (do liczenia ważności). */
function zeZnacznikiem(odp) {
  const naglowki = new Headers(odp.headers);
  naglowki.set(NAGLOWEK_ZAPISANO, String(Date.now()));
  return new Response(odp.body, { status: odp.status, statusText: odp.statusText, headers: naglowki });
}

/** Usuwa najstarsze wpisy ponad limit (kolejność kluczy = kolejność zapisu). */
async function sprzatajKafle(cache) {
  const klucze = await cache.keys();
  await Promise.all(klucze.slice(0, nadmiar(klucze.length, KAFLE_LIMIT)).map((k) => cache.delete(k)));
}

let licznikZapisow = 0;

async function zapiszKafel(cache, zadanie, odp) {
  await cache.put(zadanie, zeZnacznikiem(odp.clone()));
  licznikZapisow++;
  if (licznikZapisow % SPRZATAJ_CO === 0) await sprzatajKafle(cache);
}

async function obsluzKafel(zadanie) {
  const cache = await caches.open(CACHE_KAFLE);
  const zCache = await cache.match(zadanie);
  if (zCache && wazny(zCache.headers.get(NAGLOWEK_ZAPISANO), Date.now(), KAFLE_WAZNOSC_MS)) return zCache;
  let odp;
  try {
    odp = await pobierzKafel(zadanie);
  } catch {
    return zCache || new Response('', { status: 503, statusText: 'Brak sieci' });
  }
  if (!kafelDoZapisu(odp.status, odp.headers.get('content-type'))) return zCache || odp;
  try {
    await zapiszKafel(cache, zadanie, odp);
  } catch {
    /* brak miejsca lub cache niedostępny — kafel i tak trafia na mapę */
  }
  return odp;
}

/** Najpierw sieć; kopia z cache, gdy sieć zawiedzie albo nie odpowie w LIMIT_SIECI_MS
 *  (słaby zasięg — pobieranie trwa dalej w tle i odświeża cache). Bez kopii błąd sieci
 *  trafia do strony. */
async function najpierwSiec(zadanie) {
  const cache = await caches.open(CACHE_APP);
  const zSieci = fetch(zadanie).then((odp) => {
    if (odp.ok) cache.put(zadanie, odp.clone()).catch(() => {});
    return odp;
  });
  const limit = czekaj(LIMIT_SIECI_MS).then(() => {
    throw new Error('limit czasu');
  });
  try {
    return await Promise.race([zSieci, limit]);
  } catch (err) {
    zSieci.catch(() => {});
    const zCache = await cache.match(zadanie);
    if (zCache) return zCache;
    return zSieci;
  }
}

async function najpierwCache(zadanie) {
  const cache = await caches.open(CACHE_APP);
  const zCache = await cache.match(zadanie);
  if (zCache) return zCache;
  const odp = await fetch(zadanie);
  if (odp.ok) cache.put(zadanie, odp.clone()).catch(() => {});
  return odp;
}

async function aktywuj() {
  const nazwy = await caches.keys();
  await Promise.all(nazwy.filter((n) => n !== CACHE_KAFLE && n !== CACHE_APP).map((n) => caches.delete(n)));
  await sprzatajKafle(await caches.open(CACHE_KAFLE));
  await self.clients.claim();
}

function obsluzFetch(ev) {
  const zadanie = ev.request;
  if (zadanie.method !== 'GET') return;
  const strategia = dobierzStrategie(zadanie.url, self.registration.scope, zadanie.mode);
  if (strategia === 'kafel') ev.respondWith(obsluzKafel(zadanie));
  else if (strategia === 'dane' || strategia === 'html') ev.respondWith(najpierwSiec(zadanie));
  else if (strategia === 'asset') ev.respondWith(najpierwCache(zadanie));
}

if (
  typeof self !== 'undefined' &&
  typeof self.addEventListener === 'function' &&
  typeof caches !== 'undefined'
) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (ev) => ev.waitUntil(aktywuj()));
  self.addEventListener('fetch', obsluzFetch);
}
