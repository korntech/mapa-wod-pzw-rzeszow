/* Panel operatora (admin.html). */
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { BASEMAPS, LINKS, SUPABASE, SNAPSHOT } from './config.js';
import { crs, ZOOM, CENTER } from './crs.js';
import { initBasemaps } from './basemaps.js';
import { RODZAJE, rodzajZbiornika, noKillZOpisu } from './zbiorniki-typ.js';
import { getSupabase, signOut, esc } from './data.js';

// Jawne ścieżki ikon znacznika (Leaflet nie wykrywa ich pod bundlerem).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// Panel nie może być osadzany w ramce innej strony. Meta-CSP nie obsługuje frame-ancestors,
// a GitHub Pages nie wysyła X-Frame-Options, więc obrona jest w skrypcie: strona w ramce jest
// ukrywana i inicjalizacja przerwana także wtedy, gdy ramka z atrybutem sandbox zablokuje
// przekierowanie okna nadrzędnego.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try {
    window.top.location = window.self.location;
  } catch {
    /* sandbox bez allow-top-navigation — strona pozostaje ukryta */
  }
  throw new Error('Panel operatora nie działa w ramce.');
}

const $ = (id) => document.getElementById(id);
const TYPES = {
  zb: { table: SUPABASE.tables.zbiorniki, kind: 'point', add: '➕ Dodaj zbiornik', color: '#1565c0' },
  rivers: { table: SUPABASE.tables.rivers, kind: 'line', add: '✏️ Narysuj nową rzekę', color: '#0288d1' },
  gr: { table: SUPABASE.tables.granice, kind: 'point', add: '➕ Dodaj granicę', color: '#616161' },
};
let candidates = {};
let sb = null,
  map,
  layers = {},
  data = { zb: [], rivers: [], granice: [] };
let current = 'zb',
  sel = null,
  editLayer = null,
  addMode = false,
  geomEditing = false;

const KEY = { zb: 'zb', rivers: 'rivers', gr: 'granice' }; // klucz w obiekcie `data`
function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2200);
}
function pts2arr(ll) {
  return ll.map((p) => [+p.lat.toFixed(5), +p.lng.toFixed(5)]);
}

document.querySelectorAll('a[data-link]').forEach((a) => {
  if (LINKS[a.dataset.link]) a.href = LINKS[a.dataset.link];
});
sb = getSupabase();
if (!sb) {
  $('overlay').innerHTML =
    '<div class="card"><h2>Brak konfiguracji</h2><p>Uzupełnij sekcję <b>supabase</b> w pliku <b>config.json</b> (adres projektu i klucz publiczny), aby włączyć panel operatora.</p></div>';
} else {
  initMap();
  loadCandidates();
  sb.auth.getSession().then(({ data }) => {
    if (data.session) bramkaMfa(data.session);
  });
}

function initMap() {
  map = L.map('map', { crs, minZoom: ZOOM.min, maxZoom: ZOOM.max }).setView(CENTER, ZOOM.okreg);
  map.attributionControl.setPrefix(
    `<a href="${LINKS.leaflet}" target="_blank" rel="noopener noreferrer">Leaflet</a>`
  );
  initBasemaps(map, BASEMAPS.default.admin);
  layers = {
    zb: L.layerGroup().addTo(map),
    rivers: L.layerGroup().addTo(map),
    gr: L.layerGroup().addTo(map),
  };
  map.on('click', (e) => {
    if (addMode) placePoint(e.latlng);
  });
  map.on('pm:create', (e) => {
    // ukończono rysowanie nowej rzeki
    const ll = e.layer.getLatLngs();
    e.layer.remove();
    map.pm.disableDraw();
    newRiver(pts2arr(ll));
  });
}

