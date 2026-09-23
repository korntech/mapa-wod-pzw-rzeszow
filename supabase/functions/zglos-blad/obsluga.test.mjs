import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obsluzZgloszenie } from './obsluga.js';

const input = {
  typ: 'zb',
  nazwa: 'Zalew Rzeszowski',
  lat: 50.01,
  lon: 22.01,
  opis: 'Zbiornik jest zaznaczony w złym miejscu.',
  kontakt: '',
  www: '',
};

/** Atrapy: baza z limitem 5 na adres, GitHub liczący założone issue. */
function srodowisko({ limit = 5, github = 'ok', oznaczBlad = false } = {}) {
  const wpisy = [];
  const issues = [];
  let nextId = 1;
  const deps = {
    ip: '1.2.3.4',
    mapUrl: 'https://mapa.example/',
    rezerwuj: async (r) => {
      if (wpisy.filter((w) => w.ip === r.ip).length >= limit) return { ok: false, error: 'limit' };
      if (wpisy.some((w) => w.opis === r.opis)) return { ok: false, error: 'powtorka' };
      const id = nextId++;
      wpisy.push({ id, ...r, status: 'oczekuje' });
      return { ok: true, id };
    },
    utworzIssue: async (title, body) => {
      if (github === 'awaria') throw new Error('GitHub 502');
      issues.push({ title, body });
      return { numer: issues.length, url: `https://github.com/x/y/issues/${issues.length}` };
    },
    oznacz: async (id, zmiany) => {
      if (oznaczBlad) throw new Error('baza: update');
      Object.assign(
        wpisy.find((w) => w.id === id),
        zmiany
      );
    },
  };
  return { deps, wpisy, issues };
}

test('poprawne zgłoszenie: wpis przed issue, potem numer issue we wpisie', async () => {
  const { deps, wpisy, issues } = srodowisko();
  const w = await obsluzZgloszenie({ input, ...deps });
  assert.equal(w.status, 200);
  assert.deepEqual(w.body, { ok: true, numer: 1, url: 'https://github.com/x/y/issues/1' });
  assert.equal(issues.length, 1);
  assert.equal(wpisy[0].status, 'wyslane');
  assert.equal(wpisy[0].issue_numer, 1);
  assert.doesNotMatch(issues[0].body, /1\.2\.3\.4/);
});

test('typy constructor / toString / __proto__ dają 400 bez wywołania GitHuba i bez wpisu', async () => {
  for (const typ of ['constructor', 'toString', '__proto__']) {
    const { deps, wpisy, issues } = srodowisko();
    const w = await obsluzZgloszenie({ input: { ...input, typ }, ...deps });
    assert.equal(w.status, 400, typ);
    assert.equal(issues.length, 0);
    assert.equal(wpisy.length, 0);
  }
});

test('8 żądań przy limicie 5: dokładnie 5 issue, 3 odpowiedzi 429', async () => {
  const { deps, issues } = srodowisko({ limit: 5 });
  const statusy = [];
  for (let i = 0; i < 8; i++) {
    const w = await obsluzZgloszenie({ input: { ...input, opis: `Opis zgłoszenia numer ${i}` }, ...deps });
    statusy.push(w.status);
  }
  assert.deepEqual(statusy, [200, 200, 200, 200, 200, 429, 429, 429]);
  assert.equal(issues.length, 5);
});

test('50 równoległych żądań nie przekracza limitu (kolejność rezerwacja → issue)', async () => {
  const { deps, issues } = srodowisko({ limit: 5 });
  const wyniki = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      obsluzZgloszenie({ input: { ...input, opis: `Równoległy opis numer ${i}` }, ...deps })
    )
  );
  assert.equal(wyniki.filter((w) => w.status === 200).length, 5);
  assert.equal(wyniki.filter((w) => w.status === 429).length, 45);
  assert.equal(issues.length, 5);
});

test('awaria bazy przy rezerwacji: 500 i zero issue', async () => {
  const { deps, issues } = srodowisko();
  deps.rezerwuj = async () => {
    throw new Error('connection refused');
  };
  const w = await obsluzZgloszenie({ input, ...deps });
  assert.equal(w.status, 500);
  assert.deepEqual(w.body, { ok: false, error: 'baza' });
  assert.equal(issues.length, 0);
});

test('awaria GitHuba: 502, wpis oznaczony „blad”, rezerwacja liczy się do limitu', async () => {
  const { deps, wpisy, issues } = srodowisko({ github: 'awaria' });
  const w = await obsluzZgloszenie({ input, ...deps });
  assert.equal(w.status, 502);
  assert.equal(issues.length, 0);
  assert.equal(wpisy.length, 1);
  assert.equal(wpisy[0].status, 'blad');
});

test('awaria zapisu numeru issue nie tworzy nieewidencjonowanego issue: wpis istnieje, zgłaszający dostaje numer', async () => {
  const logi = [];
  const { deps, wpisy, issues } = srodowisko({ oznaczBlad: true });
  const w = await obsluzZgloszenie({ input, ...deps, log: (m) => logi.push(m) });
  assert.equal(w.status, 200);
  assert.equal(issues.length, 1);
  assert.equal(wpisy.length, 1);
  assert.equal(logi.length, 1);
});

test('powtórka: 409 bez issue', async () => {
  const { deps, issues } = srodowisko();
  await obsluzZgloszenie({ input, ...deps });
  const w = await obsluzZgloszenie({ input, ...deps });
  assert.equal(w.status, 409);
  assert.equal(w.body.error, 'powtorka');
  assert.equal(issues.length, 1);
});
