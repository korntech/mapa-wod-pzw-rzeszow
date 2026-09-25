/* Formularz „Zgłoś uwagę”. Funkcja zgłoszeń jest podmieniona (page.route) — testy nie tworzą
 * prawdziwych issue w repozytorium ani wpisów w bazie. */
import { test, expect } from '@playwright/test';
import { FUNKCJA_ZGLOSZEN, otworzMape } from './pomocnicze.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Podmienia funkcję zgłoszeń; zwraca listę wysłanych treści. */
async function atrapaFunkcji(page, status, odpowiedz) {
  const wyslane = [];
  // Twarda blokada: żadne żądanie do funkcji nie może wyjść do sieci poza atrapą.
  await page.context().route(FUNKCJA_ZGLOSZEN, (route) => route.abort('blockedbyclient'));
  await page.route(FUNKCJA_ZGLOSZEN, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    wyslane.push(req.postDataJSON());
    return route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(odpowiedz) });
  });
  return wyslane;
}

/** Otwiera formularz z popupu pierwszego łowiska na liście; zwraca jego nazwę. */
async function otworzZPopupu(page) {
  const pierwsza = page.locator('#list .item').first();
  const nazwa = (await pierwsza.locator('b').textContent()).trim();
  await pierwsza.click();
  await page.locator('.leaflet-popup').getByRole('link', { name: /Zgłoś uwagę/ }).click();
  await expect(page.locator('#reportmodal')).toBeVisible();
  return nazwa;
}

// Bez service workera: w WebKit żądania strony kontrolowanej przez SW omijają page.route,
// więc atrapa by nie zadziałała i test wysłałby PRAWDZIWE zgłoszenie.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await otworzMape(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker?.controller), 'SW nie może kontrolować strony').toBe(false);
});

test('walidacja, wysłanie i potwierdzenie z numerem', async ({ page }) => {
  const wyslane = await atrapaFunkcji(page, 200, {
    ok: true,
    numer: 999,
    url: 'https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/issues/999',
  });
  const nazwa = await otworzZPopupu(page);
  const form = page.locator('#reportform');
  // Woda wybrana z popupu.
  expect(await form.locator('select[name=woda] option:checked').textContent()).toContain(nazwa.replace(/ \(odcinek \d+\)$/, ''));

  await form.locator('textarea[name=opis]').fill('krótko');
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(form.locator('.status')).toContainText('Opis musi mieć');
  expect(wyslane).toHaveLength(0);

  await form.locator('textarea[name=opis]').fill('Test automatyczny E2E — brak tablicy informacyjnej przy wjeździe.');
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(page.locator('#rep-done')).toBeVisible();
  await expect(page.locator('#rep-done [data-numer]')).toHaveText('999');
  expect(wyslane).toHaveLength(1);
  expect(wyslane[0].opis).toContain('Test automatyczny E2E');

  await page.locator('#rep-done [data-close]').click();
  await expect(page.locator('#reportmodal')).toBeHidden();
});

test('„Inne” wymaga nazwy; awaria serwera daje link zapasowy do GitHuba', async ({ page }) => {
  await atrapaFunkcji(page, 503, { ok: false, error: 'baza' });
  await page.locator('#infobtn').click();
  await page.locator('#infomodal a[data-report]').click();
  const form = page.locator('#reportform');
  await expect(form).toBeVisible();

  await form.locator('select[name=woda]').selectOption('inne');
  await expect(page.locator('#rep-inne')).toBeVisible();
  await form.locator('textarea[name=opis]').fill('Brakuje na mapie stawu, który jest w wykazie Okręgu.');
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(form.locator('.status')).toContainText('znaków');

  await form.locator('input[name=nazwa]').fill('Staw testowy E2E');
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(form.locator('.status')).toContainText('Serwer zgłoszeń jest chwilowo niedostępny');
  const zapasowy = form.locator('.status a');
  await expect(zapasowy).toHaveAttribute('href', /\/issues\/new\?title=/);
  await expect(form.getByRole('button', { name: 'Wyślij zgłoszenie' })).toBeEnabled();
});
