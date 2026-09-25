/* Wykaz wód w formie tabel do druku (wykaz.html). */
import { LINKS } from './config.js';
import { loadData, esc } from './data.js';
import { lengthKm, formatLatLon } from './geo.js';
import { RODZAJ_NAZWA } from './zbiorniki-typ.js';

const $ = (id) => document.getElementById(id);
const byName = (a, b) => a.n.localeCompare(b.n, 'pl');
const cell = (value) => `<td>${esc(value)}</td>`;

function applyLinks() {
  document.querySelectorAll('a[data-link]').forEach((a) => {
    const href = LINKS[a.dataset.link];
    if (href) a.href = href;
  });
}

function zbiornikiRows(list) {
  return list
    .map(
      (z, i) =>
        `<tr>${cell(i + 1)}<td class="name">${esc(z.n)}</td>${cell(z.t)}` +
        `${cell((RODZAJ_NAZWA[z.k] || 'inny') + (z.nk ? ' · NO-KILL' : '') + (z.o ? ' · ' + z.o : ''))}<td class="num">${esc(z.ha)}</td>` +
        `<td class="coord">${esc(formatLatLon(z.p))}</td><td class="flag">${z.a ? 'TAK' : '—'}</td>${cell(z.r)}</tr>`
    )
    .join('');
}

function riverRows(list) {
  return list
    .map((r, i) => {
      const start = r.pts[0];
      const end = r.pts[r.pts.length - 1];
      return (
        `<tr>${cell(i + 1)}<td class="name">${esc(r.n)}</td>${cell(r.o)}${cell(r.d)}` +
        `<td class="coord">${esc(formatLatLon(start))}<br>${esc(formatLatLon(end))}</td>` +
        `<td class="num">${lengthKm(r.pts).toFixed(1)}</td>${cell(r.r)}</tr>`
      );
    })
    .join('');
}

function graniceRows(list) {
  return list
    .map(
      (g, i) =>
        `<tr>${cell(i + 1)}<td class="name">${esc(g.n)}</td><td class="coord">${esc(formatLatLon(g.p))}</td>${cell(g.d)}</tr>`
    )
    .join('');
}

/** Nazwa kolumny przy każdej komórce — na telefonie wiersze tabel są kartami z opisanymi polami. */
function etykietyKolumn() {
  document.querySelectorAll('table').forEach((tabela) => {
    const naglowki = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent);
    tabela.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        td.dataset.label = naglowki[i] || '';
      });
    });
  });
}

function render(data) {
  const zb = [...data.zb].sort(byName);
  const niz = data.rivers.filter((r) => r.c !== 'gor').sort(byName);
  const gor = data.rivers.filter((r) => r.c === 'gor').sort(byName);
  const granice = [...data.granice].sort(byName);

  $('zb-body').innerHTML = zbiornikiRows(zb);
  $('niz-body').innerHTML = riverRows(niz);
  $('gor-body').innerHTML = riverRows(gor);
  $('gr-body').innerHTML = graniceRows(granice);

  etykietyKolumn();

  $('zb-count').textContent = zb.length;
  $('niz-count').textContent = niz.length;
  $('gor-count').textContent = gor.length;
  $('gr-count').textContent = granice.length;
  $('approx-count').textContent = zb.filter((z) => z.a).length;

  const snapshot = data.meta && data.meta.snapshot ? data.meta.snapshot.slice(0, 10) : '';
  if (snapshot) {
    $('stan').textContent = 'Stan danych: ' + snapshot;
    document.title = `Wykaz wód PZW Okręg Rzeszów — stan ${snapshot}`;
  }
}

async function main() {
  applyLinks();
  $('printbtn').addEventListener('click', () => window.print());
  try {
    render(await loadData());
  } catch (err) {
    $('stan').textContent = 'Nie udało się wczytać danych (' + err.message + ').';
  }
}

main();
