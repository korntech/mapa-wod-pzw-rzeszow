import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rozmiarStrony,
  obszarMapy,
  pikseleMapy,
  bboxPunktow,
  rozszerzBbox,
  dopasujDoProporcji,
  rozdzielczosc,
  mianownikSkali,
  dobierzPoziom,
  zakresKafli,
  kafelNaPlotnie,
  naPlotno,
  siatkaStron,
  numeruj,
  rozmiescEtykiety,
} from './druk-geo.js';

const RES = [
  8466.6836, 4233.3418, 2116.6709, 1058.33545, 529.167725, 264.583863, 132.291931, 66.145966, 26.458386,
];
const ORIGIN = [100000, 850000];

test('rozmiar strony i obszar mapy: A4 pozioma/pionowa, marginesy i pasy', () => {
  assert.deepEqual(rozmiarStrony('A4', 'pozioma'), { szer: 297, wys: 210 });
  assert.deepEqual(rozmiarStrony('A4', 'pionowa'), { szer: 210, wys: 297 });
  assert.deepEqual(rozmiarStrony('A3', 'pozioma'), { szer: 420, wys: 297 });
  assert.deepEqual(rozmiarStrony('B5', 'pozioma'), { szer: 297, wys: 210 }, 'nieznany format → A4');
  assert.deepEqual(obszarMapy('A4', 'pozioma'), { szerMm: 277, wysMm: 172 });
  assert.deepEqual(pikseleMapy({ szerMm: 254, wysMm: 127 }, 300), { szer: 3000, wys: 1500 });
});

test('bbox punktów, rozszerzenie i dopasowanie do proporcji bez ucinania', () => {
  const b = bboxPunktow([
    [10, 10],
    [30, 20],
    [20, 50],
  ]);
  assert.deepEqual(b, { minX: 10, minY: 10, maxX: 30, maxY: 50 });
  assert.deepEqual(rozszerzBbox(b, 0.1), { minX: 6, minY: 6, maxX: 34, maxY: 54 });
  // Za wąski dla proporcji 2:1 → poszerzony symetrycznie do 80×40.
  const d = dopasujDoProporcji(b, 2);
  assert.deepEqual(d, { minX: -20, minY: 10, maxX: 60, maxY: 50 });
  // Za niski dla proporcji 1:4 → podwyższony do 20×80.
  const w = dopasujDoProporcji(b, 0.25);
  assert.deepEqual(w, { minX: 10, minY: -10, maxX: 30, maxY: 70 });
  assert.equal(rozdzielczosc(d, 800), 0.1);
});

test('skala wydruku: 1 m/px przy 254 dpi to 1:10000', () => {
  assert.equal(mianownikSkali(1, 254), 10000);
  assert.ok(Math.abs(mianownikSkali(26.458386, 300) - 312500) <= 1);
});

test('dobierzPoziom: najgrubszy poziom nie gorszy niż płótno, w granicach warstwy', () => {
  assert.equal(dobierzPoziom(300, RES, 0, 8), 5); // 264.58 ≤ 300, a 529 > 300
  assert.equal(dobierzPoziom(264.583863, RES, 0, 8), 5);
  assert.equal(dobierzPoziom(1, RES, 0, 8), 8); // płótno drobniejsze niż warstwa → maks
  assert.equal(dobierzPoziom(300, RES, 6, 8), 6); // poniżej minimum warstwy → minimum
});

