/* Zgłaszanie błędów w danych: lista wód do wyboru i formularz wysyłający
 * zgłoszenie do funkcji Supabase, która zakłada issue w repozytorium. */
import { validateReport, issueContent, LIMITY } from '../supabase/functions/zglos-blad/zgloszenie.js';

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
  typ: 'Wybierz zbiornik lub rzekę z listy.',
  nazwa: 'Wybierz zbiornik lub rzekę z listy.',
  wspolrzedne: 'Wybierz zbiornik lub rzekę z listy.',
  opis: `Opis musi mieć od ${LIMITY.opisMin} do ${LIMITY.opisMax} znaków.`,
  spam: 'Zgłoszenie zostało odrzucone.',
  limit: 'Za dużo zgłoszeń z tego adresu w ciągu godziny. Spróbuj później.',
  powtorka: 'Takie zgłoszenie już dziś wpłynęło — dziękujemy, jest w kolejce do sprawdzenia.',
  wstrzymane: 'Przyjmowanie zgłoszeń jest chwilowo wstrzymane.',
  github: 'Nie udało się założyć zgłoszenia na GitHubie.',
  baza: 'Serwer zgłoszeń jest chwilowo niedostępny.',
  siec: 'Nie udało się połączyć z serwerem zgłoszeń.',
};

/* Przy tych błędach zgłaszający może założyć issue sam, przez formularz GitHuba z gotową treścią. */
const Z_LINKIEM_ZAPASOWYM = new Set(['github', 'baza', 'siec']);

/**
 * Podpina formularz zgłoszeń (#reportmodal). `send(report)` zwraca odpowiedź funkcji
 * ({ ok, numer, url } albo { ok: false, error }); `issuesUrl` to zapasowy formularz GitHuba.
 * Zwraca { open(key) } do otwierania modalu z wybraną wodą.
 */
export function initReportForm({ options, send, issuesUrl, mapUrl }) {
  const modal = document.getElementById('reportmodal');
  const form = document.getElementById('reportform');
  const done = document.getElementById('rep-done');
  const select = form.elements.woda;
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

  function open(key) {
    form.reset();
    status.replaceChildren();
    form.style.display = '';
    done.style.display = 'none';
    if (key && byKey[key]) select.value = key;
    modal.style.display = 'flex';
    (select.value ? form.elements.opis : select).focus();
  }

  function showError(code, report) {
    status.textContent = KOMUNIKATY[code] || 'Nieznany błąd.';
    if (!report || !Z_LINKIEM_ZAPASOWYM.has(code)) return;
    const { title, body } = issueContent(report, mapUrl);
    const link = document.createElement('a');
    link.href = `${issuesUrl}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Załóż zgłoszenie na GitHubie samodzielnie';
    status.append(' ', link, '.');
  }

  function showSuccess({ numer, url }) {
    done.querySelector('[data-numer]').textContent = numer;
    const link = done.querySelector('a');
    link.href = url;
    link.textContent = `zgłoszenie #${numer} na GitHubie`;
    form.style.display = 'none';
    done.style.display = 'block';
    done.querySelector('[data-close]').focus();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const woda = byKey[select.value];
    const wynik = validateReport({
      typ: woda && woda.typ,
      nazwa: woda && woda.nazwa,
      lat: woda && woda.lat,
      lon: woda && woda.lon,
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