// --- LOGOWANIE ---
$('loginform').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('loginbtn').disabled = true;
  $('loginmsg').className = 'msg';
  $('loginmsg').textContent = 'Logowanie…';
  const { data, error } = await sb.auth.signInWithPassword({
    email: $('l_email').value.trim(),
    password: $('l_pass').value,
  });
  $('loginbtn').disabled = false;
  if (error) {
    $('loginmsg').className = 'msg err';
    $('loginmsg').textContent = 'Błąd logowania: ' + tlumaczBlad(error.message);
    return;
  }
  bramkaMfa(data.session);
});

// --- DRUGI SKŁADNIK (MFA, TOTP) ---
// Reguły RLS wymagają sesji na poziomie aal2, więc samo hasło nie pozwala zapisywać.
// Operator z allow-listy bez skonfigurowanego składnika jest prowadzony przez rejestrację
// aplikacji uwierzytelniającej; przy kolejnych logowaniach podaje 6-cyfrowy kod.
let mfaFactorId = null;
function mfaPokaz(tytul, info, enroll) {
  $('loginform').style.display = 'none';
  $('loginmsg').textContent = '';
  $('mfabox').style.display = '';
  $('mfaenroll').style.display = enroll ? '' : 'none';
  $('mfatitle').textContent = tytul;
  $('mfainfo').textContent = info;
  $('mfamsg').className = 'msg';
  $('mfamsg').textContent = '';
  $('mfacode').value = '';
  $('mfacode').focus();
}
async function bramkaMfa(session) {
  const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    toast('Nie udało się sprawdzić poziomu logowania: ' + tlumaczBlad(error.message));
    return;
  }
  if (aal.currentLevel === 'aal2') return onLogin(session);
  const { data: factors } = await sb.auth.mfa.listFactors();
  const zweryfikowany = (factors?.totp || []).find((f) => f.status === 'verified');
  if (zweryfikowany) {
    mfaFactorId = zweryfikowany.id;
    mfaPokaz('Kod z aplikacji', 'Wpisz kod z aplikacji uwierzytelniającej, aby odblokować zapis.', false);
    return;
  }
  // Konto spoza allow-listy nie musi konfigurować MFA — i tak nie zapisze; wpuść w trybie podglądu.
  const { data: konto } = await sb.rpc('is_operator_konto');
  if (konto !== true) return onLogin(session);
  // Porzucone, niezweryfikowane rejestracje usuń, żeby nie mnożyć składników.
  for (const f of (factors?.totp || []).filter((x) => x.status !== 'verified'))
    await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data: enroll, error: eErr } = await sb.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Panel operatora',
  });
  if (eErr) {
    toast('Nie udało się rozpocząć konfiguracji MFA: ' + tlumaczBlad(eErr.message));
    return onLogin(session);
  }
  mfaFactorId = enroll.id;
  $('mfaqr').src = enroll.totp.qr_code;
  $('mfasecret').textContent = enroll.totp.secret;
  mfaPokaz(
    'Skonfiguruj drugi składnik',
    'Zeskanuj kod aplikacją uwierzytelniającą (np. Google Authenticator, Microsoft Authenticator, 1Password) i wpisz wygenerowany kod. Od teraz będzie wymagany przy każdym logowaniu.',
    true
  );
}
$('mfaform').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('mfabtn').disabled = true;
  $('mfamsg').className = 'msg';
  $('mfamsg').textContent = 'Sprawdzanie…';
  const code = $('mfacode').value.replace(/\s+/g, '');
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: mfaFactorId });
  const { error } = chErr
    ? { error: chErr }
    : await sb.auth.mfa.verify({ factorId: mfaFactorId, challengeId: ch.id, code });
  $('mfabtn').disabled = false;
  if (error) {
    $('mfamsg').className = 'msg err';
    $('mfamsg').textContent = 'Nieprawidłowy kod: ' + tlumaczBlad(error.message);
    $('mfacode').select();
    return;
  }
  const { data } = await sb.auth.getSession();
  $('mfabox').style.display = 'none';
  $('loginform').style.display = '';
  onLogin(data.session);
});
$('mfacancel').addEventListener('click', (ev) => {
  ev.preventDefault();
  signOut();
  location.replace('admin.html');
});
function tlumaczBlad(m) {
  const T = {
    'Invalid login credentials': 'nieprawidłowy e-mail lub hasło',
    'Email not confirmed': 'adres e-mail nie został potwierdzony',
    'Too many requests': 'zbyt wiele prób — odczekaj chwilę',
    'Failed to fetch': 'brak połączenia z bazą',
    'Invalid TOTP code': 'kod nie pasuje — sprawdź godzinę w telefonie i spróbuj ponownie',
    MFA: 'błąd weryfikacji drugiego składnika',
  };
  for (const k in T) if ((m || '').includes(k)) return T[k];
  return m;
}
function onLogin(session) {
  document.body.classList.add('logged');
  $('overlay').classList.add('hidden');
  $('email').textContent = session.user.email;
  setType('zb');
  loadAll();
  checkOperator();
}
/** Konto spoza allow-listy może się zalogować, ale reguły RLS odrzucą każdy zapis — uprzedź o tym. */
async function checkOperator() {
  const { data, error } = await sb.rpc('is_operator');
  if (error || data !== false) return;
  const { data: konto } = await sb.rpc('is_operator_konto');
  toast(
    konto === true
      ? 'Zapis wymaga drugiego składnika logowania — wyloguj się i zaloguj ponownie z kodem z aplikacji'
      : 'To konto nie ma uprawnień do zapisu (brak na liście operatorów)'
  );
}
$('logout').addEventListener('click', () => {
  signOut();
  location.replace('admin.html');
});

