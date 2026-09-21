"""Funkcje geometryczne na wspolrzednych (lat, lon) w stopniach.

Wszystkie odleglosci liczone sa w metrach w lokalnym przyblizeniu plaskim:
1 stopien szerokosci = 111 320 m, 1 stopien dlugosci = 111 320 m * cos(lat).
Punkt jest krotka lub lista (lat, lon).
"""

from __future__ import annotations

import math
from typing import List, Sequence, Tuple

from pyproj import Transformer

Punkt = Sequence[float]
M_NA_STOPIEN = 111320.0


def transformer(crs_zrodlowy: str, crs_docelowy: str) -> Transformer:
    """Tworzy Transformer pyproj z kolejnoscia osi (x=easting, y=northing).

    `always_xy=True` jest wymagane, bo w plikach GML BDOT10k `gml:posList`
    zapisuje wspolrzedne EPSG:2180 w kolejnosci (easting, northing), a
    domyslna kolejnosc autorytetu dla EPSG:2180 to (northing, easting).
    """
    return Transformer.from_crs(crs_zrodlowy, crs_docelowy, always_xy=True)


def poslist_na_punkty(poslist: str, tr: Transformer) -> List[Tuple[float, float]]:
    """Zamienia tresc `gml:posList` (pary easting northing) na liste (lat, lon)."""
    liczby = [float(v) for v in poslist.split()]
    e, n = liczby[0::2], liczby[1::2]
    lon, lat = tr.transform(e, n)
    return list(zip(lat, lon))


def metry_na_stopien(lat: float) -> Tuple[float, float]:
    """Zwraca (metry na stopien szerokosci, metry na stopien dlugosci) dla lat."""
    return (M_NA_STOPIEN, M_NA_STOPIEN * math.cos(math.radians(lat)))


def odleglosc_lokalna_m(p: Punkt, q: Punkt) -> float:
    """Odleglosc p-q w metrach ze skala dlugosci geograficznej liczona dla lat punktu p."""
    ky, kx = metry_na_stopien(p[0])
    return math.hypot((q[0] - p[0]) * ky, (q[1] - p[1]) * kx)


def odleglosc_ze_skala_m(p: Punkt, q: Punkt, lat_skali: float) -> float:
    """Odleglosc p-q w metrach ze skala dlugosci geograficznej liczona dla podanej szerokosci."""
    ky, kx = metry_na_stopien(lat_skali)
    return math.hypot((p[0] - q[0]) * ky, (p[1] - q[1]) * kx)


def odleglosc_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Odleglosc w metrach ze skala dlugosci geograficznej liczona dla sredniej szerokosci."""
    dy = (lat1 - lat2) * M_NA_STOPIEN
    dx = (lon1 - lon2) * M_NA_STOPIEN * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def odleglosc_do_odcinka(p: Punkt, a: Punkt, b: Punkt) -> Tuple[float, float]:
    """Odleglosc punktu p od odcinka a-b.

    Zwraca (odleglosc_m, t), gdzie t w [0, 1] jest polozeniem rzutu p na odcinku
    (0 = punkt a, 1 = punkt b). Skala metryczna liczona dla szerokosci punktu p.
    """
    ky, kx = metry_na_stopien(p[0])
    px, py = p[1] * kx, p[0] * ky
    ax, ay = a[1] * kx, a[0] * ky
    bx, by = b[1] * kx, b[0] * ky
    dx, dy = bx - ax, by - ay
    dl2 = dx * dx + dy * dy
    t = 0.0 if dl2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / dl2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t


def pozycja_na_linii(p: Punkt, linia: Sequence[Punkt]) -> Tuple[float, float]:
    """Najblizszy odcinek lamanej dla punktu p.

    Zwraca (odleglosc_m, pozycja), gdzie pozycja = indeks_odcinka + t jest
    ciagla wspolrzedna wzdluz lamanej (0 na jej poczatku, len(linia)-1 na koncu).
    """
    najlepszy = (1e18, 0.0)
    for i in range(len(linia) - 1):
        d, t = odleglosc_do_odcinka(p, linia[i], linia[i + 1])
        if d < najlepszy[0]:
            najlepszy = (d, i + t)
    return najlepszy


def dlugosc_linii(linia: Sequence[Punkt]) -> float:
    """Dlugosc lamanej w metrach (suma odleglosci lokalnych kolejnych wierzcholkow)."""
    s = 0.0
    for i in range(len(linia) - 1):
        s += odleglosc_lokalna_m(linia[i], linia[i + 1])
    return s


def uprosc_rdp(pts: List[Punkt], eps_m: float) -> List[Punkt]:
    """Upraszcza lamana algorytmem Ramera-Douglasa-Peuckera z tolerancja eps_m metrow."""
    if len(pts) < 3:
        return pts
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d, _ = odleglosc_do_odcinka(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps_m:
        return uprosc_rdp(pts[: idx + 1], eps_m)[:-1] + uprosc_rdp(pts[idx:], eps_m)
    return [pts[0], pts[-1]]


def najblizszy_indeks(linia: Sequence[Punkt], cel: Punkt) -> int:
    """Indeks wierzcholka lamanej najblizszego punktowi cel (skala dla lat celu)."""
    ky, kx = metry_na_stopien(cel[0])
    bi, bd = 0, 1e18
    for i, p in enumerate(linia):
        d = math.hypot((p[0] - cel[0]) * ky, (p[1] - cel[1]) * kx)
        if d < bd:
            bd, bi = d, i
    return bi


def powierzchnia_ha(ring: Sequence[Punkt]) -> float:
    """Pole wielokata (lat, lon) w hektarach wzorem Gaussa w lokalnym przyblizeniu plaskim."""
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[0] for p in ring) / len(ring)
    k = math.cos(math.radians(lat0))
    a = 0.0
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        x1, y1 = ring[i][1] * k, ring[i][0]
        x2, y2 = ring[j][1] * k, ring[j][0]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2 * (M_NA_STOPIEN ** 2) / 10000


def odleglosc_do_konturu_m(p: Punkt, ring: Sequence[Punkt]) -> float:
    """Najmniejsza odleglosc punktu p od wierzcholkow konturu (skala dla sredniej lat)."""
    best = 1e18
    for q in ring:
        d = odleglosc_m(p[0], p[1], q[0], q[1])
        if d < best:
            best = d
    return best
