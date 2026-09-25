/* Mapa publiczna (index.html). */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { BASEMAPS, LINKS, SITE } from './config.js';
import { crs, ZOOM, CENTER, maxBounds, MAX_BOUNDS_VISCOSITY } from './crs.js';
import { initBasemaps } from './basemaps.js';
import { loadData, getSupabase, esc } from './data.js';
import { waterOptions, initReportForm } from './report.js';
import { distanceKm } from './geo.js';
import { RODZAJE, RODZAJ_NAZWA } from './zbiorniki-typ.js';
import { createFilters, passesFilters, obwodyList, extraFiltersActive } from './filtry.js';

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
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal || ev.target.closest('[data-close]')) modal.style.display = 'none';
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') modal.style.display = 'none';
  });
}

/** Adres nawigacji do punktu; szablon zależny od systemu urządzenia. */
function navigationUrl([lat, lon], name) {
  const template = /android/i.test(navigator.userAgent) ? LINKS.navigation.android : LINKS.navigation.default;
  return template
    .replaceAll('{lat}', lat)
    .replaceAll('{lon}', lon)
    .replaceAll('{name}', encodeURIComponent(name));
}

function popupHtml({ title, tag, tagColor, body, rules, approx, position, reportKey, nokill }) {
  let html = `<h3>${esc(title)}</h3><span class="tag" style="background:${tagColor}">${esc(tag)}</span>`;
  if (nokill) html += '<span class="tag nk">NO-KILL</span>';
  if (approx) html += '<div class="approx">⚠ lokalizacja przybliżona</div>';
  html += `<div>${esc(body)}</div>`;
  if (rules) html += `<div class="rules"><b>Zasady:</b> ${esc(rules)}</div>`;
  html +=
    `<div style="margin-top:6px"><a target="_blank" rel="noopener noreferrer" href="${esc(navigationUrl(position, title))}">🧭 Nawiguj</a>` +
    ` · <a href="#" data-report="${esc(reportKey)}">✉️ Zgłoś uwagę</a></div>`;
  return html;
}

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');

