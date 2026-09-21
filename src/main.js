/* Mapa publiczna (index.html). */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { BASEMAPS, LINKS } from './config.js';
import { crs, ZOOM, CENTER } from './crs.js';
import { initBasemaps } from './basemaps.js';
import { loadData, esc } from './data.js';
import { distanceKm } from './geo.js';

const $ = (id) => document.getElementById(id);

const COLORS = { zb: '#1565c0', niz: '#0288d1', gor: '#2e7d32', gr: '#616161' };

function applyLinks() {
  document.querySelectorAll('a[data-link]').forEach((a) => {
    const href = LINKS[a.dataset.link];
    if (href) a.href = href;
  });
}

function initInfoModal() {
  const modal = $('infomodal');
  $('infobtn').onclick = () => {
    modal.style.display = 'flex';
  };
  modal.onclick = () => {
    modal.style.display = 'none';
  };
  modal.firstElementChild.onclick = (e) => e.stopPropagation();
}

/** Adres nawigacji do punktu; szablon zależny od systemu urządzenia. */
function navigationUrl([lat, lon], name) {
  const template = /android/i.test(navigator.userAgent) ? LINKS.navigation.android : LINKS.navigation.default;
  return template
    .replaceAll('{lat}', lat)
    .replaceAll('{lon}', lon)
    .replaceAll('{name}', encodeURIComponent(name));
}

function popupHtml({ title, tag, tagColor, body, rules, approx, position }) {
  let html = `<h3>${esc(title)}</h3><span class="tag" style="background:${tagColor}">${esc(tag)}</span>`;
  if (approx) html += '<div class="approx">⚠ lokalizacja przybliżona</div>';
  html += `<div>${esc(body)}</div>`;
  if (rules) html += `<div class="rules"><b>Zasady:</b> ${esc(rules)}</div>`;
  html +=
    `<div style="margin-top:6px"><a target="_blank" rel="noopener noreferrer" href="${esc(navigationUrl(position, title))}">🧭 Nawiguj</a>` +
    ` · <a target="_blank" rel="noopener noreferrer" href="${esc(reportUrl(position, title))}">✉️ Zgłoś błąd</a></div>`;
  return html;
}

