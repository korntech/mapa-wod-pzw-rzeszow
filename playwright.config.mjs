/* Testy E2E mapy publicznej (tests/e2e/) na żywej stronie, w urządzeniach, których używają
 * wędkarze: komputery (Chrome, Firefox, Safari), iPhone/iPad (WebKit — każda przeglądarka na iOS),
 * telefony z Androidem (Chrome). Domyślnie strona produkcyjna, bo cache kafli (Worker) odpowiada
 * tylko adresom z ALLOWED_ORIGINS; inny adres: E2E_URL=https://… npm run e2e.
 * Przeglądarki: npx playwright install chromium firefox webkit. */
import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Żywa sieć (Geoportal, Worker, GitHub Pages) — jedno ponowienie odsiewa chwilowe czkawki.
  retries: CI ? 1 : 0,
  workers: CI ? 4 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_URL || config.site.url,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: devices['Desktop Chrome'] },
    { name: 'desktop-firefox', use: devices['Desktop Firefox'] },
    { name: 'desktop-safari', use: devices['Desktop Safari'] },
    { name: 'iphone-15', use: devices['iPhone 15'] },
    { name: 'iphone-se', use: devices['iPhone SE'] },
    { name: 'ipad', use: devices['iPad (gen 7)'] },
    { name: 'pixel-7', use: devices['Pixel 7'] },
    { name: 'galaxy-s9', use: devices['Galaxy S9+'] },
  ],
});
