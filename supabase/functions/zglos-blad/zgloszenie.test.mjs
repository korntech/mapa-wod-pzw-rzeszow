import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, issueContent, blokKodu, LIMITY } from './zgloszenie.js';

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
  const wynik = validateReport({
    ...poprawne,
    opis: '  ' + poprawne.opis + '  ',
    kontakt: ' jan@example.com ',
  });
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

test('treść issue zawiera nazwę, typ, współrzędne, opis i link do mapy; kontakt NIE jest publikowany', () => {
  const { report } = validateReport(poprawne);
  const { title, body } = issueContent(report, 'https://example.org/mapa/', 17);
  assert.equal(title, 'Zgłoszenie: Zalew Rzeszowski');
  assert.match(body, /zbiornik/);
  assert.match(body, /50\.012346, 22\.012346/);
  assert.match(body, /Zbiornik jest zaznaczony w złym miejscu\./);
  assert.doesNotMatch(body, /jan@example\.com/);
  assert.match(body, /Kontakt:\*\* podany — dostępny operatorom w bazie \(wpis nr 17\)/);
  assert.match(body, /https:\/\/example\.org\/mapa\//);
});

test('treść issue bez kontaktu nie zostawia pustego pola', () => {
  const { report } = validateReport({ ...poprawne, kontakt: '' });
  const { body } = issueContent(report, 'https://example.org/');
  assert.doesNotMatch(body, /Kontakt/);
});

test('opis użytkownika trafia do bloku kodu: markdown, HTML, linki i wzmianki nie działają', () => {
  const opis = '# nagłówek\n- [ ] zadanie\n@octocat zobacz https://zly.example/x <script>alert(1)</script>';
  const { report } = validateReport({ ...poprawne, opis });
  const { body } = issueContent(report, 'https://example.org/');
  const blok = body.slice(body.indexOf('```text'), body.lastIndexOf('```') + 3);
  assert.ok(blok.includes(opis), 'opis w całości wewnątrz ogrodzenia');
  const pozaBlokiem = body.replace(blok, '');
  assert.doesNotMatch(pozaBlokiem, /@octocat|<script>|zly\.example/);
});

test('ogrodzenie bloku kodu jest dłuższe niż odwrotne apostrofy w treści', () => {
  const s = 'a\n```\nb\n````\nc';
  const wynik = blokKodu(s);
  assert.ok(wynik.startsWith('`````text\n'));
  assert.ok(wynik.endsWith('\n`````'));
});

test('odrzuca pola spoza schematu i klucze z prototypu jako typ', () => {
  assert.deepEqual(validateReport({ ...poprawne, extra: 1 }), { ok: false, error: 'schemat' });
  for (const typ of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual(validateReport({ ...poprawne, typ }), { ok: false, error: 'typ' }, typ);
  }
  assert.deepEqual(validateReport({ ...poprawne, typ: ['zb'] }), { ok: false, error: 'typ' });
  assert.deepEqual(validateReport([poprawne]), { ok: false, error: 'typ' });
});

test('współrzędne jako obiekt lub tablica są odrzucane', () => {
  assert.deepEqual(validateReport({ ...poprawne, lat: [50] }), { ok: false, error: 'wspolrzedne' });
  assert.deepEqual(validateReport({ ...poprawne, lon: { valueOf: () => 22 } }), {
    ok: false,
    error: 'wspolrzedne',
  });
});

test('tytuł issue nie zawiera znaków markdown ani wzmianek z nazwy', () => {
  const { report } = validateReport({ ...poprawne, nazwa: '@octocat **Zalew** <b>' });
  const { title } = issueContent(report, 'https://example.org/');
  assert.equal(title, 'Zgłoszenie: octocat Zalew b');
});
