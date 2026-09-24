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

test('znaki CR, NEL, LS i PS nie zamykają bloku kodu (normalizacja końców linii)', () => {
  for (const nl of ['\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
    const opis = `opis${nl}\`\`\`${nl}@octocat zobacz${nl}\`\`\``;
    const wynik = blokKodu(opis);
    const linie = wynik.split('\n');
    assert.equal(linie[0], '````text', JSON.stringify(nl));
    assert.equal(linie.at(-1), '````');
    // Żadna wewnętrzna linia nie jest ogrodzeniem o długości ≥ 4 (czyli nie zamyka bloku).
    const wewnetrzne = linie.slice(1, -1);
    assert.ok(
      wewnetrzne.every((l) => !/^\s{0,3}`{4,}\s*$/.test(l)),
      JSON.stringify(wewnetrzne)
    );
    assert.ok(!wynik.includes('\r') && !wynik.includes('\u2028') && !wynik.includes('\u0085'));
  }
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

/* ===== Typ „inne”: brakujące łowisko albo uwaga ogólna — nazwa od użytkownika, bez współrzędnych ===== */

const inne = {
  typ: 'inne',
  nazwa: 'Staw w Boguchwale',
  opis: 'Brakuje tego łowiska na mapie, jest w wykazie na 2026.',
  kontakt: '',
  www: '',
};

test('inne: bez współrzędnych jest poprawne, lat/lon w raporcie to null', () => {
  for (const wsp of [
    {},
    { lat: null, lon: null },
    { lat: '', lon: '' },
    { lat: undefined, lon: undefined },
  ]) {
    const wynik = validateReport({ ...inne, ...wsp });
    assert.equal(wynik.ok, true, JSON.stringify(wsp));
    assert.deepEqual(wynik.report, {
      typ: 'inne',
      nazwa: 'Staw w Boguchwale',
      lat: null,
      lon: null,
      opis: inne.opis,
      kontakt: '',
    });
  }
});

test('inne: podane współrzędne są sprawdzane i zaokrąglane; błędne → wspolrzedne', () => {
  const ok = validateReport({ ...inne, lat: 50.0123456, lon: 22.0123456 });
  assert.equal(ok.ok, true);
  assert.equal(ok.report.lat, 50.012346);
  assert.equal(ok.report.lon, 22.012346);
  assert.deepEqual(validateReport({ ...inne, lat: 91, lon: 22 }), { ok: false, error: 'wspolrzedne' });
  assert.deepEqual(validateReport({ ...inne, lat: 'abc', lon: 22 }), { ok: false, error: 'wspolrzedne' });
  // Tylko jedna współrzędna to nie „brak współrzędnych”.
  assert.deepEqual(validateReport({ ...inne, lat: 50 }), { ok: false, error: 'wspolrzedne' });
  assert.deepEqual(validateReport({ ...inne, lat: null, lon: 22 }), { ok: false, error: 'wspolrzedne' });
});

test('inne: pusta albo jednoznakowa nazwa → nazwa; nazwa jest przycinana do jednej linii', () => {
  assert.deepEqual(validateReport({ ...inne, nazwa: '' }), { ok: false, error: 'nazwa' });
  assert.deepEqual(validateReport({ ...inne, nazwa: '   ' }), { ok: false, error: 'nazwa' });
  assert.deepEqual(validateReport({ ...inne, nazwa: 'X' }), { ok: false, error: 'nazwa' });
  assert.deepEqual(validateReport({ ...inne, nazwa: undefined }), { ok: false, error: 'nazwa' });
  const w = validateReport({ ...inne, nazwa: '  Staw\n# nagłówek\r\n  pod   lasem ' });
  assert.equal(w.ok, true);
  assert.equal(w.report.nazwa, 'Staw # nagłówek pod lasem');
  const dluga = validateReport({ ...inne, nazwa: 'x'.repeat(LIMITY.nazwaMax + 50) });
  assert.equal(dluga.report.nazwa.length, LIMITY.nazwaMax);
});

test('zb i rzeka nadal wymagają współrzędnych', () => {
  assert.deepEqual(validateReport({ ...poprawne, lat: null, lon: null }), {
    ok: false,
    error: 'wspolrzedne',
  });
  assert.deepEqual(validateReport({ ...poprawne, lat: '', lon: '' }), { ok: false, error: 'wspolrzedne' });
  const { lat, lon, ...bez } = poprawne;
  assert.deepEqual(validateReport(bez), { ok: false, error: 'wspolrzedne' });
  assert.deepEqual(validateReport({ ...bez, typ: 'rzeka' }), { ok: false, error: 'wspolrzedne' });
});

test('inne: ścisły schemat pól i limity opisu obowiązują tak samo', () => {
  assert.deepEqual(validateReport({ ...inne, extra: 1 }), { ok: false, error: 'schemat' });
  assert.deepEqual(validateReport({ ...inne, www: 'x' }), { ok: false, error: 'spam' });
  assert.deepEqual(validateReport({ ...inne, opis: 'krótko' }), { ok: false, error: 'opis' });
});

test('treść issue dla inne: tytuł z nazwą, etykieta typu „inne”, bez linii „Współrzędne”', () => {
  const { report } = validateReport({ ...inne, kontakt: 'jan@example.com' });
  const { title, body } = issueContent(report, 'https://example.org/mapa/', 3);
  assert.equal(title, 'Zgłoszenie: Staw w Boguchwale');
  assert.match(body, /^\*\*Woda:\*\* `Staw w Boguchwale` \(inne\)$/m);
  assert.doesNotMatch(body, /Współrzędne/);
  assert.match(body, /Kontakt:\*\* podany — dostępny operatorom w bazie \(wpis nr 3\)/);
  assert.doesNotMatch(body, /jan@example\.com/);
  assert.match(body, /Brakuje tego łowiska na mapie/);
});

test('treść issue dla inne ze współrzędnymi zawiera linię „Współrzędne”', () => {
  const { report } = validateReport({ ...inne, lat: 50.1, lon: 22.1 });
  const { body } = issueContent(report, 'https://example.org/');
  assert.match(body, /\*\*Współrzędne:\*\* 50\.1, 22\.1/);
});

test('nazwa od użytkownika w treści issue: w kodzie liniowym, bez wzmianek, linków HTML i odwołań', () => {
  const { report } = validateReport({ ...inne, nazwa: '@octocat `x` [link](https://zly.example) #12 <b>' });
  const { title, body } = issueContent(report, 'https://example.org/');
  const woda = body.split('\n')[0];
  assert.equal(woda, '**Woda:** `octocat x link(https://zly.example) 12 b` (inne)');
  assert.equal(title, 'Zgłoszenie: octocat x link(https://zly.example) 12 b');
  // Odwrotne apostrofy z nazwy są usuwane, więc kod liniowy nie może zostać zamknięty.
  assert.equal((woda.match(/`/g) || []).length, 2);
});

test('nazwa złożona wyłącznie ze znaków specjalnych nie daje pustego tytułu', () => {
  const { report } = validateReport({ ...inne, nazwa: '@@' });
  const { title, body } = issueContent(report, 'https://example.org/');
  assert.equal(title, 'Zgłoszenie: (bez nazwy)');
  assert.match(body, /`\(bez nazwy\)`/);
});