// --- DANE ---
async function loadAll() {
  const [zb, rivers, gr] = await Promise.all([
    sb.from(TYPES.zb.table).select('*').order('n'),
    sb.from(TYPES.rivers.table).select('*').order('n'),
    sb.from(TYPES.gr.table).select('*').order('n'),
  ]);
  const err = zb.error || rivers.error || gr.error;
  if (err) {
    toast('Błąd wczytywania: ' + err.message);
    return;
  }
  data = { zb: zb.data, rivers: rivers.data, granice: gr.data };
  fillObwody();
  renderMarkers();
  renderList();
}

function renderMarkers() {
  Object.values(layers).forEach((l) => l.clearLayers());
  data.zb.forEach((z) => {
    L.circleMarker([z.lat, z.lon], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: z.a ? '#b26a00' : '#1565c0',
      fillOpacity: 0.95,
    })
      .on('click', () => select('zb', z.id))
      .addTo(layers.zb);
  });
  data.granice.forEach((g) => {
    L.circleMarker([g.lat, g.lon], {
      radius: 5,
      color: '#fff',
      weight: 1.5,
      fillColor: '#616161',
      fillOpacity: 0.95,
    })
      .on('click', () => select('gr', g.id))
      .addTo(layers.gr);
  });
  data.rivers.forEach((r) => {
    const col = r.c === 'gor' ? '#2e7d32' : '#0288d1';
    L.polyline(r.pts || [], { color: col, weight: r.c === 'gor' ? 3 : 4, opacity: 0.85 })
      .on('click', () => select('rivers', r.id))
      .addTo(layers.rivers);
  });
}

function rows() {
  return data[KEY[current]];
}

