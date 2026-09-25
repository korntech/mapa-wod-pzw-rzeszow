/* Panel listy na telefonie: wysuwany od dołu nad mapą pełnoekranową (jak w aplikacjach map).
 * Trzy wysokości: „peek” (wyszukiwarka i licznik), „half”, „full”. Uchwyt: stuknięcie przełącza,
 * przeciągnięcie ustawia najbliższą wysokość. Na szerokim ekranie panel jest zwykłą kolumną. */

const STANY = ['peek', 'half', 'full'];
export const MOBILE = '(max-width: 720px)';

/**
 * @param {HTMLElement} panel element #side
 * @param {HTMLElement} uchwyt uchwyt przeciągania (pierwsze dziecko panelu)
 * @returns {{ ustaw(stan: string): void, stan(): string, mobile(): boolean, wysokosc(): number }}
 */
export function initArkusz(panel, uchwyt) {
  const mq = window.matchMedia(MOBILE);
  let stan = 'peek';

  function ustaw(nowy) {
    stan = nowy;
    panel.dataset.stan = nowy;
    panel.style.removeProperty('height');
    uchwyt.setAttribute('aria-expanded', String(nowy !== 'peek'));
  }

  /** Wysokości stanów w pikselach (z CSS: zmienne --peek, --half, --full na panelu). */
  function wysokosci() {
    const s = getComputedStyle(panel);
    const rodzic = panel.parentElement.clientHeight;
    const px = (v) => (v.endsWith('%') ? (parseFloat(v) / 100) * rodzic : parseFloat(v));
    return STANY.map((n) => px(s.getPropertyValue('--' + n).trim()));
  }

  let start = null;
  uchwyt.addEventListener('pointerdown', (ev) => {
    if (!mq.matches) return;
    start = { y: ev.clientY, h: panel.getBoundingClientRect().height, ruch: false };
    uchwyt.setPointerCapture(ev.pointerId);
  });
  uchwyt.addEventListener('pointermove', (ev) => {
    if (!start) return;
    const dy = start.y - ev.clientY;
    if (Math.abs(dy) > 6) start.ruch = true;
    if (start.ruch) {
      panel.classList.add('ciagniety');
      panel.style.height = Math.max(60, start.h + dy) + 'px';
    }
  });
  const koniec = () => {
    if (!start) return;
    panel.classList.remove('ciagniety');
    if (start.ruch) {
      const h = panel.getBoundingClientRect().height;
      const w = wysokosci();
      let najblizszy = 0;
      w.forEach((x, i) => {
        if (Math.abs(x - h) < Math.abs(w[najblizszy] - h)) najblizszy = i;
      });
      ustaw(STANY[najblizszy]);
    } else {
      ustaw(STANY[(STANY.indexOf(stan) + 1) % STANY.length]);
    }
    start = null;
  };
  uchwyt.addEventListener('pointerup', koniec);
  uchwyt.addEventListener('pointercancel', koniec);
  uchwyt.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      ustaw(STANY[(STANY.indexOf(stan) + 1) % STANY.length]);
    }
  });

  ustaw('peek');
  /** Docelowa wysokość panelu w bieżącym stanie (bez czekania na koniec animacji); 0 na komputerze. */
  const wysokosc = () => (mq.matches ? wysokosci()[STANY.indexOf(stan)] : 0);

  return { ustaw, stan: () => stan, mobile: () => mq.matches, wysokosc };
}
