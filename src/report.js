/* Zgłaszanie uwag do mapy: lista wód do wyboru (albo „Inne” z nazwą wpisaną ręcznie)
 * i formularz wysyłający zgłoszenie do funkcji Supabase, która zapisuje je publicznie
 * na stronie projektu (issue w repozytorium). */
import { validateReport, issueContent, LIMITY } from '../supabase/functions/zglos-blad/zgloszenie.js';

/** Wartość pozycji „Inne — brakujące łowisko lub uwaga ogólna” na liście wód (poza grupami). */
export const INNE = 'inne';

/** Wody do wyboru w formularzu, posortowane po nazwie; klucz łączy pozycję z popupem na mapie. */
export function waterOptions(data) {
  const zb = data.zb.map((z, i) => ({ key: `zb:${i}`, typ: 'zb', nazwa: z.n, lat: z.p[0], lon: z.p[1] }));
  const count = {};
  data.rivers.forEach((r) => {
    count[r.n] = (count[r.n] || 0) + 1;
  });
  const rzeki = data.rivers.map((r, i) => {
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const nazwa = count[r.n] > 1 && r.o ? `${r.n} (obwód ${r.o})` : r.n;
    return { key: `rzeka:${i}`, typ: 'rzeka', nazwa, lat: mid[0], lon: mid[1] };
  });
  const byName = (a, b) => a.nazwa.localeCompare(b.nazwa, 'pl');
  return [...zb.sort(byName), ...rzeki.sort(byName)];
}

const KOMUNIKATY = {
  typ: 'Wybierz zbiornik lub rzekę z listy albo „Inne”.',
  nazwa: `Wpisz, czego dotyczy zgłoszenie (${LIMITY.nazwaMin}–${LIMITY.nazwaMax} znaków).`,
  wspolrzedne: 'Wybierz zbiornik lub rzekę z listy.',
  opis: `Opis musi mieć od ${LIMITY.opisMin} do ${LIMITY.opisMax} znaków.`,
  spam: 'Zgłoszenie zostało odrzucone.',
  schemat: 'Zgłoszenie zostało odrzucone.',
  rozmiar: 'Zgłoszenie jest za duże.',
  limit: 'Za dużo zgłoszeń z tego adresu w ciągu godziny. Spróbuj później.',
  powtorka: 'Takie zgłoszenie już dziś wpłynęło — dziękujemy, jest w kolejce do sprawdzenia.',
  wstrzymane: 'Przyjmowanie zgłoszeń jest chwilowo wstrzymane.',
  github: 'Nie udało się zapisać zgłoszenia na stronie projektu.',
  baza: 'Serwer zgłoszeń jest chwilowo niedostępny.',
  siec: 'Nie udało się połączyć z serwerem zgłoszeń.',
};

/* Przy tych błędach zgłaszający może dodać zgłoszenie sam, przez stronę projektu (GitHub)
 * z gotową treścią — wymaga to konta. */
const Z_LINKIEM_ZAPASOWYM = new Set(['github', 'baza', 'siec']);

/**
 * Podpina formularz zgłoszeń (#reportmodal). `send(report)` zwraca odpowiedź funkcji
 * ({ ok, numer, url } albo { ok: false, error }); `issuesUrl` to zapasowy formularz na stronie projektu.
 * Zwraca { open(key) } do otwierania modalu z wybraną wodą (klucz z listy albo „inne”).
 */
export function initReportForm({ options, send, issuesUrl, mapUrl }) {
  const modal = document.getElementById('reportmodal');
  const form = document.getElementById('reportform');
  const done = document.getElementById('rep-done');
  const select = form.elements.woda;
  const nazwaPole = document.getElementById('rep-inne');
  const button = form.querySelector('button[type=submit]');
  const status = form.querySelector('.status');
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]));

  for (const [typ, label] of [
    ['zb', 'Zbiorniki'],
    ['rzeka', 'Rzeki'],
  ]) {
    const group = document.createElement('optgroup');
    group.label = label;
    options.filter((o) => o.typ === typ).forEach((o) => group.appendChild(new Option(o.nazwa, o.key)));
    select.appendChild(group);
  }

  /* Pole „Czego dotyczy zgłoszenie” tylko przy „Inne”; dla wody z listy nazwa i położenie idą z danych. */
  function pokazNazwe() {
    nazwaPole.hidden = select.value !== INNE;
  }
  select.addEventListener('change', pokazNazwe);

  function open(key) {
    form.reset();
    status.replaceChildren();
    form.style.display = '';
    done.style.display = 'none';
    if (key && (key === INNE || byKey[key])) select.value = key;
    pokazNazwe();
    modal.style.display = 'flex';
    (select.value === INNE ? form.elements.nazwa : select.value ? form.elements.opis : select).focus();
  }

  function showError(code, report) {
    status.textContent = KOMUNIKATY[code] || 'Nieznany błąd.';
    if (!report || !Z_LINKIEM_ZAPASOWYM.has(code)) return;
    const { title, body } = issueContent(report, mapUrl);
    const link = document.createElement('a');
    link.href = `${issuesUrl}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Dodaj zgłoszenie bezpośrednio na stronie projektu (wymaga konta GitHub)';
    status.append(' ', link, '.');
  }

  function showSuccess({ numer, url }) {
    done.querySelector('[data-numer]').textContent = numer;
    const link = done.querySelector('a');
    link.href = url;
    link.textContent = `Zobacz swoje zgłoszenie (nr ${numer})`;
    form.style.display = 'none';
    done.style.display = 'block';
    done.querySelector('[data-close]').focus();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const inne = select.value === INNE;
    const woda = inne ? null : byKey[select.value];
    const wynik = validateReport({
      typ: inne ? INNE : woda && woda.typ,
      nazwa: inne ? form.elements.nazwa.value : woda && woda.nazwa,
      lat: woda ? woda.lat : null,
      lon: woda ? woda.lon : null,
      opis: form.elements.opis.value,
      kontakt: form.elements.kontakt.value,
      www: form.elements.www.value,
    });
    if (!wynik.ok) {
      showError(wynik.error);
      return;
    }
    button.disabled = true;
    status.textContent = 'Wysyłanie…';
    try {
      const res = await send(wynik.report);
      if (res && res.ok) showSuccess(res);
      else showError((res && res.error) || 'siec', wynik.report);
    } catch {
      showError('siec', wynik.report);
    } finally {
      button.disabled = false;
    }
  });

  function close() {
    modal.style.display = 'none';
  }

  /* Zamknięcie: tło, każdy element [data-close] (×, „Anuluj”, „Zamknij”) oraz Escape. */
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal || ev.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
  });

  return { open, close };
}
