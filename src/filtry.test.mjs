import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFilters, passesFilters, obwodyList, extraFiltersActive } from './filtry.js';

const zb = (kind, extra = {}) => ({ f: 'zb', kind, nokill: false, obwod: '', ...extra });
const rz = (f, obwod) => ({ f, obwod });

test('domyślne filtry: zbiorniki i rzeki widoczne, granice ukryte', () => {
  const f = createFilters();
  assert.equal(passesFilters(zb('zaporowy'), f), true);
  assert.equal(passesFilters(rz('niz', 'Wisłok 3'), f), true);
  assert.equal(passesFilters(rz('gor', 'Wisłoka 4'), f), true);
  assert.equal(passesFilters({ f: 'gr' }, f), false);
  assert.equal(extraFiltersActive(f), false);
});

test('rodzaj zbiornika i NO-KILL', () => {
  const f = createFilters();
  f.kinds.delete('staw');
  assert.equal(passesFilters(zb('staw'), f), false);
  assert.equal(passesFilters(zb('zaporowy'), f), true);
  f.nokillOnly = true;
  assert.equal(passesFilters(zb('zaporowy'), f), false);
  assert.equal(passesFilters(zb('zaporowy', { nokill: true }), f), true);
  assert.equal(passesFilters(rz('niz', ''), f), true, 'NO-KILL nie dotyczy rzek');
  assert.equal(extraFiltersActive(f), true);
});

test('obwód rybacki filtruje rzeki i zbiorniki, nie granice', () => {
  const f = createFilters();
  f.active.add('gr');
  f.obwod = 'Wisłok 3';
  assert.equal(passesFilters(rz('niz', 'Wisłok 3'), f), true);
  assert.equal(passesFilters(rz('niz', 'San 9'), f), false);
  assert.equal(passesFilters(zb('zaporowy', { obwod: 'Wisłok 3' }), f), true);
  assert.equal(passesFilters(zb('zaporowy'), f), false, 'zbiornik bez obwodu znika przy wybranym obwodzie');
  assert.equal(passesFilters({ f: 'gr' }, f), true);
});

test('lista obwodów: unikalna, po polsku, numerycznie', () => {
  const list = obwodyList([
    rz('niz', 'Wisłok 3'),
    rz('gor', 'Wisłoka 10'),
    rz('gor', 'Wisłoka 4'),
    zb('staw'),
    rz('niz', 'Wisłok 3'),
  ]);
  assert.deepEqual(list, ['Wisłok 3', 'Wisłoka 4', 'Wisłoka 10']);
});