function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const f = rows().filter(
    (o) => !q || (o.n + ' ' + (o.t || '') + ' ' + (o.o || '')).toLowerCase().includes(q)
  );
  const labels = { zb: 'zbiorników', rivers: 'rzek', gr: 'granic' };
  $('count').textContent = f.length + ' ' + labels[current] + (q ? ` (z ${rows().length})` : '');
  $('list').innerHTML = f
    .map((o) => {
      let meta = '';
      if (current === 'zb')
        meta =
          `${esc(o.t || RODZAJE[rodzajZbiornika(o.k, o.t)])} · ${esc(o.ha || '—')} ha` +
          (o.o ? ' · ' + esc(o.o) : '') +
          (o.nk ? ' · <b style="color:#c62828">NO-KILL</b>' : '');
      else if (current === 'rivers')
        meta = `${o.c === 'gor' ? 'kraina pstrąga' : 'nizinna'}${o.o ? ' · ' + esc(o.o) : ''} · ${(o.pts || []).length} pkt`;
      else meta = esc((o.d || '').slice(0, 60));
      const warn = current === 'zb' && o.a ? ' <span class="warn">⚠</span>' : '';
      return `<div class="item${sel && o.id === sel.id ? ' sel' : ''}" data-id="${o.id}"><b>${esc(o.n)}</b>${warn}<div class="meta">${meta}</div></div>`;
    })
    .join('');
}
$('search').addEventListener('input', renderList);
$('list').addEventListener('click', (e) => {
  const it = e.target.closest('.item');
  if (it) select(current, +it.dataset.id);
});

// --- ZAKŁADKI ---
/** Słownik rodzajów w formularzu (raz) i podpowiedzi obwodów z danych. */
$('f_k').innerHTML = Object.entries(RODZAJE)
  .map(([k, label]) => `<option value="${k}">${esc(label)}</option>`)
  .join('');
function fillObwody() {
  const set = new Set([...data.rivers, ...data.zb].map((o) => o.o).filter(Boolean));
  $('obwody').innerHTML = [...set]
    .sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }))
    .map((o) => `<option value="${esc(o)}"></option>`)
    .join('');
}

function setType(t) {
  cancelEdit();
  current = t;
  document.querySelectorAll('#tabs .tab').forEach((el) => el.classList.toggle('on', el.dataset.type === t));
  $('addbtn').textContent = TYPES[t].add;
  renderList();
}
document
  .querySelectorAll('#tabs .tab')
  .forEach((el) => el.addEventListener('click', () => setType(el.dataset.type)));

// --- WYBÓR / EDYCJA ---
function select(type, id) {
  cancelEdit();
  if (type !== current) setType(type);
  const o = rows().find((x) => x.id === id);
  if (!o) return;
  sel = o;
  fillForm(type, o, 'Edycja');
  if (type === 'zb') renderCandidates(o);
  else $('kandbox').style.display = 'none';
  if (TYPES[type].kind === 'point') {
    editLayer = L.marker([o.lat, o.lon], { draggable: true }).addTo(map);
    editLayer.on('drag', () => {
      const p = editLayer.getLatLng();
      $('f_lat').value = p.lat.toFixed(5);
      $('f_lon').value = p.lng.toFixed(5);
      if (type === 'zb') $('f_a').checked = false;
    });
    map.setView([o.lat, o.lon], Math.max(map.getZoom(), ZOOM.zbiornik));
  } else {
    const col = o.c === 'gor' ? '#2e7d32' : '#0288d1';
    editLayer = L.polyline(o.pts || [], { color: col, weight: 5, opacity: 0.95 }).addTo(map);
    if ((o.pts || []).length) map.fitBounds(editLayer.getBounds(), { maxZoom: ZOOM.granica });
    updateGeomInfo();
  }
  renderList();
  $('editor').classList.add('open');
}

/** Propozycje akwenów z BDOT10k dla zbiorników o lokalizacji przybliżonej (plik publikowany ze stroną). */
async function loadCandidates() {
  try {
    const res = await fetch(import.meta.env.BASE_URL + SNAPSHOT.candidatesFile);
    if (!res.ok) return;
    const data = await res.json();
    for (const w of data.wyniki || []) {
      if (typeof w.nazwa === 'string' && Array.isArray(w.kandydaci)) candidates[w.nazwa] = w.kandydaci;
    }
  } catch {
    candidates = {};
  }
}

