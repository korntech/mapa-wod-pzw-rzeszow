/* Geometria wydruku mapy (druk.html): rozmiary stron, dopasowanie obszaru do proporcji strony,
 * dobór poziomu kafli do rozdzielczości druku, siatka arkuszy atlasu, numeracja łowisk i rozmieszczanie
 * etykiet. Bez DOM i bez zależności — testowane w Node (druk-geo.test.mjs). Współrzędne rzutowane
 * (EPSG:2180) w metrach: x na wschód, y na północ; bbox = { minX, minY, maxX, maxY }. */

export const FORMATY = { A4: [210, 297], A3: [297, 420] };
export const MM_NA_CAL = 25.4;

/** Rozmiar strony w mm dla formatu i orientacji. */
export function rozmiarStrony(format, orientacja) {
  const [krotszy, dluzszy] = FORMATY[format] || FORMATY.A4;
  return orientacja === 'pionowa' ? { szer: krotszy, wys: dluzszy } : { szer: dluzszy, wys: krotszy };
}

/** Obszar mapy na stronie w mm (bez marginesów, nagłówka i stopki z legendą). */
export function obszarMapy(format, orientacja, { margines = 10, naglowek = 9, stopka = 9 } = {}) {
  const s = rozmiarStrony(format, orientacja);
  return { szerMm: s.szer - 2 * margines, wysMm: s.wys - 2 * margines - naglowek - stopka };
}

/** Rozmiar płótna w pikselach dla obszaru w mm i rozdzielczości druku. */
export function pikseleMapy({ szerMm, wysMm }, dpi) {
  return { szer: Math.round((szerMm / MM_NA_CAL) * dpi), wys: Math.round((wysMm / MM_NA_CAL) * dpi) };
}

/** Obrys zbioru punktów rzutowanych [x, y]. */
export function bboxPunktow(punkty) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of punkty) {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }
  return b;
}

