/* Słaby zasięg nad wodą: pierwsze wejście na wolnym łączu i powrót bez sieci (service worker). */
import { test, expect } from '@playwright/test';
import { otworzMape, wczytaneKafle } from './pomocnicze.mjs';

test.describe('wolne łącze (3G)', () => {
  // Dławienie sieci przez CDP jest dostępne tylko w Chromium (Android + desktop Chrome).
  test.skip(({ browserName }) => browserName !== 'chromium', 'emulacja łącza tylko w Chromium');
  test.setTimeout(120_000);

  test('pierwsze wejście: lista i podkład w rozsądnym czasie', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    // ≈ „Regular 3G”: 750 kb/s w dół, 250 kb/s w górę, 100 ms RTT (+ opóźnienie serwerów).
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 100,
      downloadThroughput: (750 * 1024) / 8,
      uploadThroughput: (250 * 1024) / 8,
    });

    const t0 = Date.now();
    await page.goto('./');
    await expect(page.locator('#list .item').first()).toBeVisible({ timeout: 30_000 });
    const lista = Date.now() - t0;
    await expect.poll(() => wczytaneKafle(page), { timeout: 30_000 }).toBeGreaterThan(0);
    const podklad = Date.now() - t0;

    test.info().annotations.push({ type: 'czas', description: `lista ${lista} ms, podkład ${podklad} ms` });
    expect(lista).toBeLessThan(15_000);
    expect(podklad).toBeLessThan(20_000);
  });
});

test.describe('bez sieci (powrót na stronę)', () => {
  test('po wcześniejszej wizycie lista i obejrzane kafle działają offline', async ({ page, context, browserName }) => {
    // Offline z service workerem Playwright obsługuje tylko w Chromium (Firefox: setOffline nie obejmuje SW,
    // WebKit: „internal error” przy przeładowaniu). Na iOS offline trzeba sprawdzić ręcznie.
    test.skip(browserName !== 'chromium', 'offline + SW tylko w Chromium');

    await otworzMape(page);
    // Pierwsza wizyta: SW rejestruje się po „load”; czekamy aż przejmie stronę, potem druga wizyta zapełnia cache.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator('#list .item').first()).toBeVisible();
    await expect.poll(() => wczytaneKafle(page)).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    const naLiscie = await page.locator('#list .item').count();

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#list .item')).toHaveCount(naLiscie);
    await expect.poll(() => wczytaneKafle(page)).toBeGreaterThan(0);
    await context.setOffline(false);
  });
});
