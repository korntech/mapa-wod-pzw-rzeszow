/* Mapa do druku (druk.html): arkusze z podkładem i numerami, klucz zgodny z danymi, układ do druku.
 * Niska rozdzielczość (?dpi=72) — kilkanaście kafli na arkusz, żeby test trwał sekundy. */
import { test, expect } from '@playwright/test';
import { daneStrony, domyslnieNaLiscie, tylkoSnapshot } from './pomocnicze.mjs';

test.use({ serviceWorkers: 'block' });

const GOTOWE = () => /^Gotowe|^Nie udało/.test(document.getElementById('status').textContent);

test('przegląd + klucz: obraz z podkładem, numery zgodne z danymi, jedna strona na arkusz', async ({
  page,
  request,
  baseURL,
  browserName,
}) => {
  test.setTimeout(120_000);
  const dane = await daneStrony(request, baseURL);
  await tylkoSnapshot(page);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(e.message));

  await page.goto('./druk.html?auto=1&dpi=72&atlas=1&format=A4&orientacja=pozioma');
  await page.waitForFunction(GOTOWE, null, { timeout: 90_000 });
  await expect(page.locator('#status')).toContainText('Gotowe: 1 arkusz');
  await expect(page.locator('#status')).toContainText(`${domyslnieNaLiscie(dane)} pozycji`);

  const obraz = page.locator('img.mapa-obraz');
  await expect(obraz).toHaveCount(1);
  const [szer, wys] = await obraz.evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  // A4 pozioma, obszar mapy 277×172 mm przy 72 dpi.
  expect(szer).toBe(Math.round((277 / 25.4) * 72));
  expect(wys).toBe(Math.round((172 / 25.4) * 72));
  // Płótno nie jest białe — podkład i rysunek trafiły na obraz.
  const niebiale = await obraz.evaluate((img) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++;
    return n / (d.length / 16);
  });
  expect(niebiale).toBeGreaterThan(0.05);

  // Klucz: numeracja 1…N zbiorników, R1…, sekcje jak warstwy domyślne (granice wyłączone).
  await expect(page.locator('.klucz h3.zb')).toHaveCount(1);
  await expect(page.locator('.klucz h3.gr')).toHaveCount(0);
  const numery = await page.locator('.klucz td.nr').allTextContents();
  expect(numery.slice(0, dane.zb.length)).toEqual(dane.zb.map((_, i) => String(i + 1)));
  expect(numery.filter((n) => n.startsWith('R'))).toHaveLength(dane.rivers.length);
  await expect(page.locator('.naglowek .arkusz').first()).toContainText(/skala ok\. 1:\d/);
  await expect(page.locator('.stopka').first()).toContainText('mapa poglądowa');

  // Układ do druku: arkusz mapy mieści się na jednej stronie A4 poziomej (277×190 mm bez marginesów).
  if (browserName === 'chromium') {
    await page.emulateMedia({ media: 'print' });
    const mm = await page.locator('.strona.mapa').evaluate((s) => {
      const r = s.getBoundingClientRect();
      const px = (v) => Math.round((v / 96) * 25.4);
      return [px(r.width), px(r.height)];
    });
    expect(mm[0]).toBeLessThanOrEqual(278);
    expect(mm[1]).toBeLessThanOrEqual(191);
    await expect(page.locator('#ustawienia')).toBeHidden();
  }
  expect(bledy).toEqual([]);
});

test('atlas 2×2 z filtrami: 5 arkuszy, kolumna „Arkusz”, tylko wybrane warstwy', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const dane = await daneStrony(request, baseURL);
  await tylkoSnapshot(page);
  const nokill = dane.zb.filter((z) => z.nk).length;
  await page.goto('./druk.html?auto=1&dpi=60&atlas=2&w=zb&w=gr&nokill=1&podklad=brak');
  await page.waitForFunction(GOTOWE, null, { timeout: 120_000 });
  await expect(page.locator('#status')).toContainText('Gotowe: 5 arkusze');
  await expect(page.locator('img.mapa-obraz')).toHaveCount(5);
  await expect(page.locator('.naglowek .arkusz').nth(1)).toContainText('Arkusz A1');
  await expect(page.locator('.klucz h3.zb')).toHaveCount(1);
  await expect(page.locator('.klucz h3.gr')).toHaveCount(1);
  await expect(page.locator('.klucz h3.niz')).toHaveCount(0);
  expect(await page.locator('.klucz td.nr').allTextContents()).toHaveLength(nokill + dane.granice.length);
  // Każda pozycja leży na co najmniej jednym arkuszu atlasu.
  const arkusze = await page.locator('.klucz td.ark').allTextContents();
  expect(arkusze.every((a) => /[A-B][12]/.test(a))).toBeTruthy();
});

test('widok z mapy: link z menu mapy niesie bieżący obszar', async ({ page }) => {
  await tylkoSnapshot(page);
  await page.goto('./');
  await expect(page.locator('#list .item').first()).toBeAttached();
  const href = await page.locator('#druklink').getAttribute('href');
  expect(href).toMatch(/^druk\.html\?b=-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+$/);
  await page.goto('./' + href);
  await expect(page.locator('#zakres')).toHaveValue('widok');
});
