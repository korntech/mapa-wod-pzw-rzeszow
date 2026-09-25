/* „📍 Najbliżej mnie”: sortowanie listy wg odległości od (symulowanej) pozycji wędkarza. */
import { test, expect } from '@playwright/test';
import { otworzMape } from './pomocnicze.mjs';

const RZESZOW = { latitude: 50.0413, longitude: 21.999 };

test.describe('lokalizacja udostępniona', () => {
  test.use({ geolocation: RZESZOW, permissions: ['geolocation'] });

  test('lista posortowana rosnąco wg km, na mapie „Tu jesteś”', async ({ page }) => {
    await otworzMape(page);
    await page.locator('#locbtn').click();

    await expect(page.locator('#count')).toContainText('posortowano wg odległości');
    const km = await page
      .locator('#list .item')
      .evaluateAll((items) => items.map((i) => parseFloat(/· ([\d.]+) km/.exec(i.textContent)?.[1])));
    expect(km.length).toBeGreaterThan(0);
    expect(km.every(Number.isFinite)).toBeTruthy();
    expect(km).toEqual([...km].sort((a, b) => a - b));
    // Rzeszów leży w Okręgu — najbliższe łowisko w promieniu kilkudziesięciu km.
    expect(km[0]).toBeLessThan(50);
  });
});

test.describe('lokalizacja zablokowana', () => {
  // Bez uprawnienia: Chromium odmawia od razu; WebKit i Firefox czekałyby na okno zgody.
  test.skip(({ browserName }) => browserName !== 'chromium', 'odmowa bez okna zgody tylko w Chromium');

  test('pokazuje komunikat na stronie (bez okna alert) i nie psuje listy', async ({ page }) => {
    await otworzMape(page);
    let okno = false;
    page.on('dialog', (d) => {
      okno = true;
      d.dismiss();
    });
    await page.locator('#locbtn').click();
    await expect(page.locator('#komunikat')).toContainText('lokalizacj');
    expect(okno).toBe(false);
    await expect(page.locator('#count')).not.toContainText('posortowano');
    await expect(page.locator('#list .item').first()).toBeAttached();
  });
});
