/* Mapa do druku (druk.html): arkusze z podkładem GUGiK i ponumerowanymi łowiskami oraz klucz
 * (numer → nazwa, zasady). Rysowane w przeglądarce na płótnie w rozdzielczości druku; „Pobierz PDF”
 * to okno drukowania (tekst klucza zostaje tekstem). Geometria w druk-geo.js. */
import proj4 from 'proj4';
import { BASEMAPS, MAP, SITE, LINKS } from './config.js';
import { loadData, esc } from './data.js';
import { RODZAJ_NAZWA } from './zbiorniki-typ.js';
import { lengthKm } from './geo.js';
import { createFilters, passesFilters, obwodyList } from './filtry.js';
import * as G from './druk-geo.js';

const $ = (id) => document.getElementById(id);
const { code, proj4: definicja, origin, tileSize, resolutions } = MAP.crs;
const projekcja = proj4('EPSG:4326', definicja);
const rzutuj = ([lat, lon]) => projekcja.forward([lon, lat]);
const KOLORY = { zb: '#1565c0', niz: '#0288d1', gor: '#2e7d32', gr: '#616161' };
const NAZWY = {
  zb: 'Zbiorniki',
  niz: 'Rzeki nizinne',
  gor: 'Kraina pstrąga i lipienia',
  gr: 'Granice obwodów',
};
const serviceUrl = BASEMAPS.kafleUrl || BASEMAPS.serviceUrl;
const MAKS_KAFLI = 400;
const ROWNOLEGLE = 6;

/* ---------- ustawienia z formularza i adresu ---------- */

const form = $('ustawienia');
const status = $('status');
const params = new URLSearchParams(location.search);

function wypelnijPodklady() {
  const sel = $('podklad');
  for (const w of BASEMAPS.layers) sel.appendChild(new Option(w.title, w.id));
  sel.appendChild(new Option('bez podkładu', 'brak'));
  sel.value = params.get('podklad') || BASEMAPS.default.public;
}

/** Bbox widoku z adresu (?b=lat1,lon1,lat2,lon2 — z menu mapy) albo null. */
function bboxWidoku() {
  const b = (params.get('b') || '').split(',').map(Number);
  if (b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
  return G.bboxPunktow([
    rzutuj([b[0], b[1]]),
    rzutuj([b[2], b[3]]),
    rzutuj([b[0], b[3]]),
    rzutuj([b[2], b[1]]),
  ]);
}

function zastosujParametry() {
  for (const k of ['zakres', 'atlas', 'format', 'orientacja', 'dpi', 'obwod']) {
    if (params.has(k) && form.elements[k]) form.elements[k].value = params.get(k);
  }
  // Rozdzielczość spoza listy (np. niska do szybkiego podglądu albo testów) dostaje własną pozycję.
  const dpi = Number(params.get('dpi'));
  if (params.has('dpi') && form.elements.dpi.value === '' && dpi >= 48 && dpi <= 600) {
    form.elements.dpi.appendChild(new Option(`${dpi} dpi`, String(dpi), true, true));
  }
  if (form.elements.dpi.value === '') form.elements.dpi.value = '200';
  if (params.has('w')) {
    const w = new Set(params.getAll('w'));
    form.querySelectorAll('input[name=w]').forEach((c) => (c.checked = w.has(c.value)));
  }
  if (params.has('nokill')) form.elements.nokill.checked = params.get('nokill') === '1';
  if (params.has('wygaszony')) form.elements.wygaszony.checked = params.get('wygaszony') !== '0';
}

function ustawienia() {
  const f = form.elements;
  return {
    zakres: f.zakres.value,
    atlas: Number(f.atlas.value),
    format: f.format.value,
    orientacja: f.orientacja.value,
    dpi: Number(f.dpi.value),
    podklad: f.podklad.value,
    wygaszony: f.wygaszony.checked,
    warstwy: new Set([...form.querySelectorAll('input[name=w]:checked')].map((c) => c.value)),
    nokill: f.nokill.checked,
    obwod: f.obwod.value,
  };
}

/* ---------- dane ---------- */

/** Wpisy w formacie filtrów mapy (te same reguły co na mapie: obwód nie ukrywa granic). */
function wpisy(data) {
  const e = [];
  data.zb.forEach((z, i) => e.push({ f: 'zb', kind: z.k, nokill: !!z.nk, obwod: z.o || '', i }));
  data.rivers.forEach((r, i) => e.push({ f: r.c === 'gor' ? 'gor' : 'niz', obwod: r.o || '', i }));
  data.granice.forEach((g, i) => e.push({ f: 'gr', obwod: '', i }));
  return e;
}

function filtruj(data, ust) {
  const filtry = createFilters();
  filtry.active = ust.warstwy;
  filtry.nokillOnly = ust.nokill;
  filtry.obwod = ust.obwod;
  const ok = wpisy(data).filter((w) => passesFilters(w, filtry));
  const zb = ok.filter((w) => w.f === 'zb').map((w) => data.zb[w.i]);
  const rivers = ok.filter((w) => w.f === 'niz' || w.f === 'gor').map((w) => data.rivers[w.i]);
  const granice = ok.filter((w) => w.f === 'gr').map((w) => data.granice[w.i]);
  return { zb, rivers, granice };
}

/* ---------- kafle ---------- */

function adresKafla(warstwa, z, row, col) {
  const q = new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetTile',
    VERSION: '1.0.0',
    LAYER: warstwa.layer,
    STYLE: 'default',
    FORMAT: warstwa.format,
    TILEMATRIXSET: code,
    TILEMATRIX: `${code}:${z + warstwa.zoomOffset}`,
    TILEROW: String(row),
    TILECOL: String(col),
  });
  return `${serviceUrl}${warstwa.path}?${q}`;
}

