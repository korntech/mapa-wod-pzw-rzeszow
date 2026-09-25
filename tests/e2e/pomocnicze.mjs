/* Wspólne pomocnicze dla testów E2E: konfiguracja, oczekiwane liczby z danych na stronie,
 * zbieranie żądań kafli i błędów strony. */
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const CONFIG = JSON.parse(readFileSync(new URL('../../config.json', import.meta.url), 'utf8'));
// E2E_BEZ_CACHE=1: strona zbudowana bez cache kafli (np. lokalnie — Worker odpowiada tylko adresom produkcyjnym).
export const KAFLE_HOST =
  CONFIG.basemaps.kafleUrl && !process.env.E2E_BEZ_CACHE ? new URL(CONFIG.basemaps.kafleUrl).host : null;
export const GEOPORTAL_HOST = new URL(CONFIG.basemaps.serviceUrl).host;
export const FUNKCJA_ZGLOSZEN = `${CONFIG.supabase.url}/functions/v1/${CONFIG.links.report.function}`;
export const KOMUNIKAT_ZAPASOWY = CONFIG.basemaps.fallbackNotice;

/** Dane opublikowane na stronie (ten sam snapshot, który widzi mapa). */
export async function daneStrony(request, baseURL) {
  const res = await request.get(new URL(CONFIG.snapshot.file, baseURL).href);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Liczba pozycji na liście przy domyślnych filtrach: zbiorniki + rzeki (granice wyłączone). */
export const domyslnieNaLiscie = (d) => d.zb.length + d.rivers.length;

/** Liczba z paska „N pozycji · …”. */
export async function liczbaPozycji(page) {
  const txt = await page.locator('#count').textContent();
  return Number(/^(\d+) pozycji/.exec(txt)?.[1] ?? NaN);
}

/** Śledzi żądania kafli (GetTile) i błędy JS strony; wywołać przed page.goto. */
export function sledz(page) {
  const s = { kafle: [], bledy: [] };
  page.on('response', (res) => {
    if (/REQUEST=GetTile/i.test(res.url()))
      s.kafle.push({ host: new URL(res.url()).host, status: res.status() });
  });
  page.on('pageerror', (e) => s.bledy.push(e.message));
  return s;
}

/** Otwiera mapę i czeka na dane na liście i pierwsze kafle podkładu. */
export async function otworzMape(page) {
  await page.goto('./');
  await expect(page.locator('#list .item').first()).toBeVisible();
  await expect.poll(() => wczytaneKafle(page), { message: 'kafle podkładu' }).toBeGreaterThan(0);
}

/** Liczba poprawnie wczytanych kafli (obraz o niezerowej szerokości). */
export function wczytaneKafle(page) {
  return page.$$eval(
    'img.leaflet-tile',
    (imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length
  );
}

/** Kafle, które przeglądarka uznała za wczytane z błędem (complete, ale bez obrazu). */
export function zepsuteKafle(page) {
  return page.$$eval(
    'img.leaflet-tile-loaded',
    (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length
  );
}

export const czyAndroid = (page) => page.evaluate(() => /android/i.test(navigator.userAgent));

/** Odcina bazę (Supabase REST): mapa bierze dane ze snapshotu — deterministyczne liczby w testach,
 *  a zarazem test zapasu „baza niedostępna → snapshot”. Wywołać przed page.goto. */
export async function tylkoSnapshot(page) {
  await page.route(`${CONFIG.supabase.url}/rest/v1/**`, (route) => route.abort('connectionrefused'));
}

/** Na telefonie lista jest w panelu wysuwanym od dołu — rozwija go do pełnej wysokości. */
export async function rozwinPanel(page) {
  const uchwyt = page.locator('#uchwyt');
  if (!(await uchwyt.isVisible())) return;
  for (let i = 0; i < 3 && (await page.locator('#side').getAttribute('data-stan')) !== 'full'; i++) {
    await uchwyt.click();
  }
  await expect(page.locator('#side')).toHaveAttribute('data-stan', 'full');
}

/** Okno „O mapie” (na telefonie przycisk jest w menu ☰). */
export async function otworzOMapie(page) {
  if (await page.locator('#menubtn').isVisible()) await page.locator('#menubtn').click();
  await page.locator('#infobtn').click();
  await expect(page.locator('#infomodal')).toBeVisible();
}

/** Klik w pozycję listy (z rozwinięciem panelu na telefonie); zwraca nazwę pozycji. */
export async function kliknijWLiscie(page, pozycja = page.locator('#list .item').first()) {
  await rozwinPanel(page);
  const nazwa = (await pozycja.locator('b').textContent()).trim();
  await pozycja.click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();
  return nazwa;
}
