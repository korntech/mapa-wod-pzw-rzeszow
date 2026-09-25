/* Wyszukiwarka, filtry i popup łowiska z nawigacją — to, czego wędkarz używa najczęściej. */
import { test, expect } from '@playwright/test';
import { CONFIG, czyAndroid, daneStrony, domyslnieNaLiscie, liczbaPozycji, otworzMape, tylkoSnapshot } from './pomocnicze.mjs';

let dane;
test.beforeEach(async ({ page, request, baseURL }) => {
  dane = await daneStrony(request, baseURL);
  await tylkoSnapshot(page);
  await otworzMape(page);
});

test('wyszukiwarka ignoruje wielkość liter i polskie znaki', async ({ page }) => {
  const nazwa = dane.zb.find((z) => /[ąćęłńóśźż]/i.test(z.n))?.n || dane.zb[0].n;
  const bezZnakow = nazwa
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toUpperCase();

  await page.locator('#search').fill(bezZnakow);
  await expect(page.locator('#list .item').filter({ hasText: nazwa }).first()).toBeVisible();
  expect(await liczbaPozycji(page)).toBeLessThan(domyslnieNaLiscie(dane));

  await page.locator('#search').fill('xyzxyz-nie-ma-takiej-wody');
  await expect(page.locator('#list .item')).toHaveCount(0);
  await expect(page.locator('#count')).toContainText('0 pozycji');

  await page.locator('#search').fill('');
  await expect.poll(() => liczbaPozycji(page)).toBe(domyslnieNaLiscie(dane));
});

test('warstwy, NO-KILL, obwód i „Wyczyść”', async ({ page }) => {
  const wszystkie = domyslnieNaLiscie(dane);

  await page.locator('.chip[data-f="zb"]').click();
  await expect.poll(() => liczbaPozycji(page)).toBe(dane.rivers.length);
  await page.locator('.chip[data-f="zb"]').click();
  await expect.poll(() => liczbaPozycji(page)).toBe(wszystkie);

  await page.locator('.chip[data-f="gr"]').click();
  await expect.poll(() => liczbaPozycji(page)).toBe(wszystkie + dane.granice.length);
  await page.locator('.chip[data-f="gr"]').click();

  await page.locator('#morebtn').click();
  await expect(page.locator('#more')).toBeVisible();
  await expect(page.locator('#morebtn')).toHaveAttribute('aria-expanded', 'true');

  await page.locator('#kinds .chip[data-nk]').click();
  await expect.poll(() => liczbaPozycji(page)).toBe(dane.zb.filter((z) => z.nk).length + dane.rivers.length);
  await expect(page.locator('#morebtn')).toHaveClass(/active/);

  await page.locator('#resetbtn').click();
  await expect.poll(() => liczbaPozycji(page)).toBe(wszystkie);

  const obwod = await page.locator('#obwod option').nth(1).getAttribute('value');
  await page.locator('#obwod').selectOption(obwod);
  const wObwodzie = [...dane.zb, ...dane.rivers].filter((x) => (x.o || '') === obwod).length;
  await expect.poll(() => liczbaPozycji(page)).toBe(wObwodzie);

  await page.locator('#resetbtn').click();
  await expect.poll(() => liczbaPozycji(page)).toBe(wszystkie);
  await expect(page.locator('#morebtn')).not.toHaveClass(/active/);
});

test('kliknięcie w liście otwiera popup z nawigacją właściwą dla systemu', async ({ page }) => {
  const pierwsza = page.locator('#list .item').first();
  const nazwa = (await pierwsza.locator('b').textContent()).trim();
  await pierwsza.click();

  const popup = page.locator('.leaflet-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('h3')).toHaveText(nazwa);

  const href = await popup.getByRole('link', { name: /Nawiguj/ }).getAttribute('href');
  const szablon = (await czyAndroid(page)) ? CONFIG.links.navigation.android : CONFIG.links.navigation.default;
  expect(href.startsWith(szablon.split('{')[0])).toBeTruthy();
  expect(href).toMatch(/\d+\.\d+,\d+\.\d+/);
  await expect(popup.getByRole('link', { name: /Zgłoś uwagę/ })).toBeVisible();
});
