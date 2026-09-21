import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, issueContent, LIMITY } from './zgloszenie.js';

const poprawne = {
  typ: 'zb',
  nazwa: 'Zalew Rzeszowski',
  lat: 50.0123456,
  lon: 22.0123456,
  opis: 'Zbiornik jest zaznaczony w złym miejscu.',
  kontakt: 'jan@example.com',
  www: '',
};

test('przyjmuje poprawne zgłoszenie i przycina pola', () => {
  const wynik = validateReport({ ...poprawne, opis: '  ' + poprawne.opis + '  ', kontakt: ' jan@example.com ' });
  assert.equal(wynik.ok, true);
  assert.deepEqual(wynik.report, {
    typ: 'zb',
    nazwa: 'Zalew Rzeszowski',
    lat: 50.012346,
    lon: 22.012346,
    opis: 'Zbiornik jest zaznaczony w złym miejscu.',
    kontakt: 'jan@example.com',
  });
});

test('odrzuca nieznany typ wody', () => {
  const wynik = validateReport({ ...poprawne, typ: 'jezioro' });
  assert.deepEqual(wynik, { ok: false, error: 'typ' });
});

test('odrzuca pustą nazwę', () => {
  assert.deepEqual(validateReport({ ...poprawne, nazwa: '  ' }), { ok: false, error: 'nazwa' });
});

test('odrzuca opis krótszy niż minimum', () => {
  assert.deepEqual(validateReport({ ...poprawne, opis: 'za krótko' }), { ok: false, error: 'opis' });
});

test('odrzuca opis dłuższy niż maksimum', () => {
  const opis = 'x'.repeat(LIMITY.opisMax + 1);
  assert.deepEqual(validateReport({ ...poprawne, opis }), { ok: false, error: 'opis' });
});

test('odrzuca zgłoszenie z wypełnionym polem-pułapką', () => {
  assert.deepEqual(validateReport({ ...poprawne, www: 'http://spam' }), { ok: false, error: 'spam' });
});

test('odrzuca współrzędne spoza zakresu', () => {
  assert.deepEqual(validateReport({ ...poprawne, lat: 91 }), { ok: false, error: 'wspolrzedne' });
  assert.deepEqual(validateReport({ ...poprawne, lon: 'abc' }), { ok: false, error: 'wspolrzedne' });
});

test('brak kontaktu jest dozwolony', () => {
  const wynik = validateReport({ ...poprawne, kontakt: undefined });
  assert.equal(wynik.ok, true);
  assert.equal(wynik.report.kontakt, '');
});

test('odrzuca wejście, które nie jest obiektem', () => {
  assert.deepEqual(validateReport(null), { ok: false, error: 'typ' });
});

test('treść issue zawiera nazwę, typ, współrzędne, opis, kontakt i link do mapy', () => {
  const { report } = validateReport(poprawne);
  const { title, body } = issueContent(report, 'https://example.org/mapa/');
  assert.equal(title, 'Zgłoszenie: Zalew Rzeszowski');
  assert.match(body, /zbiornik/);
  assert.match(body, /50\.012346, 22\.012346/);
  assert.match(body, /Zbiornik jest zaznaczony w złym miejscu\./);
  assert.match(body, /jan@example\.com/);
  assert.match(body, /https:\/\/example\.org\/mapa\//);
});

test('treść issue bez kontaktu nie zostawia pustego pola', () => {
  const { report } = validateReport({ ...poprawne, kontakt: '' });
  const { body } = issueContent(report, 'https://example.org/');
  assert.doesNotMatch(body, /Kontakt/);
});

test('treść issue neutralizuje znaczniki markdown w opisie użytkownika', () => {
  const { report } = validateReport({ ...poprawne, opis: '# nagłówek\n- [ ] zadanie\n\n<script>alert(1)</script>' });
  const { body } = issueContent(report, 'https://example.org/');
  assert.doesNotMatch(body, /^# nagłówek/m);
  assert.doesNotMatch(body, /<script>/);
});