function renderCandidates(o) {
  const box = $('kandbox');
  // Object.hasOwn: nazwa zbiornika taka jak "constructor" nie może trafić w prototyp obiektu.
  const list = Object.hasOwn(candidates, o.n) ? candidates[o.n] : [];
  if (!list.length) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  $('kandlist').innerHTML = list
    .map((k, i) => {
      const nazwa = k.nazwa_bdot ? esc(k.nazwa_bdot) : 'akwen bez nazwy';
      const obiekty = k.liczba_poligonow > 1 ? `, ${k.liczba_poligonow} obiekty` : '';
      return (
        `<div class="kand" data-i="${i}"><b>${i + 1}. ${nazwa}</b> · ${k.ha.toFixed(2)} ha${obiekty}` +
        `<div class="meta">${esc(k.rodzaj)} · ${Math.round(k.odleglosc_m)} m od obecnej pinezki · ocena ${Math.round(k.ocena)}/100</div></div>`
      );
    })
    .join('');
  $('kandlist')
    .querySelectorAll('.kand')
    .forEach((el) => el.addEventListener('click', () => applyCandidate(list[+el.dataset.i], el)));
}

function applyCandidate(k, el) {
  if (!editLayer) return;
  const latlng = [k.lat, k.lon];
  editLayer.setLatLng(latlng);
  $('f_lat').value = k.lat.toFixed(5);
  $('f_lon').value = k.lon.toFixed(5);
  $('f_a').checked = false;
  map.setView(latlng, Math.max(map.getZoom(), ZOOM.zbiornik + 2));
  $('kandlist')
    .querySelectorAll('.kand')
    .forEach((x) => x.classList.toggle('sel', x === el));
}

function fillForm(type, o, title) {
  $('editor').dataset.type = type;
  $('etitle').textContent = title;
  $('f_n').value = o.n || '';
  $('f_ha').value = o.ha || '';
  $('f_t').value = o.t || '';
  $('f_k').value = rodzajZbiornika(o.k, o.t);
  $('f_nk').checked = o.nk == null ? noKillZOpisu(o.t, o.n) : !!o.nk;
  $('f_zo').value = type === 'zb' ? o.o || '' : '';
  $('f_r').value = o.r || '';
  $('f_a').checked = !!o.a;
  $('f_c').value = o.c || 'niz';
  $('f_o').value = o.o || '';
  $('f_d').value = o.d || '';
  if (type !== 'rivers') {
    $('f_lat').value = o.lat ?? '';
    $('f_lon').value = o.lon ?? '';
  }
  $('edel').style.display = o.id ? '' : 'none';
}

// --- GEOMETRIA RZEK ---
$('geomedit').addEventListener('click', () => {
  if (!editLayer) return;
  if (geomEditing) {
    editLayer.pm.disable();
    geomEditing = false;
  } else {
    editLayer.pm.enable({ allowSelfIntersection: true });
    geomEditing = true;
  }
  $('geombox').classList.toggle('editing', geomEditing);
  $('geomedit').textContent = geomEditing ? '✅ Zakończ edycję kształtu' : '✏️ Edytuj kształt linii';
  updateGeomInfo();
});
function updateGeomInfo() {
  if (!editLayer || current !== 'rivers') return;
  const n = (editLayer.getLatLngs() || []).length;
  $('geominfo').textContent = geomEditing
    ? `${n} punktów. Przeciągaj wierzchołki, klikaj środki krawędzi aby dodać, prawym/Alt+klik aby usunąć.`
    : `${n} punktów. Kliknij, aby edytować przebieg linii.`;
}

