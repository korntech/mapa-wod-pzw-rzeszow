/* Mapa publiczna — logika strony index.html. */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { initBasemaps } from './basemaps.js';
import { loadData, esc } from './data.js';

const $ = (id) => document.getElementById(id);

// Okno „O mapie"
$('infobtn').onclick = () => { $('infomodal').style.display = 'flex'; };
$('infomodal').onclick = function () { this.style.display = 'none'; };
$('infomodal').firstElementChild.onclick = (e) => e.stopPropagation();

(async function () {
  let DATA;
  try {
    DATA = await loadData();
  } catch (err) {
    $('count').textContent = 'Nie udało się wczytać danych (' + err.message + '). Uruchom przez serwer HTTP.';
    return;
  }
  init(DATA);
})();

function init(DATA) {
  const map = L.map('map').setView([50.08, 21.95], 9);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  initBasemaps(map, { def: 'topo' });

  const layers = { zb: L.layerGroup().addTo(map), niz: L.layerGroup().addTo(map), gor: L.layerGroup().addTo(map), gr: L.layerGroup() };
  const entries = []; // {f, name, sub, latlng, target, zoom}

  function popupHtml(title, tag, tagColor, body, rules, approx) {
    let h = `<h3>${esc(title)}</h3><span class="tag" style="background:${tagColor}">${esc(tag)}</span>`;
    if (approx) h += `<div class="approx">⚠ lokalizacja przybliżona</div>`;
    h += `<div>${esc(body)}</div>`;
    if (rules) h += `<div class="rules"><b>Zasady:</b> ${esc(rules)}</div>`;
    // Schemat geo: otwiera domyślną nawigację użytkownika — bez wskazywania dostawcy.
    h += `<div style="margin-top:6px"><a target="_blank" href="geo:__LAT__,__LON__?q=__LAT__,__LON__">🧭 Nawiguj</a></div>`;
    return h;
  }
  const withPos = (html, p) => html.replaceAll('__LAT__', p[0]).replaceAll('__LON__', p[1]);

  DATA.zb.forEach((z) => {
    const m = L.circleMarker(z.p, { radius: 7, color: '#fff', weight: 2, fillColor: '#1565c0', fillOpacity: .95 });
    m.bindPopup(withPos(popupHtml(z.n, z.t + (z.ha !== '—' ? ` · ${z.ha} ha` : ''), '#1565c0', '', z.r, z.a), z.p));
    m.addTo(layers.zb);
    entries.push({ f: 'zb', name: z.n, sub: `${z.t} · ${z.ha} ha`, latlng: z.p, target: m, zoom: 14 });
  });

  DATA.rivers.forEach((r) => {
    const col = r.c === 'gor' ? '#2e7d32' : '#0288d1';
    const line = L.polyline(r.pts, { color: col, weight: r.c === 'gor' ? 3 : 4, opacity: .85 });
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    line.bindPopup(withPos(popupHtml(r.n, r.c === 'gor' ? 'kraina pstrąga i lipienia' : 'obwód ' + r.o, col, r.d, r.r, 0), mid));
    line.addTo(layers[r.c === 'gor' ? 'gor' : 'niz']);
    entries.push({ f: r.c === 'gor' ? 'gor' : 'niz', name: r.n, sub: r.d.slice(0, 70) + '…', latlng: mid, target: line, zoom: 11 });
  });

  DATA.granice.forEach((g) => {
    const m = L.circleMarker(g.p, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#616161', fillOpacity: .95 });
    m.bindPopup(`<h3>${esc(g.n)}</h3><div style="font-size:12px">${esc(g.d)}</div>`);
    m.addTo(layers.gr);
    entries.push({ f: 'gr', name: g.n, sub: g.d.slice(0, 60) + '…', latlng: g.p, target: m, zoom: 13 });
  });

  const active = new Set(['zb', 'niz', 'gor']);
  const colors = { zb: '#1565c0', niz: '#0288d1', gor: '#2e7d32', gr: '#616161' };
  const listEl = $('list'), countEl = $('count');
  let userPos = null;

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  function distKm(a, b) {
    const R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
    const la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function render() {
    const q = norm($('search').value.trim());
    const items = entries.filter((e) => active.has(e.f) && (!q || norm(e.name + ' ' + e.sub).includes(q)));
    if (userPos) { items.forEach((e) => { e.km = distKm(userPos, e.latlng); }); items.sort((a, b) => a.km - b.km); }
    countEl.textContent = items.length + ' pozycji' + (userPos ? ' · posortowano wg odległości' : '');
    listEl.innerHTML = items.map((e) =>
      `<div class="item" data-i="${entries.indexOf(e)}"><span class="dot" style="background:${colors[e.f]}"></span><b>${esc(e.name)}</b>` +
      (e.km !== undefined ? ` <span style="color:#0d3b66;font-size:12px">· ${e.km.toFixed(1)} km</span>` : '') +
      `<div class="meta">${esc(e.sub)}</div></div>`).join('');
  }
  listEl.addEventListener('click', (ev) => {
    const it = ev.target.closest('.item'); if (!it) return;
    const e = entries[+it.dataset.i];
    if (e.target.getBounds) map.fitBounds(e.target.getBounds(), { maxZoom: 12 });
    else map.setView(e.latlng, e.zoom);
    e.target.openPopup();
  });
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    const f = c.dataset.f;
    if (active.has(f)) { active.delete(f); c.classList.remove('on'); map.removeLayer(layers[f]); }
    else { active.add(f); c.classList.add('on'); map.addLayer(layers[f]); }
    render();
  }));
  $('search').addEventListener('input', render);
  $('locbtn').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition((p) => {
      userPos = [p.coords.latitude, p.coords.longitude];
      L.circleMarker(userPos, { radius: 8, fillColor: '#e53935', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map).bindPopup('Tu jesteś');
      map.setView(userPos, 11); render();
    }, () => alert('Nie udało się pobrać lokalizacji.'));
  });
  render();
}
