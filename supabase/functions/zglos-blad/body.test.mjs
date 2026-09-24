import { test } from 'node:test';
import assert from 'node:assert/strict';
import { czytajBody } from './body.js';

/** Strumień wydający `n` porcji po `size` bajtów; liczy, ile porcji faktycznie pobrano. */
function strumien(n, size) {
  const stan = { wydane: 0, anulowany: false };
  const s = new ReadableStream({
    pull(ctrl) {
      if (stan.wydane >= n) return ctrl.close();
      stan.wydane++;
      ctrl.enqueue(new Uint8Array(size).fill(97));
    },
    cancel() {
      stan.anulowany = true;
    },
  });
  return { s, stan };
}

test('treść w limicie jest odczytana w całości', async () => {
  const { s } = strumien(4, 1024);
  const w = await czytajBody(s, 16 * 1024);
  assert.equal(w.ok, true);
  assert.equal(w.text.length, 4096);
});

test('64 KB przy limicie 16 KB: odczyt przerwany po przekroczeniu progu, strumień anulowany', async () => {
  const { s, stan } = strumien(64, 1024);
  const w = await czytajBody(s, 16 * 1024);
  assert.deepEqual(w, { ok: false, error: 'rozmiar' });
  assert.ok(stan.wydane <= 18, `pobrano ${stan.wydane} porcji zamiast ≤18`);
  assert.equal(stan.anulowany, true);
});

test('brak treści = pusty tekst', async () => {
  assert.deepEqual(await czytajBody(null, 10), { ok: true, text: '' });
});

test('poprawnie dekoduje UTF-8 podzielone między porcje', async () => {
  const bytes = new TextEncoder().encode('Zbiornik Rzeszów — łowisko');
  const s = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(bytes.slice(0, 11));
      ctrl.enqueue(bytes.slice(11));
      ctrl.close();
    },
  });
  const w = await czytajBody(s, 1024);
  assert.equal(w.text, 'Zbiornik Rzeszów — łowisko');
});
