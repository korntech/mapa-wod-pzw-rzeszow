import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rodzajZOpisu, noKillZOpisu, rodzajZbiornika, RODZAJE_KLUCZE } from './zbiorniki-typ.js';

test('rodzaj z opisu typu z wykazu', () => {
  assert.equal(rodzajZOpisu('Zbiornik zaporowy'), 'zaporowy');
  assert.equal(rodzajZOpisu('Zbiornik zaporowy (Pilzno)'), 'zaporowy');
  assert.equal(rodzajZOpisu('Wyrobisko pożwirowe — łowisko NO-KILL'), 'pozwirowy');
  assert.equal(rodzajZOpisu('5 wyrobisk pożwirowych'), 'pozwirowy');
  assert.equal(rodzajZOpisu('1 zbiornik (żwirownia)'), 'pozwirowy');
  assert.equal(rodzajZOpisu('Wyrobisko'), 'pozwirowy');
  assert.equal(rodzajZOpisu('2 stawy — NO-KILL'), 'staw');
  assert.equal(rodzajZOpisu('5 stawów'), 'staw');
  assert.equal(rodzajZOpisu('1 zbiornik'), 'inny');
  assert.equal(rodzajZOpisu(''), 'inny');
  assert.equal(rodzajZOpisu(null), 'inny');
});

test('NO-KILL z opisu lub nazwy', () => {
  assert.equal(noKillZOpisu('1 staw — NO-KILL', 'Staw Browarny'), true);
  assert.equal(noKillZOpisu('Wyrobisko pożwirowe', 'Lipie (no-kill)'), true);
  assert.equal(noKillZOpisu('Zbiornik zaporowy', 'Zbiornik Rzeszów'), false);
  assert.equal(noKillZOpisu('', ''), false);
});

test('rodzajZbiornika: zapisany klucz ma pierwszeństwo, nieznany → z opisu', () => {
  assert.equal(rodzajZbiornika('staw', 'Zbiornik zaporowy'), 'staw');
  assert.equal(rodzajZbiornika('', 'Zbiornik zaporowy'), 'zaporowy');
  assert.equal(rodzajZbiornika(undefined, '2 stawy'), 'staw');
  assert.equal(rodzajZbiornika('cokolwiek', ''), 'inny');
  assert.deepEqual(RODZAJE_KLUCZE, ['zaporowy', 'pozwirowy', 'staw', 'inny']);
});
