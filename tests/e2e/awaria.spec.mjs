/* Awarie źródeł podkładu: mapa ma się przełączyć na inny podkład i dalej pokazywać łowiska.
 * Service worker wyłączony, żeby page.route widział każde żądanie kafla (bez odpowiedzi z cache SW). */
import { test, expect } from '@playwright/test';
import { CONFIG, KAFLE_HOST, KOMUNIKAT_ZAPASOWY, kliknijWLiscie, wczytaneKafle } from './pomocnicze.mjs';

test.use({ serviceWorkers: 'block' });

const domyslny = CONFIG.basemaps.layers.find((l) => l.id === CONFIG.basemaps.default.public);

test('podkład domyślny nie odpowiada → komunikat i podkład zapasowy', async ({ page }) => {
  await page.route(
    (url) => /REQUEST=GetTile/i.test(url.search) && url.searchParams.get('LAYER') === domyslny.layer,
    (route) => route.fulfill({ status: 500, body: '' })
  );
  await page.goto('./');
  await expect(page.locator('#list .item').first()).toBeAttached();
  // Kilka kafli × ponowienia (0,7 s + 2 s) zanim mapa uzna podkład za niedziałający.
  await expect(page.getByText(KOMUNIKAT_ZAPASOWY)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => wczytaneKafle(page), { timeout: 30_000 }).toBeGreaterThan(0);
  const warstwy = await page.$$eval('img.leaflet-tile', (imgs) => [
    ...new Set(imgs.map((i) => new URL(i.src).searchParams.get('LAYER'))),
  ]);
  expect(warstwy).not.toContain(domyslny.layer);

  await page.locator('.pzw-notice button').click();
  await expect(page.getByText(KOMUNIKAT_ZAPASOWY)).toHaveCount(0);
});

test('cache kafli (Worker) nie odpowiada → łowiska dalej widoczne i klikalne', async ({ page }) => {
  test.skip(!KAFLE_HOST, 'kafleUrl pusty — kafle prosto z Geoportalu');
  await page.route(
    (url) => url.host === KAFLE_HOST,
    (route) => route.abort('connectionrefused')
  );
  await page.goto('./');
  await expect(page.locator('#list .item').first()).toBeAttached();
  await expect(page.getByText(KOMUNIKAT_ZAPASOWY)).toBeVisible({ timeout: 30_000 });
  await kliknijWLiscie(page);
});