// --- DODAWANIE ---
$('addbtn').addEventListener('click', () => {
  cancelEdit();
  if (TYPES[current].kind === 'line') {
    toast('Klikaj punkty na mapie; dwuklik kończy rysowanie');
    map.pm.enableDraw('Line', { finishOn: 'dblclick' });
  } else {
    addMode = true;
    $('addbtn').textContent = '📍 Kliknij na mapie…';
  }
});
function placePoint(latlng) {
  addMode = false;
  $('addbtn').textContent = TYPES[current].add;
  sel = null;
  editLayer = L.marker(latlng, { draggable: true }).addTo(map);
  editLayer.on('drag', () => {
    const p = editLayer.getLatLng();
    $('f_lat').value = p.lat.toFixed(5);
    $('f_lon').value = p.lng.toFixed(5);
  });
  fillForm(
    current,
    { lat: latlng.lat.toFixed(5), lon: latlng.lng.toFixed(5) },
    current === 'zb' ? 'Nowy zbiornik' : 'Nowa granica'
  );
  $('kandbox').style.display = 'none';
  $('editor').classList.add('open');
}
function newRiver(arr) {
  sel = null;
  editLayer = L.polyline(arr, { color: '#0288d1', weight: 5, opacity: 0.95 }).addTo(map);
  fillForm('rivers', { pts: arr }, 'Nowa rzeka');
  updateGeomInfo();
  $('editor').classList.add('open');
}

// --- ZAPIS ---
$('esave').addEventListener('click', async () => {
  if (!$('f_n').value.trim()) {
    toast('Podaj nazwę');
    return;
  }
  let rec;
  if (current === 'zb') {
    const lat = parseFloat($('f_lat').value),
      lon = parseFloat($('f_lon').value);
    if (isNaN(lat) || isNaN(lon)) {
      toast('Niepoprawne współrzędne');
      return;
    }
    rec = {
      n: $('f_n').value.trim(),
      ha: $('f_ha').value.trim() || '—',
      t: $('f_t').value.trim(),
      k: $('f_k').value,
      nk: $('f_nk').checked ? 1 : 0,
      o: $('f_zo').value.trim(),
      r: $('f_r').value.trim(),
      a: $('f_a').checked ? 1 : 0,
      lat,
      lon,
    };
  } else if (current === 'gr') {
    const lat = parseFloat($('f_lat').value),
      lon = parseFloat($('f_lon').value);
    if (isNaN(lat) || isNaN(lon)) {
      toast('Niepoprawne współrzędne');
      return;
    }
    rec = { n: $('f_n').value.trim(), d: $('f_d').value.trim(), lat, lon };
  } else {
    const arr = editLayer ? pts2arr(editLayer.getLatLngs()) : [];
    if (arr.length < 2) {
      toast('Linia musi mieć min. 2 punkty');
      return;
    }
    rec = {
      n: $('f_n').value.trim(),
      c: $('f_c').value,
      o: $('f_o').value.trim(),
      d: $('f_d').value.trim(),
      r: $('f_r').value.trim(),
      pts: arr,
    };
  }
  const tbl = TYPES[current].table;
  $('esave').disabled = true;
  let error;
  if (sel && sel.id) {
    ({ error } = await sb.from(tbl).update(rec).eq('id', sel.id));
  } else {
    ({ error } = await sb.from(tbl).insert(rec));
  }
  $('esave').disabled = false;
  if (error) {
    toast('Błąd zapisu: ' + error.message);
    return;
  }
  toast('Zapisano');
  cancelEdit();
  loadAll();
});

// --- USUWANIE ---
$('edel').addEventListener('click', async () => {
  if (!sel || !sel.id) return;
  if (!confirm('Usunąć ten obiekt? Operacji nie można cofnąć.')) return;
  const { error } = await sb.from(TYPES[current].table).delete().eq('id', sel.id);
  if (error) {
    toast('Błąd usuwania: ' + error.message);
    return;
  }
  toast('Usunięto');
  cancelEdit();
  loadAll();
});

$('eclose').addEventListener('click', () => {
  cancelEdit();
  renderMarkers();
  renderList();
});

function cancelEdit() {
  if (geomEditing && editLayer) {
    try {
      editLayer.pm.disable();
    } catch (e) {}
  }
  geomEditing = false;
  $('geombox').classList.remove('editing');
  if (map && map.pm) map.pm.disableDraw();
  if (editLayer) {
    editLayer.remove();
    editLayer = null;
  }
  addMode = false;
  if (TYPES[current]) $('addbtn').textContent = TYPES[current].add;
  sel = null;
  $('editor').classList.remove('open');
}
