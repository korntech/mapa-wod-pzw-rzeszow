import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueBody } from './lib.mjs';
import { validateReport, issueContent } from '../../supabase/functions/zglos-blad/zgloszenie.js';

test('parseIssueBody odczytuje nazwę, typ i współrzędne z treści wygenerowanej przez formularz', () => {
  const { report } = validateReport({
    typ: 'zb',
    nazwa: 'Zalew Rzeszowski',
    lat: 50.01,
    lon: 22.01,
    opis: 'Zbiornik jest zaznaczony w złym miejscu.',
  });
  const { body } = issueContent(report, 'https://example.org/');
  assert.deepEqual(parseIssueBody(body), {
    nazwa: 'Zalew Rzeszowski',
    typ: 'zbiornik',
    lat: 50.01,
    lon: 22.01,
  });
});

test('parseIssueBody: typ „inne” bez współrzędnych daje nazwę i null zamiast położenia', () => {
  const { report } = validateReport({
    typ: 'inne',
    nazwa: 'Staw w Boguchwale',
    opis: 'Brakuje tego łowiska na mapie.',
  });
  const { body } = issueContent(report, 'https://example.org/');
  assert.deepEqual(parseIssueBody(body), { nazwa: 'Staw w Boguchwale', typ: 'inne', lat: null, lon: null });
});

test('parseIssueBody rozumie też starszą treść bez kodu liniowego', () => {
  const body = '**Woda:** San (obwód San 3) (rzeka)\n**Współrzędne:** 49.95, 22.15\n';
  assert.deepEqual(parseIssueBody(body), {
    nazwa: 'San (obwód San 3)',
    typ: 'rzeka',
    lat: 49.95,
    lon: 22.15,
  });
});