test('kafle: zakres i położenie na płótnie zgodne z siatką WMTS (origin lewy górny, 512 px)', () => {
  const res = RES[5];
  const k = res * 512;
  const b = { minX: 100000 + 2 * k, maxX: 100000 + 3.5 * k, maxY: 850000 - 1 * k, minY: 850000 - 2.25 * k };
  assert.deepEqual(zakresKafli(b, res, ORIGIN, 512), { colMin: 2, colMax: 3, rowMin: 1, rowMax: 2 });
  const rozdz = res * 2; // płótno 2× grubsze niż kafel → kafel 256 px
  const blisko = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
  const t = kafelNaPlotnie(2, 1, res, ORIGIN, 512, b, rozdz);
  [t.x, t.y, t.w, t.h].forEach((v, i) => blisko(v, [0, 0, 256, 256][i]));
  const t2 = kafelNaPlotnie(3, 2, res, ORIGIN, 512, b, rozdz);
  [t2.x, t2.y, t2.w, t2.h].forEach((v, i) => blisko(v, [256, 256, 256, 256][i]));
  naPlotno([b.minX, b.maxY], b, rozdz).forEach((v, i) => blisko(v, [0, 0][i]));
  naPlotno([b.maxX, b.minY], b, rozdz).forEach((v, i) => blisko(v, [384, 320][i]));
});

test('siatka arkuszy 2×2 z zakładką, etykiety A1…B2, od lewego górnego rogu', () => {
  const b = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
  const s = siatkaStron(b, 2, 2, 0.1);
  assert.equal(s.length, 4);
  assert.deepEqual(
    s.map((a) => a.etykieta),
    ['A1', 'A2', 'B1', 'B2']
  );
  assert.deepEqual(s[0], { minX: -10, maxX: 110, maxY: 105, minY: 45, etykieta: 'A1' });
  assert.deepEqual(s[3], { minX: 90, maxX: 210, maxY: 55, minY: -5, etykieta: 'B2' });
});

test('numeracja: zbiorniki 1…, rzeki R…, granice G… alfabetycznie po polsku', () => {
  const data = {
    zb: [{ n: 'Żółty Staw' }, { n: 'Mrowla IV' }, { n: 'Łąka' }],
    rivers: [
      { n: 'Wisłok', o: 'Wisłok 4', c: 'niz', pts: [] },
      { n: 'San', c: 'gor', pts: [] },
      { n: 'Wisłok', o: 'Wisłok 3', c: 'niz', pts: [] },
    ],
    granice: [{ n: 'B' }, { n: 'A' }],
  };
  const k = numeruj(data);
  assert.deepEqual(
    k.zb.map((e) => [e.numer, e.nazwa]),
    [
      ['1', 'Łąka'],
      ['2', 'Mrowla IV'],
      ['3', 'Żółty Staw'],
    ]
  );
  assert.deepEqual(
    k.rzeki.map((e) => [e.numer, e.nazwa, e.f]),
    [
      ['R1', 'San', 'gor'],
      ['R2', 'Wisłok', 'niz'],
      ['R3', 'Wisłok', 'niz'],
    ]
  );
  assert.equal(k.rzeki[1].r.o, 'Wisłok 3');
  assert.deepEqual(
    k.granice.map((e) => e.numer + ' ' + e.nazwa),
    ['G1 A', 'G2 B']
  );
});

test('rozmieszczanie etykiet: bez nakładania, odsunięte dostają odnośnik', () => {
  const e = (x, y) => ({ x, y, w: 20, h: 20 });
  const wynik = rozmiescEtykiety([e(100, 100), e(105, 102), e(300, 300)], 24);
  assert.deepEqual(wynik[0], { x: 100, y: 100, odsunieta: false });
  assert.equal(wynik[1].odsunieta, true);
  assert.ok(
    Math.abs(wynik[1].x - 105) >= 20 || Math.abs(wynik[1].y - 102) >= 20,
    'druga etykieta przesunięta'
  );
  assert.deepEqual(wynik[2], { x: 300, y: 300, odsunieta: false });
  // Etykiety nie nachodzą na siebie.
  const p = wynik.map((w) => ({ x: w.x - 10, y: w.y - 10, w: 20, h: 20 }));
  const nachodza =
    p[0].x < p[1].x + 20 && p[0].x + 20 > p[1].x && p[0].y < p[1].y + 20 && p[0].y + 20 > p[1].y;
  assert.equal(nachodza, false);
});
