/* Wyszukiwarka, filtry i popup łowiska z nawigacją — to, czego wędkarz używa najczęściej. */
import { test, expect } from '@playwright/test';
import {
  CONFIG,
  czyAndroid,
  daneStrony,
  domyslnieNaLiscie,
  kliknijWLiscie,
  liczbaPozycji,
  otworzMape,
  rozwinPanel,
  tylkoSnapshot,
} from './pomocnicze.mjs';

let dane;
test.beforeEach(async ({ page, request, baseURL }) => {
  dane = await daneStrony(request, baseURL);
  await tylkoSnapshot(page);
  await otworzMape(page);
  await rozwinPanel(page);
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

test('popup z listy: wybór aplikacji do nawigacji, zapamiętany na następny raz', async ({ page }) => {
  const nazwa = await kliknijWLiscie(page);
  const popup = page.locator('.leaflet-popup');
  await expect(popup.locator('h3')).toHaveText(nazwa.replace(/ \(odcinek \d+\)$/, ''));

  await popup.getByRole('link', { name: /Nawiguj/ }).click();
  const aplikacje = popup.locator('.nav-wybor a');
  const android = await czyAndroid(page);
  const oczekiwane = CONFIG.links.navigation.filter((a) => android || !a.tylkoAndroid);
  await expect(aplikacje).toHaveText(oczekiwane.map((a) => a.nazwa));
  for (const [i, a] of oczekiwane.entries()) {
    const href = await aplikacje.nth(i).getAttribute('href');
    expect(href.startsWith(a.url.split('{')[0])).toBeTruthy();
    expect(href).toMatch(/\d+\.\d+,\d+\.\d+/);
  }

  // Wybór zapamiętany: po ponownym otwarciu „Nawiguj” prowadzi od razu do Google Maps.
  await page.evaluate(() => localStorage.setItem('pzw-nawigacja', 'google'));
  await popup.locator('.leaflet-popup-close-button').click();
  await kliknijWLiscie(page);
  const nawiguj = page.locator('.leaflet-popup').getByRole('link', { name: /Nawiguj/ });
  await expect(nawiguj).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\//);
  await expect(page.locator('.leaflet-popup')).toContainText('(Google Maps)');
});

test('adres wskazuje otwarte łowisko; link otwiera je w nowej karcie; „Udostępnij” kopiuje link', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.__skopiowane = [];
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (t) => window.__skopiowane.push(t) },
      configurable: true,
    });
  });
  await page.reload();
  await expect(page.locator('#list .item').first()).toBeVisible();
  const nazwa = await kliknijWLiscie(page);
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toMatch(/^#w=(zb|rz)-[a-z0-9-]+$/);

  await page
    .locator('.leaflet-popup')
    .getByRole('link', { name: /Udostępnij/ })
    .click();
  await expect(page.locator('#komunikat')).toContainText('skopiowany');
  const [link] = await page.evaluate(() => window.__skopiowane);
  expect(link).toBe(CONFIG.site.url + hash);

  const druga = await context.newPage();
  await druga.goto('./' + hash);
  await expect(druga.locator('.leaflet-popup h3')).toHaveText(nazwa.replace(/ \(odcinek \d+\)$/, ''));

  await page.locator('.leaflet-popup-close-button').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
});