/** Buduje warstwy i wpisy listy z danych; zwraca wpisy do wyszukiwarki. */
function buildLayers(map, data) {
  /* Wszystkie grupy są na mapie; o widoczności pojedynczych obiektów decydują filtry (applyFilters). */
  const layers = {
    zb: L.layerGroup().addTo(map),
    niz: L.layerGroup().addTo(map),
    gor: L.layerGroup().addTo(map),
    gr: L.layerGroup().addTo(map),
  };
  const entries = [];

  data.zb.forEach((z, i) => {
    const marker = L.circleMarker(z.p, {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: COLORS.zb,
      fillOpacity: 0.95,
    });
    const tag =
      (z.t || RODZAJ_NAZWA[z.k]) + (z.ha !== '—' ? ` · ${z.ha} ha` : '') + (z.o ? ` · obwód ${z.o}` : '');
    marker.bindPopup(
      popupHtml({
        title: z.n,
        tag,
        tagColor: COLORS.zb,
        body: '',
        rules: z.r,
        approx: z.a,
        position: z.p,
        reportKey: `zb:${i}`,
        nokill: z.nk,
      })
    );
    entries.push({
      f: 'zb',
      kind: z.k,
      nokill: !!z.nk,
      obwod: z.o || '',
      name: z.n,
      sub: `${z.t} · ${z.ha} ha${z.o ? ' · ' + z.o : ''}`,
      latlng: z.p,
      target: marker,
      layer: layers.zb,
      zoom: ZOOM.zbiornik,
    });
  });

  const nameCount = {};
  data.rivers.forEach((r) => {
    nameCount[r.n] = (nameCount[r.n] || 0) + 1;
  });
  const nameSeen = {};
  data.rivers.forEach((r, i) => {
    const kind = r.c === 'gor' ? 'gor' : 'niz';
    const line = L.polyline(r.pts, { color: COLORS[kind], weight: kind === 'gor' ? 3 : 4, opacity: 0.85 });
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const tag = kind === 'gor' ? 'kraina pstrąga i lipienia' : 'obwód ' + r.o;
    line.bindPopup(
      popupHtml({
        title: r.n,
        tag,
        tagColor: COLORS[kind],
        body: r.d,
        rules: r.r,
        approx: 0,
        position: mid,
        reportKey: `rzeka:${i}`,
      })
    );
    let label = r.n;
    if (nameCount[r.n] > 1) {
      nameSeen[r.n] = (nameSeen[r.n] || 0) + 1;
      label = `${r.n} (odcinek ${nameSeen[r.n]})`;
    }
    entries.push({
      f: kind,
      obwod: r.o || '',
      name: label,
      sub: r.d.slice(0, 70) + '…',
      latlng: mid,
      target: line,
      layer: layers[kind],
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
    entries.push({
      f: 'gr',
      name: g.n,
      sub: g.d.slice(0, 60) + '…',
      latlng: g.p,
      target: marker,
      layer: layers.gr,
      zoom: ZOOM.granica,
    });
  });

  return { layers, entries };
}

function initUi(map, layers, entries, snapshotDate) {
  const filters = createFilters();
  const { active } = filters;
  const listEl = $('list');
  const countEl = $('count');
  const searchEl = $('search');
  let userPos = null;
  let userMarker = null;

  function render() {
    const q = normalize(searchEl.value.trim());
    const items = entries.filter(
      (e) => passesFilters(e, filters) && (!q || normalize(e.name + ' ' + e.sub).includes(q))
    );
    if (userPos) {
      items.forEach((e) => {
        e.km = distanceKm(userPos, e.latlng);
      });
      items.sort((a, b) => a.km - b.km);
    }
    countEl.textContent =
      items.length +
      ' pozycji' +
      (userPos ? ' · posortowano wg odległości' : '') +
      (snapshotDate ? ' · Dane: ' + snapshotDate : '');
    listEl.innerHTML = items
      .map(
        (e) =>
          `<div class="item" data-i="${entries.indexOf(e)}"><span class="dot" style="background:${COLORS[e.f]}"></span><b>${esc(e.name)}</b>` +
          (e.nokill ? '<span class="nk">NO-KILL</span>' : '') +
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

  /** Dodaje do mapy obiekty przechodzące filtry, zdejmuje pozostałe; potem odświeża listę. */
  function applyFilters() {
    entries.forEach((e) => {
      const show = passesFilters(e, filters);
      if (show && !e.layer.hasLayer(e.target)) e.layer.addLayer(e.target);
      else if (!show && e.layer.hasLayer(e.target)) e.layer.removeLayer(e.target);
    });
    $('morebtn').classList.toggle('active', extraFiltersActive(filters));
    render();
  }

  const toggleSet = (set, key, chip) => {
    if (set.has(key)) {
      set.delete(key);
      chip.classList.remove('on');
    } else {
      set.add(key);
      chip.classList.add('on');
    }
  };

  document.querySelectorAll('.chip[data-f]').forEach((chip) =>
    chip.addEventListener('click', () => {
      toggleSet(active, chip.dataset.f, chip);
      applyFilters();
    })
  );

  // Rodzaje zbiorników + NO-KILL.
  const kindsEl = $('kinds');
  kindsEl.innerHTML =
    Object.entries(RODZAJE)
      .map(([k, label]) => `<span class="chip on" data-k="${k}">${esc(label)}</span>`)
      .join('') + '<span class="chip" data-nk>tylko NO-KILL</span>';
  kindsEl.querySelectorAll('.chip[data-k]').forEach((chip) =>
    chip.addEventListener('click', () => {
      toggleSet(filters.kinds, chip.dataset.k, chip);
      applyFilters();
    })
  );
  kindsEl.querySelector('.chip[data-nk]').addEventListener('click', (ev) => {
    filters.nokillOnly = !filters.nokillOnly;
    ev.currentTarget.classList.toggle('on', filters.nokillOnly);
    applyFilters();
  });

  // Obwód rybacki.
  const obwodEl = $('obwod');
  obwodyList(entries).forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    obwodEl.appendChild(opt);
  });
  obwodEl.addEventListener('change', () => {
    filters.obwod = obwodEl.value;
    applyFilters();
  });

  $('resetbtn').addEventListener('click', () => {
    Object.keys(RODZAJE).forEach((k) => filters.kinds.add(k));
    filters.nokillOnly = false;
    filters.obwod = '';
    obwodEl.value = '';
    kindsEl.querySelectorAll('.chip[data-k]').forEach((c) => c.classList.add('on'));
    kindsEl.querySelector('.chip[data-nk]').classList.remove('on');
    applyFilters();
  });

  $('morebtn').addEventListener('click', () => {
    const more = $('more');
    more.hidden = !more.hidden;
    $('morebtn').setAttribute('aria-expanded', String(!more.hidden));
    $('morebtn').textContent = more.hidden ? 'Więcej filtrów ▾' : 'Mniej filtrów ▴';
  });

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

  applyFilters();
}

function initMap(data, snapshotDate) {
  const map = L.map('map', {
    crs,
    minZoom: ZOOM.min,
    maxZoom: ZOOM.max,
    maxBounds: maxBounds(),
    maxBoundsViscosity: MAX_BOUNDS_VISCOSITY,
  }).setView(CENTER, ZOOM.okreg);
  map.attributionControl.setPrefix(
    `<a href="${LINKS.leaflet}" target="_blank" rel="noopener noreferrer">Leaflet</a>`
  );
  if (snapshotDate) map.attributionControl.addAttribution('Dane: ' + snapshotDate);
  initBasemaps(map, BASEMAPS.default.public);
  const { layers, entries } = buildLayers(map, data);
  initUi(map, layers, entries, snapshotDate);
}

/** Service worker z pamięcią podręczną kafli Geoportalu i plików strony (public/sw.js).
 *  Rejestracja po wczytaniu strony, żeby nie konkurować z pobieraniem danych; brak wsparcia
 *  (np. tryb prywatny) niczego nie zmienia — mapa działa bez niego. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const register = () => navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Wysyła zgłoszenie do funkcji Supabase; odpowiedź funkcji (także błędną) zwraca bez zmian. */
async function sendReport(report) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'siec' };
  const { data, error } = await sb.functions.invoke(LINKS.report.function, { body: report });
  if (!error) return data;
  try {
    return await error.context.json();
  } catch {
    return { ok: false, error: 'siec' };
  }
}

/** Formularz zgłoszeń otwierany z popupu łowiska i z okna „O mapie”. */
function initReporting(data) {
  const form = initReportForm({
    options: waterOptions(data),
    send: sendReport,
    issuesUrl: LINKS.report.issues,
    mapUrl: SITE.url,
  });
  // Faza przechwytywania: link może leżeć w oknie „O mapie” lub w popupie Leaflet,
  // które zatrzymują propagację kliknięć w fazie bąbelkowania.
  document.addEventListener(
    'click',
    (ev) => {
      const link = ev.target.closest('a[data-report]');
      if (!link) return;
      ev.preventDefault();
      $('infomodal').style.display = 'none';
      form.open(link.dataset.report);
    },
    true
  );
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
  initMap(data, snapshotDate);
  initReporting(data);
}

registerServiceWorker();
main();
