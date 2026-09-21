import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waterOptions } from './report.js';

const dane = {
  zb: [
    { n: 'Zalew Rzeszowski', p: [50.01, 22.01] },
    { n: 'Bratkowice', p: [50.1, 21.9] },
  ],
  rivers: [
    { n: 'San', c: 'niz', o: 'San 3', pts: [[49.9, 22.1], [49.95, 22.15], [50.0, 22.2]] },
    { n: 'San', c: 'niz', o: 'San 4', pts: [[50.0, 22.2], [50.1, 22.3]] },
    { n: 'Stobnica', c: 'gor', o: 'Wisłok 3', pts: [[49.8, 21.9], [49.85, 21.95]] },
  ],
  granice: [{ n: 'granica', p: [50, 22] }],
};

test('zbiorniki dostają klucz z indeksem i położenie pinezki', () => {
  const zb = waterOptions(dane).filter((o) => o.typ === 'zb');
  assert.deepEqual(zb, [
    { key: 'zb:1', typ: 'zb', nazwa: 'Bratkowice', lat: 50.1, lon: 21.9 },
    { key: 'zb:0', typ: 'zb', nazwa: 'Zalew Rzeszowski', lat: 50.01, lon: 22.01 },
  ]);
});

test('rzeki dostają środek przebiegu, a powtarzające się nazwy dopisek z obwodem', () => {
  const rzeki = waterOptions(dane).filter((o) => o.typ === 'rzeka');
  assert.deepEqual(rzeki, [
    { key: 'rzeka:0', typ: 'rzeka', nazwa: 'San (obwód San 3)', lat: 49.95, lon: 22.15 },
    { key: 'rzeka:1', typ: 'rzeka', nazwa: 'San (obwód San 4)', lat: 50.1, lon: 22.3 },
    { key: 'rzeka:2', typ: 'rzeka', nazwa: 'Stobnica', lat: 49.85, lon: 21.95 },
  ]);
});

test('granice nie są wodami do zgłaszania', () => {
  assert.equal(waterOptions(dane).some((o) => o.nazwa === 'granica'), false);
});

/* Formularz: prawdziwy znacznik z index.html w jsdom. */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initReportForm } from './report.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const modalHtml = html.slice(html.indexOf('<div id="reportmodal"'), html.indexOf('<script type="module"'));

function setupForm({ send } = {}) {
  const dom = new JSDOM(`<body>${modalHtml}</body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Option = dom.window.Option;
  const calls = [];
  const form = initReportForm({
    options: waterOptions(dane),
    send: send || (async (r) => (calls.push(r), { ok: true, numer: 7, url: 'https://github.com/x/y/issues/7' })),
    issuesUrl: 'https://github.com/x/y/issues/new',
    mapUrl: 'https://example.org/mapa/',
  });
  const el = (sel) => dom.window.document.querySelector(sel);
  const submit = async () => {
    el('#reportform').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  };
  return { dom, form, calls, el, submit };
}

test('otwarcie z kluczem pokazuje modal z wybraną wodą', () => {
  const { form, el } = setupForm();
  form.open('rzeka:2');
  assert.equal(el('#reportmodal').style.display, 'flex');
  assert.equal(el('select[name=woda]').value, 'rzeka:2');
  assert.equal(el('select[name=woda]').selectedOptions[0].textContent, 'Stobnica');
});

test('lista wód ma dwie grupy: zbiorniki i rzeki', () => {
  const { el } = setupForm();
  const groups = [...el('select[name=woda]').querySelectorAll('optgroup')].map((g) => [g.label, g.children.length]);
  assert.deepEqual(groups, [
    ['Zbiorniki', 2],
    ['Rzeki', 3],
  ]);
});

test('wysłanie bez wybranej wody pokazuje komunikat i nie wysyła', async () => {
  const { form, el, calls, submit } = setupForm();
  form.open('');
  el('textarea[name=opis]').value = 'Opis wystarczająco długi.';
  await submit();
  assert.equal(calls.length, 0);
  assert.match(el('.status').textContent, /Wybierz zbiornik lub rzekę/);
});

test('poprawne zgłoszenie trafia do send i pokazuje numer issue', async () => {
  const { form, el, calls, submit } = setupForm();
  form.open('zb:0');
  el('textarea[name=opis]').value = 'Zbiornik jest zaznaczony w złym miejscu.';
  el('input[name=kontakt]').value = 'jan@example.com';
  await submit();
  assert.deepEqual(calls, [
    {
      typ: 'zb',
      nazwa: 'Zalew Rzeszowski',
      lat: 50.01,
      lon: 22.01,
      opis: 'Zbiornik jest zaznaczony w złym miejscu.',
      kontakt: 'jan@example.com',
    },
  ]);
  assert.equal(el('#reportform').style.display, 'none');
  assert.equal(el('#rep-done').style.display, 'block');
  assert.equal(el('#rep-done a').textContent, '#7');
  assert.equal(el('#rep-done a').href, 'https://github.com/x/y/issues/7');
});

test('błąd GitHuba pokazuje komunikat i link zapasowy z gotową treścią', async () => {
  const { form, el, submit } = setupForm({ send: async () => ({ ok: false, error: 'github' }) });
  form.open('zb:1');
  el('textarea[name=opis]').value = 'Nieaktualne zasady połowu.';
  await submit();
  assert.match(el('.status').textContent, /Nie udało się założyć zgłoszenia/);
  const link = el('.status a');
  assert.ok(link.href.startsWith('https://github.com/x/y/issues/new?title='));
  assert.match(decodeURIComponent(link.href), /Zgłoszenie: Bratkowice/);
  assert.match(decodeURIComponent(link.href), /Nieaktualne zasady połowu\./);
});

test('limit zgłoszeń pokazuje komunikat bez linku zapasowego', async () => {
  const { form, el, submit } = setupForm({ send: async () => ({ ok: false, error: 'limit' }) });
  form.open('zb:1');
  el('textarea[name=opis]').value = 'Nieaktualne zasady połowu.';
  await submit();
  assert.match(el('.status').textContent, /Za dużo zgłoszeń/);
  assert.equal(el('.status a'), null);
});

test('wyjątek przy wysyłce pokazuje błąd sieci i odblokowuje przycisk', async () => {
  const { form, el, submit } = setupForm({
    send: async () => {
      throw new Error('offline');
    },
  });
  form.open('zb:1');
  el('textarea[name=opis]').value = 'Nieaktualne zasady połowu.';
  await submit();
  assert.match(el('.status').textContent, /Nie udało się połączyć/);
  assert.equal(el('button[type=submit]').disabled, false);
});

test('ponowne otwarcie po sukcesie pokazuje czysty formularz', async () => {
  const { form, el, submit } = setupForm();
  form.open('zb:0');
  el('textarea[name=opis]').value = 'Zbiornik jest zaznaczony w złym miejscu.';
  await submit();
  form.open('rzeka:0');
  assert.equal(el('#reportform').style.display, '');
  assert.equal(el('#rep-done').style.display, 'none');
  assert.equal(el('textarea[name=opis]').value, '');
  assert.equal(el('select[name=woda]').value, 'rzeka:0');
});
