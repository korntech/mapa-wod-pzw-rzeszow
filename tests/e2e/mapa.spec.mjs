/* Mapa się otwiera: dane łowisk, podkład przez cache kafli, zoom i przesuwanie, układ na ekranie. */
import { test, expect } from '@playwright/test';
import {
  KAFLE_HOST,
  GEOPORTAL_HOST,
  KOMUNIKAT_ZAPASOWY,
  daneStrony,
  domyslnieNaLiscie,
  liczbaPozycji,
  otworzMape,
  otworzOMapie,
  sledz,
  tylkoSnapshot,
  wczytaneKafle,
  zepsuteKafle,
} from './pomocnicze.mjs';

test('wczytuje łowiska z bazy i podkład przez cache kafli, bez błędów', async ({ page }) => {
  const s = sledz(page);
  const baza = page.waitForResponse((r) => r.url().includes('/rest/v1/') && r.request().method() === 'GET');
  await otworzMape(page);

  expect((await baza).status()).toBe(200);
  const n = await liczbaPozycji(page);
  expect(n).toBeGreaterThanOrEqual(40);
  await expect(page.locator('#list .item')).toHaveCount(n);

  const hosty = new Set(s.kafle.map((k) => k.host));
  expect([...hosty]).toEqual([KAFLE_HOST || GEOPORTAL_HOST]);
  expect(s.kafle.filter((k) => k.status !== 200)).toEqual([]);
  await expect(page.getByText(KOMUNIKAT_ZAPASOWY)).toHaveCount(0);
  expect(s.bledy).toEqual([]);
});

test('baza niedostępna → dane ze snapshotu (liczby zgodne z data.json)', async ({
  page,
  request,
  baseURL,
}) => {
  const s = sledz(page);
  const dane = await daneStrony(request, baseURL);
  await tylkoSnapshot(page);
  await otworzMape(page);

  await expect.poll(() => liczbaPozycji(page)).toBe(domyslnieNaLiscie(dane));
  await expect(page.locator('#list .item')).toHaveCount(domyslnieNaLiscie(dane));
  // Łowiska rysowane na canvas (jedna warstwa rysunku zamiast tysięcy elementów SVG).
  await expect(page.locator('#map canvas.leaflet-zoom-animated')).toHaveCount(1);
  await expect(page.locator('#count')).toContainText('Dane: ' + dane.meta.snapshot.slice(0, 10));

  const hosty = new Set(s.kafle.map((k) => k.host));
  expect([...hosty]).toEqual([KAFLE_HOST || GEOPORTAL_HOST]);
  expect(s.kafle.filter((k) => k.status !== 200)).toEqual([]);
  await expect(page.getByText(KOMUNIKAT_ZAPASOWY)).toHaveCount(0);
  expect(s.bledy).toEqual([]);
});

test('zoom i przesuwanie dociągają nowe kafle', async ({ page }) => {
  const s = sledz(page);
  await otworzMape(page);
  const przed = s.kafle.length;

  await page.locator('.leaflet-control-zoom-in').click();
  await page.locator('.leaflet-control-zoom-in').click();
  const box = await page.locator('#map').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - box.width / 3, cy - box.height / 4, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => s.kafle.length).toBeGreaterThan(przed);
  await expect.poll(() => wczytaneKafle(page)).toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(await zepsuteKafle(page)).toBe(0);
  expect(s.kafle.filter((k) => k.status !== 200)).toEqual([]);
});

test('układ mieści się na ekranie (bez poziomego przewijania)', async ({ page }) => {
  await otworzMape(page);
  const { szer, okno } = await page.evaluate(() => ({
    szer: document.documentElement.scrollWidth,
    okno: window.innerWidth,
  }));
  expect(szer).toBeLessThanOrEqual(okno);

  const telefon = await page.locator('#uchwyt').isVisible();
  const przyciski = [
    '#locbtn',
    '#search',
    '.leaflet-control-zoom-in',
    '.leaflet-control-layers',
    '.pzw-legenda-btn',
  ];
  for (const sel of [...przyciski, telefon ? '#menubtn' : '#infobtn']) {
    await expect(page.locator(sel)).toBeInViewport();
  }
  const mapa = await page.locator('#map').boundingBox();
  expect(mapa.height).toBeGreaterThan(telefon ? 400 : 200);
  if (telefon) {
    // Panel listy: domyślnie wysunięty tylko na wyszukiwarkę; po rozwinięciu lista jest widoczna.
    await expect(page.locator('#side')).toHaveAttribute('data-stan', 'peek');
    await page.locator('#uchwyt').click();
    await expect(page.locator('#side')).toHaveAttribute('data-stan', 'half');
  }
  await expect(page.locator('#list .item').first()).toBeInViewport();
});

test('menu ☰ na telefonie otwiera i zamyka linki', async ({ page }) => {
  await otworzMape(page);
  test.skip(!(await page.locator('#menubtn').isVisible()), 'menu ☰ tylko na wąskim ekranie');
  await expect(page.locator('#menu')).toBeHidden();
  await page.locator('#menubtn').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menubtn')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('header h1').click();
  await expect(page.locator('#menu')).toBeHidden();
});

test('legenda rozwija się i zwija', async ({ page }) => {
  await otworzMape(page);
  const lista = page.locator('.pzw-legenda ul');
  await expect(lista).toBeHidden();
  await page.locator('.pzw-legenda-btn').click();
  await expect(lista).toBeVisible();
  await expect(lista).toContainText('Położenie przybliżone');
  await page.locator('.pzw-legenda-btn').click();
  await expect(lista).toBeHidden();
});

test('okno „O mapie” otwiera się i zamyka', async ({ page }) => {
  await otworzMape(page);
  await otworzOMapie(page);
  await expect(page.locator('#stan-danych')).toContainText('Dane');
  await page.locator('#infomodal [data-close]').click();
  await expect(page.locator('#infomodal')).toBeHidden();
});
