"""Krok 5: zszywanie odcinkow ciekow BDOT10k w ciagle linie rzek.

Dla kazdej rzeki z data.json istniejaca linia (`pts`) sluzy jako kregoslup:
wyznacza zasieg obwodu i kierunek. Z BDOT10k pobierane sa odcinki o zgodnej
nazwie lezace w korytarzu wokol kregoslupa oraz odcinki nienazwane lezace
w wezszym korytarzu. Odcinki sa porzadkowane wzdluz kregoslupa, laczone
koncami (z mostkowaniem przerw na granicach powiatow), przycinane do
zasiegu kregoslupa i upraszczane algorytmem RDP.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .config import Konfiguracja, Rzeki
from .geo import (dlugosc_linii, najblizszy_indeks, odleglosc_lokalna_m,
                  odleglosc_ze_skala_m, pozycja_na_linii, uprosc_rdp)
from .nazwy import nazwy_bazowe, normalizuj

log = logging.getLogger(__name__)

Pkt = Tuple[float, float]
Linia = List[Pkt]
Rekord = Dict[str, object]


def indeks_nazw(cieki: Sequence[Rekord]) -> Dict[str, List[Rekord]]:
    """Grupuje odcinki ciekow po znormalizowanej nazwie (odcinki bez nazwy pomijane)."""
    idx: Dict[str, List[Rekord]] = {}
    for c in cieki:
        if c.get("n"):
            idx.setdefault(normalizuj(str(c["n"])), []).append(c)
    return idx


def _klucz(p: Sequence[float], miejsca: int) -> Tuple[float, float]:
    return (round(p[0], miejsca), round(p[1], miejsca))


def _klucz_odcinka(c: Rekord, miejsca: int) -> Tuple:
    """Klucz deduplikacji odcinka: zaokraglone konce i liczba wierzcholkow."""
    pts = c["pts"]
    return (_klucz(pts[0], miejsca), _klucz(pts[-1], miejsca), len(pts))


def zbierz_odcinki(par: Rzeki, spine: Linia, nazwy: Set[str], idx: Dict[str, List[Rekord]],
                   cieki: Sequence[Rekord], miejsca: int) -> List[Linia]:
    """Wybiera odcinki BDOT nalezace do rzeki.

    1. Odcinki o nazwie ze zbioru `nazwy`, ktorych co najmniej
       `udzial_min_nazwane` wierzcholkow (i nie mniej niz 2) lezy w korytarzu
       `korytarz_m` od kregoslupa.
    2. Pozostale odcinki (nienazwane lub o innej nazwie) z bbox kregoslupa
       powiekszonego o `bbox_margines_deg`, ktorych co najmniej
       `udzial_min_nienazwane` wierzcholkow lezy w korytarzu `korytarz_nienazwane_m`.
    Odcinki sa deduplikowane po kluczu (konce, liczba wierzcholkow).
    """
    segs: List[Linia] = []
    seen: Set[Tuple] = set()
    for nazwa in sorted(nazwy):
        for c in idx.get(nazwa, []):
            k = _klucz_odcinka(c, miejsca)
            if k in seen:
                continue
            seen.add(k)
            w = [p for p in c["pts"] if pozycja_na_linii(p, spine)[0] <= par.korytarz_m]
            if len(w) >= max(2, par.udzial_min_nazwane * len(c["pts"])):
                segs.append([(p[0], p[1]) for p in c["pts"]])
    m = par.bbox_margines_deg
    lat0, lat1 = min(p[0] for p in spine) - m, max(p[0] for p in spine) + m
    lon0, lon1 = min(p[1] for p in spine) - m, max(p[1] for p in spine) + m
    for c in cieki:
        k = _klucz_odcinka(c, miejsca)
        if k in seen:
            continue
        p0 = c["pts"][0]
        if not (lat0 <= p0[0] <= lat1 and lon0 <= p0[1] <= lon1):
            continue
        w = [p for p in c["pts"] if pozycja_na_linii(p, spine)[0] <= par.korytarz_nienazwane_m]
        if len(w) >= max(2, par.udzial_min_nienazwane * len(c["pts"])):
            seen.add(k)
            segs.append([(p[0], p[1]) for p in c["pts"]])
    return segs


def _odcinek_startowy(segs: List[Linia], spine: Linia) -> Tuple[int, Linia]:
    """Odcinek i jego orientacja, od ktorych zaczyna sie zszywanie.

    Startem jest wierzcholek (dowolnego odcinka) najblizszy poczatkowi
    kregoslupa; moze on lezec w srodku odcinka. Z dwoch polowek odcinka
    wybierana jest ta, ktora posuwa sie wzdluz kregoslupa do przodu.
    """
    naj = (1e18, 0, 0)
    for i, s in enumerate(segs):
        for vi, p in enumerate(s):
            d = odleglosc_lokalna_m(p, spine[0])
            if d < naj[0]:
                naj = (d, i, vi)
    _, si, vi = naj
    s = segs[si]
    przod = s[vi:]
    tyl = s[: vi + 1][::-1]

    def postep(seq: Linia) -> float:
        if len(seq) < 2:
            return -1e18
        return pozycja_na_linii(seq[-1], spine)[1] - pozycja_na_linii(seq[0], spine)[1]

    linia = przod if postep(przod) >= postep(tyl) else tyl
    if len(linia) < 2:
        linia = s[:]
    return si, list(linia)


def zszyj_odcinki(par: Rzeki, segs: List[Linia], spine: Linia) -> Tuple[Linia, Set[int], int]:
    """Laczy odcinki w jedna lamana wzdluz kregoslupa.

    W kazdym kroku do konca biezacej linii doklejany jest kolejny odcinek:
    1. polaczenie bezposrednie: koniec odcinka w promieniu `join_m`, wybierany
       jest ten, ktorego drugi koniec ma najwiekszy postep wzdluz kregoslupa
       (postep nie mniejszy niz -tolerancja_pozycji);
    2. mostek: gdy brak polaczenia bezposredniego, najblizszy koniec odcinka
       w promieniu `bridge_m`, o ile lezy nie wczesniej na kregoslupie niz
       biezacy koniec i o ile odcinek nie cofa sie wzdluz kregoslupa.
    Zwraca (linia, indeksy uzytych odcinkow, liczba mostkow).
    """
    tol = par.tolerancja_pozycji
    info = []
    for i, s in enumerate(segs):
        info.append({"i": i, "a": s[0], "b": s[-1],
                     "pa": pozycja_na_linii(s[0], spine)[1], "pb": pozycja_na_linii(s[-1], spine)[1]})
    si, linia = _odcinek_startowy(segs, spine)
    uzyte: Set[int] = {si}
    mostki = 0
    while True:
        kon = linia[-1]
        poz = pozycja_na_linii(kon, spine)[1]
        naj: Optional[Tuple[float, int, Linia, float, bool]] = None
        for it in info:
            if it["i"] in uzyte:
                continue
            for koniec, pt in ((0, it["a"]), (1, it["b"])):
                d = odleglosc_lokalna_m(kon, pt)
                if d <= par.join_m:
                    kand = segs[it["i"]][:] if koniec == 0 else segs[it["i"]][::-1]
                    postep = pozycja_na_linii(kand[-1], spine)[1] - poz
                    if postep > -tol and (naj is None or postep > naj[0]):
                        naj = (postep, it["i"], kand, d, False)
        if naj is None:
            best: Optional[Tuple[float, int, Linia]] = None
            for it in info:
                if it["i"] in uzyte:
                    continue
                for koniec, pt, poz_daleki in ((0, it["a"], it["pb"]), (1, it["b"], it["pa"])):
                    d = odleglosc_lokalna_m(kon, pt)
                    if d > par.bridge_m:
                        continue
                    p_tu = pozycja_na_linii(pt, spine)[1]
                    if p_tu < poz - tol:
                        continue
                    if poz_daleki < p_tu - tol:
                        continue
                    if best is None or d < best[0]:
                        kand = segs[it["i"]][:] if koniec == 0 else segs[it["i"]][::-1]
                        best = (d, it["i"], kand)
            if best:
                naj = (0.0, best[1], best[2], best[0], True)
                mostki += 1
        if naj is None:
            break
        _, j, kand, _, most = naj
        uzyte.add(j)
        linia += kand if most else kand[1:]
    return linia, uzyte, mostki


def przytnij(linia: Linia, spine: Linia) -> Linia:
    """Przycina linie do fragmentu miedzy wierzcholkami najblizszymi koncom kregoslupa."""
    i0 = najblizszy_indeks(linia, spine[0])
    i1 = najblizszy_indeks(linia, spine[-1])
    if i0 > i1:
        i0, i1 = i1, i0
    return linia[i0: i1 + 1]


def zszyj_rzeke(cfg: Konfiguracja, rzeka: Dict, idx: Dict[str, List[Rekord]],
                cieki: Sequence[Rekord]) -> Tuple[Optional[List[List[float]]], Dict]:
    """Buduje nowa geometrie jednej rzeki.

    Wejscie: rekord rzeki z data.json (pola `n`, `pts`), indeks nazw i pelna
    lista odcinkow. Wyjscie: (geometria lub None, rekord raportu). Raport ma
    status OK / BRAK (zadnych odcinkow) / BRAK_PO_PRZYCIECIU oraz statystyki
    porownawcze (liczby wierzcholkow, dlugosci, odleglosci koncow od kregoslupa).
    """
    par = cfg.rzeki
    miejsca = cfg.geometria.miejsca_dziesietne
    spine: Linia = [(p[0], p[1]) for p in rzeka["pts"]]
    nazwy = nazwy_bazowe(rzeka["n"], par.aliasy)
    segs = zbierz_odcinki(par, spine, nazwy, idx, cieki, miejsca)
    if not segs:
        log.warning("%s: brak odcinkow BDOT dla nazw %s", rzeka["n"], sorted(nazwy))
        return None, {"rzeka": rzeka["n"], "status": "BRAK", "segmentow": 0}
    linia, uzyte, mostki = zszyj_odcinki(par, segs, spine)
    linia = przytnij(linia, spine)
    if len(linia) < 2:
        log.warning("%s: linia pusta po przycieciu", rzeka["n"])
        return None, {"rzeka": rzeka["n"], "status": "BRAK_PO_PRZYCIECIU", "segmentow": len(segs)}
    upr = uprosc_rdp(linia, par.rdp_eps_m)
    dl_s, dl_n = dlugosc_linii(spine), dlugosc_linii(upr)
    d_start = odleglosc_ze_skala_m(upr[0], spine[0], spine[0][0])
    d_end = odleglosc_ze_skala_m(upr[-1], spine[-1], spine[0][0])
    raport = {
        "rzeka": rzeka["n"], "status": "OK", "segmentow": len(segs), "uzytych": len(uzyte),
        "mostki": mostki, "pkt_stare": len(spine), "pkt_nowe": len(upr),
        "dl_stara_m": round(dl_s), "dl_nowa_m": round(dl_n),
        "zmiana_dl_pct": round(100 * (dl_n - dl_s) / dl_s, 1),
        "konce_m": [round(d_start), round(d_end)],
    }
    log.info("%-36s seg=%4d/%3d  pkt %4d->%4d  dl %6.1f->%6.1f km (%+6.1f%%)  konce %5d/%5d m",
             rzeka["n"][:36], len(segs), len(uzyte), len(spine), len(upr),
             dl_s / 1000, dl_n / 1000, raport["zmiana_dl_pct"], round(d_start), round(d_end))
    return [[round(a, miejsca), round(b, miejsca)] for a, b in upr], raport


def zszyj_wszystkie(cfg: Konfiguracja, data: Dict, cieki: Sequence[Rekord]) -> Tuple[List, List[Dict]]:
    """Przetwarza wszystkie rzeki z data.json.

    Zwraca (geometrie, raport): listy rownolegle do data['rivers'];
    geometria to lista [lat, lon] albo None, gdy rzeki nie udalo sie odtworzyc.
    """
    idx = indeks_nazw(cieki)
    geometrie: List = []
    raport: List[Dict] = []
    for r in data["rivers"]:
        g, rap = zszyj_rzeke(cfg, r, idx, cieki)
        geometrie.append(g)
        raport.append(rap)
    ok = sum(1 for x in raport if x["status"] == "OK")
    log.info("rzek odtworzonych z BDOT10k: %d/%d", ok, len(raport))
    return geometrie, raport