const obraz = (url) =>
  new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });

/** Pobiera obrazy równolegle (ROWNOLEGLE naraz), z jednym ponowieniem; null = brak kafla. */
async function pobierzWszystkie(urls, postep) {
  const wyniki = new Array(urls.length).fill(null);
  let nastepny = 0;
  let gotowe = 0;
  async function pracownik() {
    while (nastepny < urls.length) {
      const i = nastepny++;
      wyniki[i] = (await obraz(urls[i])) || (await obraz(urls[i]));
      postep(++gotowe, urls.length);
    }
  }
  await Promise.all(Array.from({ length: ROWNOLEGLE }, pracownik));
  return wyniki;
}

/* ---------- rysowanie arkusza ---------- */

function wygas(ctx, szer, wys) {
  const d = ctx.getImageData(0, 0, szer, wys);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const szary = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const jasny = 255 - (255 - szary) * 0.42;
    p[i] = p[i + 1] = p[i + 2] = jasny;
  }
  ctx.putImageData(d, 0, 0);
}

function tekstZOtoczka(ctx, tekst, x, y, kolor, grubosc) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = grubosc;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(tekst, x, y);
  ctx.fillStyle = kolor;
  ctx.fillText(tekst, x, y);
}

function podzialka(ctx, mm, rozdz, wys, dpi) {
  // Długość „ładna” (1, 2, 5 × 10^n km) bliska 30 mm na papierze.
  const celM = mm(30) * rozdz;
  const krok = 10 ** Math.floor(Math.log10(celM));
  const dlM = [1, 2, 5, 10]
    .map((k) => k * krok)
    .reduce((a, b) => (Math.abs(b - celM) < Math.abs(a - celM) ? b : a));
  const dlPx = dlM / rozdz;
  const x = mm(4);
  const y = wys - mm(4);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillRect(x - mm(1.5), y - mm(6), dlPx + mm(3), mm(7.5));
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y - mm(1.2), dlPx, mm(1.2));
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + dlPx / 2, y - mm(1.2), dlPx / 2, mm(0.6));
  ctx.font = `${mm(2.4)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#222';
  ctx.fillText(dlM >= 1000 ? `${dlM / 1000} km` : `${dlM} m`, x, y - mm(1.8));
  void dpi;
}

/**
 * Rysuje jeden arkusz. Zwraca { dataUrl, skala, poziom, brakKafli, naArkuszu (Set numerów) }.
 * @param {object} p bbox, px {szer, wys}, klucz (numeruj), ust, siatka (obrysy arkuszy na przeglądzie), postep()
 */
async function rysujArkusz({ bbox, px, klucz, ust, siatka, postep }) {
  const canvas = document.createElement('canvas');
  canvas.width = px.szer;
  canvas.height = px.wys;
  const ctx = canvas.getContext('2d');
  const mm = (v) => (v / G.MM_NA_CAL) * ust.dpi;
  const rozdz = G.rozdzielczosc(bbox, px.szer);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px.szer, px.wys);

  // 1. Podkład z kafli (w razie potrzeby grubszy poziom, żeby nie przekroczyć MAKS_KAFLI).
  let poziom = null;
  let brakKafli = 0;
  const warstwa = BASEMAPS.layers.find((w) => w.id === ust.podklad);
  if (warstwa) {
    let z = G.dobierzPoziom(rozdz, resolutions, warstwa.minNativeZoom, warstwa.maxNativeZoom);
    let zakres = G.zakresKafli(bbox, resolutions[z], origin, tileSize);
    const ile = (r) => (r.colMax - r.colMin + 1) * (r.rowMax - r.rowMin + 1);
    while (ile(zakres) > MAKS_KAFLI && z > warstwa.minNativeZoom) {
      z--;
      zakres = G.zakresKafli(bbox, resolutions[z], origin, tileSize);
    }
    poziom = z;
    const kafle = [];
    for (let row = Math.max(0, zakres.rowMin); row <= zakres.rowMax; row++) {
      for (let col = Math.max(0, zakres.colMin); col <= zakres.colMax; col++) kafle.push({ row, col });
    }
    const obrazy = await pobierzWszystkie(
      kafle.map((k) => adresKafla(warstwa, z, k.row, k.col)),
      (n, razem) => postep(`kafle ${n}/${razem}`)
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    kafle.forEach((k, i) => {
      const img = obrazy[i];
      if (!img) {
        brakKafli++;
        return;
      }
      const t = G.kafelNaPlotnie(k.col, k.row, resolutions[z], origin, tileSize, bbox, rozdz);
      ctx.drawImage(img, t.x, t.y, t.w + 0.5, t.h + 0.5);
    });
    if (ust.wygaszony) wygas(ctx, px.szer, px.wys);
  }

  // 2. Obrysy arkuszy atlasu na przeglądzie.
  if (siatka) {
    ctx.strokeStyle = '#37474f';
    ctx.setLineDash([mm(2), mm(1.2)]);
    ctx.lineWidth = mm(0.35);
    ctx.font = `bold ${mm(4)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const a of siatka) {
      const [x0, y0] = G.naPlotno([a.minX, a.maxY], bbox, rozdz);
      const [x1, y1] = G.naPlotno([a.maxX, a.minY], bbox, rozdz);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      // Etykieta zawsze w kadrze — arkusze z zakładką wystają poza przegląd.
      tekstZOtoczka(ctx, a.etykieta, Math.max(x0, 0) + mm(2), Math.max(y0, 0) + mm(1.5), '#37474f', mm(1.2));
    }
    ctx.setLineDash([]);
  }

  // 3. Rzeki.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const e of klucz.rzeki) {
    ctx.strokeStyle = KOLORY[e.f];
    ctx.lineWidth = mm(e.f === 'gor' ? 0.7 : 0.9);
    ctx.beginPath();
    e.pts.forEach((pt, i) => {
      const [x, y] = G.naPlotno(rzutuj(pt), bbox, rozdz);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // 4. Etykiety: zbiorniki (numer w kółku), rzeki i granice (numer w ramce) — bez nakładania.
  const srednica = mm(4.2);
  const naArkuszu = new Set();
  const doEtykiet = [];
  const dodaj = (e, pozycja, w, h) => {
    const [x, y] = G.naPlotno(rzutuj(pozycja), bbox, rozdz);
    if (x < -w || y < -h || x > px.szer + w || y > px.wys + h) return;
    naArkuszu.add(e.numer);
    doEtykiet.push({ e, x, y, w, h });
  };
  ctx.font = `bold ${mm(2.1)}px system-ui, sans-serif`;
  const szerRamki = (t) => ctx.measureText(t).width + mm(1.6);
  for (const e of klucz.zb) dodaj(e, e.p, srednica, srednica);
  for (const e of klucz.rzeki) dodaj(e, G.srodekLamanej(e.pts), szerRamki(e.numer), mm(3.4));
  for (const e of klucz.granice) dodaj(e, e.p, szerRamki(e.numer), mm(3.4));
  const miejsca = G.rozmiescEtykiety(doEtykiet, srednica * 1.1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  doEtykiet.forEach(({ e, x, y, w, h }, i) => {
    const m = miejsca[i];
    const kolor = KOLORY[e.f];
    if (m.odsunieta) {
      ctx.strokeStyle = kolor;
      ctx.lineWidth = mm(0.3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.fillStyle = kolor;
      ctx.beginPath();
      ctx.arc(x, y, mm(0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.f === 'zb') {
      const przyblizona = !!e.z.a;
      ctx.beginPath();
      ctx.arc(m.x, m.y, srednica / 2, 0, Math.PI * 2);
      ctx.fillStyle = przyblizona ? 'rgba(21,101,192,.45)' : kolor;
      ctx.fill();
      ctx.setLineDash(przyblizona ? [mm(0.8), mm(0.6)] : []);
      ctx.lineWidth = mm(e.z.nk ? 0.6 : 0.4);
      ctx.strokeStyle = e.z.nk ? '#c62828' : przyblizona ? kolor : '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `bold ${mm(2.1)}px system-ui, sans-serif`;
      tekstZOtoczka(
        ctx,
        e.numer,
        m.x,
        m.y + mm(0.1),
        przyblizona ? '#0d3b66' : '#fff',
        przyblizona ? mm(0.9) : 0.01
      );
    } else {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = kolor;
      ctx.lineWidth = mm(0.35);
      ctx.beginPath();
      ctx.roundRect(m.x - w / 2, m.y - h / 2, w, h, mm(0.8));
      ctx.fill();
      ctx.stroke();
      if (e.f === 'gr' && !m.odsunieta) {
        ctx.fillStyle = kolor;
        ctx.beginPath();
        ctx.arc(x, y, mm(0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `bold ${mm(2.1)}px system-ui, sans-serif`;
      ctx.fillStyle = kolor;
      ctx.fillText(e.numer, m.x, m.y + mm(0.1));
    }
  });

  podzialka(ctx, mm, rozdz, px.wys, ust.dpi);
  postep('zapis obrazu');
  await new Promise((r) => setTimeout(r));
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    skala: G.mianownikSkali(rozdz, ust.dpi),
    poziom,
    brakKafli,
    naArkuszu,
  };
}

/* ---------- dokument ---------- */

const ikona = {
  kolko: (fill, stroke, dash = '') =>
    `<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="${fill}" stroke="${stroke}" stroke-width="1.6"${dash ? ` stroke-dasharray="${dash}"` : ''}/></svg>`,
  linia: (kolor, g) =>
    `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 13 C6 4, 11 15, 16 5" fill="none" stroke="${kolor}" stroke-width="${g}" stroke-linecap="round"/></svg>`,
};

function legendaHtml(ust) {
  const p = [];
  if (ust.warstwy.has('zb')) {
    p.push([ikona.kolko(KOLORY.zb, '#fff'), 'zbiornik (numer)']);
    p.push([ikona.kolko(KOLORY.zb, '#c62828'), 'NO-KILL']);
    p.push([ikona.kolko('rgba(21,101,192,.45)', KOLORY.zb, '2 1.5'), 'położenie przybliżone']);
  }
  if (ust.warstwy.has('niz')) p.push([ikona.linia(KOLORY.niz, 3.5), 'rzeka nizinna (R…)']);
  if (ust.warstwy.has('gor')) p.push([ikona.linia(KOLORY.gor, 2.6), 'kraina pstrąga i lipienia (R…)']);
  if (ust.warstwy.has('gr')) p.push([ikona.kolko(KOLORY.gr, '#fff'), 'granica obwodu (G…)']);
  return p.map(([i, t]) => `<span class="leg">${i}${t}</span>`).join('');
}

function stronaMapy({ tytul, arkusz, dataUrl, skala, stanDanych, ust, rozmiar }) {
  return (
    `<section class="strona mapa" style="--pw:${rozmiar.szer}mm;--ph:${rozmiar.wys}mm">` +
    `<div class="naglowek"><b>${esc(tytul)}</b><span class="arkusz">${esc(arkusz)} · skala ok. 1:${skala.toLocaleString('pl-PL')}</span></div>` +
    `<img class="mapa-obraz" src="${dataUrl}" alt="${esc(arkusz)} — mapa łowisk">` +
    `<div class="stopka">${legendaHtml(ust)}<span class="info">${esc(BASEMAPS.attribution.text)}${stanDanych ? ' · Dane: ' + esc(stanDanych) : ''}<br>mapa poglądowa — wiążący jest aktualny wykaz i zezwolenie</span></div>` +
    '</section>'
  );
}

const nk = (z) => (z.nk ? '<span class="nk">NO-KILL</span>' : '');
const przybl = (z) => (z.a ? ' <span class="ok">≈</span>' : '');

function tabelaZb(lista, arkusze) {
  if (!lista.length) return '';
  return (
    `<h3 class="zb">${NAZWY.zb}</h3><table><thead><tr><th>Nr</th><th>Nazwa</th><th>Rodzaj</th><th>Pow. [ha]</th><th>Obwód</th><th>Arkusz</th><th>Zasady</th></tr></thead><tbody>` +
    lista
      .map(
        (e) =>
          `<tr><td class="nr">${e.numer}</td><td><b>${esc(e.nazwa)}</b>${nk(e.z)}${przybl(e.z)}</td><td>${esc(e.z.t || RODZAJ_NAZWA[e.z.k] || '')}</td>` +
          `<td>${esc(e.z.ha)}</td><td>${esc(e.z.o || '')}</td><td class="ark">${esc(arkusze(e))}</td><td>${esc(e.z.r || '')}</td></tr>`
      )
      .join('') +
    '</tbody></table>'
  );
}

function tabelaRzek(lista, f, arkusze) {
  const l = lista.filter((e) => e.f === f);
  if (!l.length) return '';
  return (
    `<h3 class="${f}">${NAZWY[f]}</h3><table><thead><tr><th>Nr</th><th>Nazwa</th><th>Obwód</th><th>Odcinek</th><th>Dł. [km]</th><th>Arkusz</th><th>Zasady</th></tr></thead><tbody>` +
    l
      .map(
        (e) =>
          `<tr><td class="nr">${e.numer}</td><td><b>${esc(e.nazwa)}</b></td><td>${esc(e.r.o || '')}</td><td>${esc(e.r.d || '')}</td>` +
          `<td>${lengthKm(e.pts).toFixed(1)}</td><td class="ark">${esc(arkusze(e))}</td><td>${esc(e.r.r || '')}</td></tr>`
      )
      .join('') +
    '</tbody></table>'
  );
}

function tabelaGranic(lista, arkusze) {
  if (!lista.length) return '';
  return (
    `<h3 class="gr">${NAZWY.gr}</h3><table><thead><tr><th>Nr</th><th>Nazwa</th><th>Opis</th><th>Arkusz</th></tr></thead><tbody>` +
    lista
      .map(
        (e) =>
          `<tr><td class="nr">${e.numer}</td><td><b>${esc(e.nazwa)}</b></td><td>${esc(e.g.d || '')}</td><td class="ark">${esc(arkusze(e))}</td></tr>`
      )
      .join('') +
    '</tbody></table>'
  );
}

function stronaKlucza({ klucz, arkuszeDla, stanDanych, rozmiar, liczba }) {
  return (
    `<section class="strona klucz" style="--pw:${rozmiar.szer}mm;--ph:${rozmiar.wys}mm">` +
    `<h2>Klucz do mapy — ${liczba} pozycji</h2>` +
    '<p>Numery odpowiadają oznaczeniom na arkuszach. „≈” — położenie przybliżone (kropka stoi w miejscowości, nie na wodzie). ' +
    'Kolumna „Arkusz” wskazuje arkusze atlasu, na których znajduje się pozycja.</p>' +
    tabelaZb(klucz.zb, arkuszeDla) +
    tabelaRzek(klucz.rzeki, 'niz', arkuszeDla) +
    tabelaRzek(klucz.rzeki, 'gor', arkuszeDla) +
    tabelaGranic(klucz.granice, arkuszeDla) +
    '<div class="zastrz"><b>Mapa ma charakter poglądowy.</b> Wiążące są aktualne zezwolenie i oficjalny „Wykaz wód PZW Okręgu w Rzeszowie ' +
    'udostępnionych do wędkowania”. Położenia części zbiorników są przybliżone, a granice odcinków rzek orientacyjne. Przed wędkowaniem sprawdź zasady na miejscu.</div>' +
    `<p class="zrodla">Źródła: wykaz wód Okręgu PZW w Rzeszowie${stanDanych ? ` (stan danych ${esc(stanDanych)})` : ''}; ${esc(BASEMAPS.attribution.text)} — ${esc(BASEMAPS.attribution.url)}. ` +
    `Mapa internetowa: ${esc(SITE.url)} · kod i dane: ${esc(LINKS.repo)}</p>` +
    '</section>'
  );
}

/* ---------- przebieg ---------- */

let dane = null;
let styl = null;

function ustawStrone(rozmiar, orientacja, format) {
  if (!styl) {
    styl = document.createElement('style');
    document.head.appendChild(styl);
  }
  styl.textContent =
    `@page{size:${format} ${orientacja === 'pionowa' ? 'portrait' : 'landscape'};margin:10mm}` +
    // Ekran: cała kartka z marginesem w środku. Druk: marginesy daje @page, więc arkusz = kartka − 20 mm;
    // wysokość strony klucza wynika z treści (tabele łamią się między stronami).
    `@media screen{.strona{width:var(--pw)}.strona.mapa{height:var(--ph)}.strona.klucz{min-height:var(--ph)}}` +
    `@media print{.strona{width:calc(var(--pw) - 20mm)}.strona.mapa{height:calc(var(--ph) - 20mm)}.strona.klucz{min-height:0}}`;
  void rozmiar;
}

/** Podgląd na ekranie w skali dopasowanej do szerokości okna (druk zawsze 1:1). */
function skalujPodglad() {
  const dok = $('dokument');
  const s = dok.querySelector('.strona');
  if (!s) return;
  const szer = s.getBoundingClientRect().width / (Number(dok.style.zoom) || 1);
  dok.style.zoom = String(Math.min(1, (window.innerWidth - 24) / szer));
}
window.addEventListener('resize', skalujPodglad);

async function generuj() {
  const ust = ustawienia();
  const przycisk = $('generuj');
  przycisk.disabled = true;
  $('drukuj').disabled = true;
  status.classList.remove('blad');
  const dok = $('dokument');
  dok.innerHTML = '';
  $('pusty').hidden = true;
  try {
    const data = filtruj(dane, ust);
    const klucz = G.numeruj(data);
    const liczba = klucz.zb.length + klucz.rzeki.length + klucz.granice.length;
    if (!liczba) throw new Error('Żadne łowisko nie przechodzi przez wybrane filtry.');

    const punkty = [...klucz.zb.map((e) => rzutuj(e.p)), ...klucz.granice.map((e) => rzutuj(e.p))];
    for (const e of klucz.rzeki) for (const pt of e.pts) punkty.push(rzutuj(pt));
    const widok = ust.zakres === 'widok' ? bboxWidoku() : null;
    const obszar = G.obszarMapy(ust.format, ust.orientacja);
    const px = G.pikseleMapy(obszar, ust.dpi);
    const proporcja = px.szer / px.wys;
    const calosc = G.dopasujDoProporcji(widok || G.rozszerzBbox(G.bboxPunktow(punkty), 0.03), proporcja);
    const siatka = ust.atlas > 1 ? G.siatkaStron(calosc, ust.atlas, ust.atlas) : null;
    const rozmiar = G.rozmiarStrony(ust.format, ust.orientacja);
    ustawStrone(rozmiar, ust.orientacja, ust.format);

    const stanDanych = dane.meta && dane.meta.snapshot ? dane.meta.snapshot.slice(0, 10) : '';
    const tytul = 'Wody PZW Okręgu w Rzeszowie';
    const arkusze = [
      { bbox: calosc, etykieta: ust.zakres === 'widok' ? 'Wybrany obszar' : 'Przegląd', siatka },
    ];
    if (siatka)
      for (const a of siatka) arkusze.push({ bbox: a, etykieta: `Arkusz ${a.etykieta}`, siatka: null });

    const html = [];
    const gdzie = new Map(); // numer → lista arkuszy atlasu
    let brakKafli = 0;
    for (const [i, a] of arkusze.entries()) {
      const postep = (t) => {
        status.textContent = `Arkusz ${i + 1} z ${arkusze.length} (${a.etykieta}): ${t}…`;
      };
      const w = await rysujArkusz({ bbox: a.bbox, px, klucz, ust, siatka: a.siatka, postep });
      brakKafli += w.brakKafli;
      if (i > 0)
        for (const n of w.naArkuszu)
          gdzie.set(n, [...(gdzie.get(n) || []), a.etykieta.replace('Arkusz ', '')]);
      html.push(
        stronaMapy({
          tytul,
          arkusz: a.etykieta,
          dataUrl: w.dataUrl,
          skala: w.skala,
          stanDanych,
          ust,
          rozmiar,
        })
      );
      dok.innerHTML = html.join('');
      skalujPodglad();
    }
    const arkuszeDla = (e) => (siatka ? (gdzie.get(e.numer) || []).join(', ') : '—');
    html.push(stronaKlucza({ klucz, arkuszeDla, stanDanych, rozmiar, liczba }));
    dok.innerHTML = html.join('');
    skalujPodglad();
    document.title = `Mapa wód PZW Okręg Rzeszów${stanDanych ? ' — ' + stanDanych : ''}`;
    status.textContent =
      `Gotowe: ${arkusze.length} ${arkusze.length === 1 ? 'arkusz' : 'arkusze'} + klucz (${liczba} pozycji).` +
      (brakKafli
        ? ` Nie udało się pobrać ${brakKafli} kafli podkładu — te miejsca są białe; spróbuj ponownie.`
        : '') +
      ' „Pobierz PDF” → w oknie drukowania wybierz „Zapisz jako PDF”.';
    $('drukuj').disabled = false;
  } catch (err) {
    status.classList.add('blad');
    status.textContent = 'Nie udało się przygotować mapy: ' + err.message;
    $('pusty').hidden = false;
  } finally {
    przycisk.disabled = false;
  }
}

async function main() {
  wypelnijPodklady();
  const widok = bboxWidoku();
  if (widok) {
    $('opcja-widok').disabled = false;
    $('opcja-widok').textContent = 'widok z mapy';
    $('zakres').value = 'widok';
  }
  zastosujParametry();
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    generuj();
  });
  $('drukuj').addEventListener('click', () => window.print());
  status.textContent = 'Wczytywanie danych…';
  try {
    dane = await loadData();
  } catch (err) {
    status.classList.add('blad');
    status.textContent = 'Nie udało się wczytać danych (' + err.message + ').';
    return;
  }
  const obwody = obwodyList(wpisy(dane));
  for (const o of obwody) $('obwod').appendChild(new Option(o, o));
  if (params.has('obwod')) $('obwod').value = params.get('obwod');
  status.textContent = `Dane wczytane: ${dane.zb.length} zbiorników, ${dane.rivers.length} odcinków rzek, ${dane.granice.length} granic.`;
  if (params.get('auto') === '1') generuj();
}

main();
