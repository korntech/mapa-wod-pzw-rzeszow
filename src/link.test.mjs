import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, nadajId, idZHasha, hashDlaId } from './link.js';
import { adresNawigacji, aplikacjeNaUrzadzeniu } from './nawigacja.js';
import { polaczDane } from './scalanie.js';

test('slug: małe litery, bez polskich znaków i znaków specjalnych', () => {
  assert.equal(slug('Mrowla IV'), 'mrowla-iv');
  assert.equal(slug('Stawy Głogów Młp.'), 'stawy-glogow-mlp');
  assert.equal(slug('Żółć — Łąka (2)'), 'zolc-laka-2');
  assert.equal(slug('  ---  '), '');
});

test('nadajId: prefiks rodzaju; odcinki o tej samej nazwie rozróżnia obwód, a w ostateczności numer', () => {
  const wpisy = [
    { f: 'zb', name: 'Mrowla IV' },
    { f: 'niz', name: 'Wisłok (odcinek 1)', baseName: 'Wisłok', obwod: 'Wisłok 3' },
    { f: 'niz', name: 'Wisłok (odcinek 2)', baseName: 'Wisłok', obwod: 'Wisłok 4' },
    { f: 'gor', name: 'San', baseName: 'San', obwod: '' },
    { f: 'zb', name: 'Staw', obwod: '' },
    { f: 'zb', name: 'Staw', obwod: '' },
    { f: 'gr', name: 'Granica A' },
  ];
  const mapa = nadajId(wpisy);
  assert.deepEqual(
    wpisy.map((w) => w.id),
    [
      'zb-mrowla-iv',
      'rz-wislok-wislok-3',
      'rz-wislok-wislok-4',
      'rz-san',
      'zb-staw',
      'zb-staw-2',
      'gr-granica-a',
    ]
  );
  assert.equal(mapa.size, wpisy.length);
  assert.equal(mapa.get('rz-san'), wpisy[3]);
});

test('hash: zapis i odczyt id; obce fragmenty adresu są ignorowane', () => {
  assert.equal(hashDlaId('zb-mrowla-iv'), '#w=zb-mrowla-iv');
  assert.equal(idZHasha('#w=zb-mrowla-iv'), 'zb-mrowla-iv');
  assert.equal(idZHasha(''), null);
  assert.equal(idZHasha('#inne'), null);
  assert.equal(idZHasha('#w='), null);
  assert.equal(idZHasha('#w=%E0%A4%A'), null);
});

const APLIKACJE = [
  {
    id: 'google',
    nazwa: 'Google Maps',
    url: 'https://www.google.com/maps/dir/?api=1&destination={lat},{lon}',
  },
  { id: 'apple', nazwa: 'Apple Maps', url: 'https://maps.apple.com/?daddr={lat},{lon}&q={name}' },
  { id: 'geo', nazwa: 'Inna aplikacja', url: 'geo:{lat},{lon}?q={lat},{lon}({name})', tylkoAndroid: true },
];

test('nawigacja: adres z współrzędnymi i zakodowaną nazwą', () => {
  assert.equal(
    adresNawigacji(APLIKACJE[1], [50.01, 22.02], 'Stawy & Łąki'),
    'https://maps.apple.com/?daddr=50.01,22.02&q=Stawy%20%26%20%C5%81%C4%85ki'
  );
  assert.equal(
    adresNawigacji(APLIKACJE[0], [50.01, 22.02], 'x'),
    'https://www.google.com/maps/dir/?api=1&destination=50.01,22.02'
  );
});

test('nawigacja: geo: tylko na Androidzie', () => {
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7)';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
  assert.deepEqual(
    aplikacjeNaUrzadzeniu(APLIKACJE, android).map((a) => a.id),
    ['google', 'apple', 'geo']
  );
  assert.deepEqual(
    aplikacjeNaUrzadzeniu(APLIKACJE, iphone).map((a) => a.id),
    ['google', 'apple']
  );
});

test('scalanie: baza nadpisuje niepuste kolekcje; flagi zmienione i zBazy', () => {
  const snap = { zb: [{ n: 'A' }], rivers: [{ n: 'R' }], granice: [{ n: 'G' }], meta: { snapshot: 'x' } };
  const takieSame = polaczDane(snap, { zb: [{ n: 'A' }], rivers: [{ n: 'R' }], granice: [{ n: 'G' }] });
  assert.equal(takieSame.zmienione, false);
  assert.equal(takieSame.zBazy, true);

  // Ta sama treść w innej kolejności to nie zmiana; zostaje kolejność snapshotu.
  const snap2 = { ...snap, zb: [{ n: 'A' }, { n: 'B' }] };
  const kolejnosc = polaczDane(snap2, { zb: [{ n: 'B' }, { n: 'A' }] });
  assert.equal(kolejnosc.zmienione, false);
  assert.equal(kolejnosc.data.zb, snap2.zb);

  const nowe = polaczDane(snap, { zb: [{ n: 'A' }, { n: 'B' }] });
  assert.equal(nowe.zmienione, true);
  assert.equal(nowe.zBazy, false);
  assert.equal(nowe.data.zb.length, 2);
  assert.equal(nowe.data.rivers, snap.rivers);
  assert.equal(nowe.data.meta, snap.meta);

  const brakBazy = polaczDane(snap, {});
  assert.equal(brakBazy.zmienione, false);
  assert.equal(brakBazy.zBazy, false);
  assert.equal(brakBazy.data.zb, snap.zb);
  // Pusta kolekcja z bazy nie kasuje danych ze snapshotu.
  assert.equal(polaczDane(snap, { zb: [] }).data.zb, snap.zb);
});