/** Adres zgłoszenia błędu: e-mail do Okręgu, a gdy nie jest skonfigurowany — formularz zgłoszenia w repozytorium. */
function reportUrl([lat, lon], name) {
  const fill = (t) => t.replaceAll('{name}', name).replaceAll('{lat}', lat).replaceAll('{lon}', lon);
  const subject = fill(LINKS.report.subject);
  const body = fill(LINKS.report.body);
  if (LINKS.report.email) {
    return `mailto:${LINKS.report.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return `${LINKS.report.issues}?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');

/** Buduje warstwy i wpisy listy z danych; zwraca wpisy do wyszukiwarki. */
function buildLayers(map, data) {
  const layers = {
    zb: L.layerGroup().addTo(map),
    niz: L.layerGroup().addTo(map),
    gor: L.layerGroup().addTo(map),
    gr: L.layerGroup(),
  };
  const entries = [];

  data.zb.forEach((z) => {
    const marker = L.circleMarker(z.p, {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: COLORS.zb,
      fillOpacity: 0.95,
    });
    const tag = z.t + (z.ha !== '—' ? ` · ${z.ha} ha` : '');
    marker.bindPopup(
      popupHtml({ title: z.n, tag, tagColor: COLORS.zb, body: '', rules: z.r, approx: z.a, position: z.p })
    );
    marker.addTo(layers.zb);
    entries.push({
      f: 'zb',
      name: z.n,
      sub: `${z.t} · ${z.ha} ha`,
      latlng: z.p,
      target: marker,
      zoom: ZOOM.zbiornik,
    });
  });

  const nameCount = {};
  data.rivers.forEach((r) => {
    nameCount[r.n] = (nameCount[r.n] || 0) + 1;
  });
  const nameSeen = {};
  data.rivers.forEach((r) => {
    const kind = r.c === 'gor' ? 'gor' : 'niz';
    const line = L.polyline(r.pts, { color: COLORS[kind], weight: kind === 'gor' ? 3 : 4, opacity: 0.85 });
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const tag = kind === 'gor' ? 'kraina pstrąga i lipienia' : 'obwód ' + r.o;
    line.bindPopup(
      popupHtml({ title: r.n, tag, tagColor: COLORS[kind], body: r.d, rules: r.r, approx: 0, position: mid })
    );
    line.addTo(layers[kind]);
    let label = r.n;
    if (nameCount[r.n] > 1) {
      nameSeen[r.n] = (nameSeen[r.n] || 0) + 1;
      label = `${r.n} (odcinek ${nameSeen[r.n]})`;
    }
    entries.push({
      f: kind,
      name: label,
      sub: r.d.slice(0, 70) + '…',
      latlng: mid,
      target: line,
      zoom: ZOOM.okolica,
    });
  });

  data.granice.forEach((g) => {
    const marker = L.circleMarker(g.p, {
      radius: 5,
      color: '#fff',
      weight: 1.5,
      fillColor: COLORS.gr,
      fillOpacity: 0.95,
    });
    marker.bindPopup(`<h3>${esc(g.n)}</h3><div style="font-size:12px">${esc(g.d)}</div>`);
    marker.addTo(layers.gr);
    entries.push({
      f: 'gr',
      name: g.n,
      sub: g.d.slice(0, 60) + '…',
      latlng: g.p,
      target: marker,
      zoom: ZOOM.granica,
    });
  });

  return { layers, entries };
}

function initUi(map, layers, entries) {
  const active = new Set(['zb', 'niz', 'gor']);
  const listEl = $('list');
  const countEl = $('count');
  const searchEl = $('search');
  let userPos = null;
  let userMarker = null;

  function render() {
    const q = normalize(searchEl.value.trim());
    const items = entries.filter(
      (e) => active.has(e.f) && (!q || normalize(e.name + ' ' + e.sub).includes(q))
    );
    if (userPos) {
      items.forEach((e) => {
        e.km = distanceKm(userPos, e.latlng);
      });
      items.sort((a, b) => a.km - b.km);
    }
    countEl.textContent = items.length + ' pozycji' + (userPos ? ' · posortowano wg odległości' : '');
    listEl.innerHTML = items
      .map(
        (e) =>
          `<div class="item" data-i="${entries.indexOf(e)}"><span class="dot" style="background:${COLORS[e.f]}"></span><b>${esc(e.name)}</b>` +
          (e.km !== undefined
            ? ` <span style="color:#0d3b66;font-size:12px">· ${e.km.toFixed(1)} km</span>`
            : '') +
          `<div class="meta">${esc(e.sub)}</div></div>`
      )
      .join('');
  }

  listEl.addEventListener('click', (ev) => {
    const item = ev.target.closest('.item');
    if (!item) return;
    const e = entries[+item.dataset.i];
    if (e.target.getBounds) map.fitBounds(e.target.getBounds(), { maxZoom: ZOOM.okolica });
    else map.setView(e.latlng, e.zoom);
    e.target.openPopup();
  });

  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      const f = chip.dataset.f;
      if (active.has(f)) {
        active.delete(f);
        chip.classList.remove('on');
        map.removeLayer(layers[f]);
      } else {
        active.add(f);
        chip.classList.add('on');
        map.addLayer(layers[f]);
      }
      render();
    })
  );

  searchEl.addEventListener('input', render);

  $('locbtn').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userPos = [pos.coords.latitude, pos.coords.longitude];
        if (userMarker) userMarker.setLatLng(userPos);
        else {
          userMarker = L.circleMarker(userPos, {
            radius: 8,
            fillColor: '#e53935',
            color: '#fff',
            weight: 2,
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup('Tu jesteś');
        }
        map.setView(userPos, ZOOM.okolica);
        render();
      },
      () => alert('Nie udało się pobrać lokalizacji.')
    );
  });

  render();
}

function initMap(data) {
  const map = L.map('map', { crs, minZoom: ZOOM.min, maxZoom: ZOOM.max }).setView(CENTER, ZOOM.okreg);
  map.attributionControl.setPrefix(
    `<a href="${LINKS.leaflet}" target="_blank" rel="noopener noreferrer">Leaflet</a>`
  );
  initBasemaps(map, BASEMAPS.default.public);
  const { layers, entries } = buildLayers(map, data);
  initUi(map, layers, entries);
}

async function main() {
  applyLinks();
  initInfoModal();
  let data;
  try {
    data = await loadData();
  } catch (err) {
    $('count').textContent = 'Nie udało się wczytać danych (' + err.message + ').';
    return;
  }
  const snapshotDate = data.meta && data.meta.snapshot ? data.meta.snapshot.slice(0, 10) : '';
  if (snapshotDate) $('stan-danych').textContent = 'Stan danych: ' + snapshotDate + ' (snapshot bazy).';
  initMap(data);
}

main();