/** Bbox powiększony o ułamek większego boku z każdej strony. */
export function rozszerzBbox(b, ulamek) {
  const m = Math.max(b.maxX - b.minX, b.maxY - b.minY) * ulamek;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** Bbox powiększony symetrycznie do proporcji szer/wys obszaru mapy (nic nie jest ucinane). */
export function dopasujDoProporcji(b, proporcja) {
  let szer = b.maxX - b.minX;
  let wys = b.maxY - b.minY;
  if (szer / wys < proporcja) szer = wys * proporcja;
  else wys = szer / proporcja;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { minX: cx - szer / 2, minY: cy - wys / 2, maxX: cx + szer / 2, maxY: cy + wys / 2 };
}

/** Rozdzielczość płótna [m/px] dla bboxu dopasowanego do proporcji. */
export const rozdzielczosc = (b, szerPx) => (b.maxX - b.minX) / szerPx;

/** Mianownik skali wydruku (1:N) dla rozdzielczości płótna i dpi. */
export const mianownikSkali = (rozdz, dpi) => Math.round(rozdz / (MM_NA_CAL / 1000 / dpi));

/** Poziom kafli: najgrubszy poziom, który jest co najmniej tak szczegółowy jak płótno
 *  (kafle są skalowane w dół, nigdy rozciągane), w granicach poziomów natywnych warstwy. */
export function dobierzPoziom(rozdz, resolutions, minZ, maxZ) {
  for (let z = minZ; z <= maxZ; z++) if (resolutions[z] <= rozdz) return z;
  return maxZ;
}

/** Zakres numerów kafli (kolumny, wiersze) pokrywających bbox na danym poziomie. */
export function zakresKafli(b, res, [ox, oy], tileSize) {
  const k = res * tileSize;
  return {
    colMin: Math.floor((b.minX - ox) / k),
    colMax: Math.floor((b.maxX - ox) / k),
    rowMin: Math.floor((oy - b.maxY) / k),
    rowMax: Math.floor((oy - b.minY) / k),
  };
}

/** Położenie i rozmiar kafla na płótnie [px]. */
export function kafelNaPlotnie(col, row, res, [ox, oy], tileSize, b, rozdz) {
  const k = res * tileSize;
  return {
    x: (ox + col * k - b.minX) / rozdz,
    y: (b.maxY - (oy - row * k)) / rozdz,
    w: k / rozdz,
    h: k / rozdz,
  };
}

/** Punkt rzutowany → piksele płótna. */
export const naPlotno = ([x, y], b, rozdz) => [(x - b.minX) / rozdz, (b.maxY - y) / rozdz];

export const wBboxie = ([x, y], b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

/** Arkusze atlasu: siatka kolumny × wiersze z zakładką (ułamek boku arkusza), od lewego górnego rogu. */
export function siatkaStron(b, kolumny, wiersze, zakladka = 0.04) {
  const szer = (b.maxX - b.minX) / kolumny;
  const wys = (b.maxY - b.minY) / wiersze;
  const zx = szer * zakladka;
  const zy = wys * zakladka;
  const arkusze = [];
  for (let r = 0; r < wiersze; r++) {
    for (let c = 0; c < kolumny; c++) {
      arkusze.push({
        minX: b.minX + c * szer - zx,
        maxX: b.minX + (c + 1) * szer + zx,
        maxY: b.maxY - r * wys + zy,
        minY: b.maxY - (r + 1) * wys - zy,
        etykieta: `${String.fromCharCode(65 + r)}${c + 1}`,
      });
    }
  }
  return arkusze;
}

const poPolsku = (a, b) => a.localeCompare(b, 'pl', { numeric: true });

/** Numeracja do klucza: zbiorniki 1…, rzeki R1…, granice G1… — każda grupa alfabetycznie. */
export function numeruj(data) {
  const zb = [...data.zb]
    .sort((a, b) => poPolsku(a.n, b.n))
    .map((z, i) => ({ f: 'zb', numer: String(i + 1), nazwa: z.n, p: z.p, z }));
  const rzeki = [...data.rivers]
    .sort((a, b) => poPolsku(a.n, b.n) || poPolsku(a.o || '', b.o || ''))
    .map((r, i) => ({ f: r.c === 'gor' ? 'gor' : 'niz', numer: `R${i + 1}`, nazwa: r.n, pts: r.pts, r }));
  const granice = [...data.granice]
    .sort((a, b) => poPolsku(a.n, b.n))
    .map((g, i) => ({ f: 'gr', numer: `G${i + 1}`, nazwa: g.n, p: g.p, g }));
  return { zb, rzeki, granice };
}

const przecina = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Rozmieszcza etykiety bez nakładania: każda dostaje pierwsze wolne miejsce z listy kandydatów
 * (na punkcie, potem wokół niego w rosnącej odległości). Zwraca { x, y, odsunieta } dla środka
 * etykiety; `odsunieta` = trzeba dorysować odnośnik do punktu.
 * @param {{ x: number, y: number, w: number, h: number }[]} etykiety środek punktu i rozmiar etykiety
 * @param {number} krok odległość pierwszego pierścienia kandydatów [px]
 */
export function rozmiescEtykiety(etykiety, krok) {
  const zajete = [];
  const kierunki = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
    [1, -1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ];
  return etykiety.map((e) => {
    const kandydaci = [[e.x, e.y, false]];
    for (let pierscien = 1; pierscien <= 4; pierscien++) {
      for (const [dx, dy] of kierunki)
        kandydaci.push([e.x + dx * krok * pierscien, e.y + dy * krok * pierscien, true]);
    }
    for (const [x, y, odsunieta] of kandydaci) {
      const prost = { x: x - e.w / 2, y: y - e.h / 2, w: e.w, h: e.h };
      if (!zajete.some((z) => przecina(prost, z))) {
        zajete.push(prost);
        return { x, y, odsunieta };
      }
    }
    // Brak miejsca — etykieta na punkcie mimo nakładania (widoczne tylko w bardzo gęstych skupiskach).
    zajete.push({ x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h });
    return { x: e.x, y: e.y, odsunieta: false };
  });
}

/** Środek odcinka łamanej (punkt danych, nie interpolacja) — miejsce etykiety rzeki. */
export const srodekLamanej = (pts) => pts[Math.floor(pts.length / 2)];
