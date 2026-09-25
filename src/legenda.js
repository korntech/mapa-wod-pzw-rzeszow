/* Legenda mapy (zwijana kontrolka Leaflet) i krótkie komunikaty na ekranie zamiast okien alert(). */
import L from 'leaflet';

/** Style znaczników zbiorników — wspólne dla mapy i legendy. */
export function stylZbiornika(kolor, { przyblizona = false, nokill = false } = {}) {
  if (przyblizona) {
    return {
      radius: 7,
      color: nokill ? '#c62828' : kolor,
      weight: 2,
      dashArray: '3 3',
      fillColor: kolor,
      fillOpacity: 0.35,
    };
  }
  return {
    radius: 7,
    color: nokill ? '#c62828' : '#fff',
    weight: nokill ? 3 : 2,
    fillColor: kolor,
    fillOpacity: 0.95,
  };
}

const kolko = (s) =>
  `<svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="${s.fillColor}" fill-opacity="${s.fillOpacity}" stroke="${s.color}" stroke-width="${s.weight}"${s.dashArray ? ` stroke-dasharray="${s.dashArray}"` : ''}/></svg>`;
const linia = (kolor, grubosc) =>
  `<svg width="18" height="18" aria-hidden="true"><path d="M2 13 C6 4, 11 15, 16 5" fill="none" stroke="${kolor}" stroke-width="${grubosc}" stroke-linecap="round"/></svg>`;

/** Kontrolka „Legenda”: przycisk rozwijający opis symboli. */
export function dodajLegende(map, kolory) {
  const control = L.control({ position: 'topright' });
  control.onAdd = () => {
    const box = L.DomUtil.create('div', 'leaflet-bar pzw-legenda');
    const pozycje = [
      [kolko(stylZbiornika(kolory.zb)), 'Zbiornik'],
      [kolko(stylZbiornika(kolory.zb, { nokill: true })), 'Zbiornik NO-KILL'],
      [kolko(stylZbiornika(kolory.zb, { przyblizona: true })), 'Położenie przybliżone'],
      [linia(kolory.niz, 4), 'Rzeka nizinna'],
      [linia(kolory.gor, 3), 'Kraina pstrąga i lipienia'],
      [kolko({ fillColor: kolory.gr, fillOpacity: 0.95, color: '#fff', weight: 1.5 }), 'Granica obwodu'],
      [kolko({ fillColor: '#e53935', fillOpacity: 1, color: '#fff', weight: 2 }), 'Twoje położenie'],
    ];
    box.innerHTML =
      '<button type="button" class="pzw-legenda-btn" aria-expanded="false">Legenda</button>' +
      '<ul hidden>' +
      pozycje.map(([ikona, opis]) => `<li>${ikona}<span>${opis}</span></li>`).join('') +
      '</ul>';
    const btn = box.querySelector('button');
    const lista = box.querySelector('ul');
    btn.addEventListener('click', () => {
      lista.hidden = !lista.hidden;
      btn.setAttribute('aria-expanded', String(!lista.hidden));
    });
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.disableScrollPropagation(box);
    return box;
  };
  control.addTo(map);
  return control;
}

let schowaj = null;

/** Krótki komunikat u dołu ekranu (zastępuje alert(); nie blokuje strony). */
export function komunikat(tekst, ms = 5000) {
  let el = document.getElementById('komunikat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'komunikat';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = tekst;
  el.classList.add('widoczny');
  clearTimeout(schowaj);
  schowaj = setTimeout(() => el.classList.remove('widoczny'), ms);
}
