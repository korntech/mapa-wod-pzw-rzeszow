"""Krok 6: dopasowanie zbiornikow z wykazu do poligonow wod BDOT10k.

Dla kazdego zbiornika z data.json oznaczonego jako lokalizacja przyblizona
(`a == 1`) zbierane sa poligony wod w promieniu `promien_poszukiwan_m` od
obecnej pinezki. Kandydatem jest pojedynczy poligon albo kompleks (grupa
poligonow wod stojacych polaczona single-linkage po centroidach). Kandydaci
sa punktowani za zgodnosc powierzchni z wykazem, odleglosc od pinezki i
zgodnosc nazwy, a wynik klasyfikowany jako `pewne`, `do_wyboru` lub `brak`.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .config import Konfiguracja, Zbiorniki
from .geo import odleglosc_do_konturu_m, odleglosc_m
from .nazwy import liczba_obiektow, normalizuj, parsuj_ha, tokeny

log = logging.getLogger(__name__)

Rekord = Dict[str, object]
Encja = Dict[str, object]


class IndeksSiatki:
    """Indeks przestrzenny poligonow na siatce stopniowej (klucz: komorka lat/lon)."""

    def __init__(self, poligony: Sequence[Rekord], siatka_deg: float) -> None:
        self.siatka = siatka_deg
        self.komorki: Dict[Tuple[int, int], List[int]] = defaultdict(list)
        for i, p in enumerate(poligony):
            self.komorki[(int(p["lat"] / siatka_deg), int(p["lon"] / siatka_deg))].append(i)

    def sasiedzi(self, lat: float, lon: float, promien_m: float) -> List[int]:
        """Indeksy poligonow z komorek pokrywajacych kwadrat o polowie boku promien_m."""
        zasieg = int(promien_m / 111320.0 / self.siatka) + 2
        gy, gx = int(lat / self.siatka), int(lon / self.siatka)
        out: List[int] = []
        for a in range(gy - zasieg, gy + zasieg + 1):
            for b in range(gx - zasieg, gx + zasieg + 1):
                out.extend(self.komorki.get((a, b), []))
        return out


def ocena_powierzchni(par: Zbiorniki, ha_kand: float, ha_wykaz: Optional[float]) -> Tuple[float, Optional[float]]:
    """Skladnik oceny za powierzchnie: gaussowski w log(ha_kand/ha_wykaz).

    Zwraca (punkty, q), gdzie q = ha_kand/ha_wykaz. Bez powierzchni w wykazie
    zwracana jest wartosc neutralna (35% wagi) i q = None.
    """
    if ha_wykaz is None or ha_wykaz <= 0:
        return par.waga_powierzchnia * 0.35, None
    if ha_kand <= 0:
        return 0.0, 0.0
    q = ha_kand / ha_wykaz
    return par.waga_powierzchnia * math.exp(-(math.log(q) ** 2) / (2 * par.sigma_log_powierzchni ** 2)), q


def ocena_odleglosci(par: Zbiorniki, d_m: float) -> float:
    """Skladnik oceny za odleglosc: waga * exp(-d / tau)."""
    return par.waga_odleglosc * math.exp(-d_m / par.tau_odleglosci_m)


def ocena_nazwy(par: Zbiorniki, nazwa_bdot: Optional[str], nazwa_wykaz: str) -> Tuple[float, str]:
    """Skladnik oceny za nazwe: pelna waga przy zawieraniu sie nazw, polowa przy wspolnym tokenie."""
    if not nazwa_bdot:
        return 0.0, "brak nazwy w BDOT"
    a, b = tokeny(nazwa_bdot, par.slowa_pomijane), tokeny(nazwa_wykaz, par.slowa_pomijane)
    if not a or not b:
        return 0.0, "brak tokenow"
    if a & b:
        na, nb = normalizuj(nazwa_bdot), normalizuj(nazwa_wykaz)
        if na == nb or na in nb or nb in na:
            return par.waga_nazwa, "nazwa zgodna"
        return par.waga_nazwa * 0.5, "nazwa czesciowo zgodna"
    return 0.0, "nazwa rozna"


def _klastry(par: Zbiorniki, bd: Sequence[Rekord], stojace: List[int]) -> Dict[int, List[int]]:
    """Single-linkage po centroidach poligonow wod stojacych o ha >= klaster_min_ha."""
    zalazki = [i for i in stojace if bd[i]["ha"] >= par.klaster_min_ha]
    rodzic = {i: i for i in stojace}

    def znajdz(x: int) -> int:
        while rodzic[x] != x:
            rodzic[x] = rodzic[rodzic[x]]
            x = rodzic[x]
        return x

    for ai in range(len(zalazki)):
        for bi in range(ai + 1, len(zalazki)):
            A, B = bd[zalazki[ai]], bd[zalazki[bi]]
            if odleglosc_m(A["lat"], A["lon"], B["lat"], B["lon"]) <= par.klaster_prog_m:
                ra, rb = znajdz(zalazki[ai]), znajdz(zalazki[bi])
                if ra != rb:
                    rodzic[ra] = rb
    grupy: Dict[int, List[int]] = defaultdict(list)
    for i in zalazki:
        grupy[znajdz(i)].append(i)
    return grupy


def _kompleks(bd: Sequence[Rekord], czlonkowie: List[int], rodzaj: str) -> Optional[Encja]:
    """Encja kompleksu: suma ha, centroid wazony ha, poligon glowny (najwiekszy), srednica."""
    suma = sum(bd[i]["ha"] for i in czlonkowie)
    if suma <= 0:
        return None
    clat = sum(bd[i]["lat"] * bd[i]["ha"] for i in czlonkowie) / suma
    clon = sum(bd[i]["lon"] * bd[i]["ha"] for i in czlonkowie) / suma
    glowny = max(czlonkowie, key=lambda i: bd[i]["ha"])
    srednica = 0.0
    for a in czlonkowie:
        for b in czlonkowie:
            srednica = max(srednica, odleglosc_m(bd[a]["lat"], bd[a]["lon"], bd[b]["lat"], bd[b]["lon"]))
    return {"ids": sorted(czlonkowie), "ha": round(suma, 3), "lat": round(clat, 6),
            "lon": round(clon, 6), "main": glowny, "kind": rodzaj, "srednica": round(srednica)}


def encje_kandydatow(par: Zbiorniki, bd: Sequence[Rekord], pula: List[int], stojace: List[int],
                     k_oczekiwane: int) -> List[Encja]:
    """Lista encji do oceny: pojedyncze poligony (ha >= poligon_min_ha), kompleksy
    (klastry >= 2 poligonow) oraz podzbiory k najwiekszych poligonow klastra,
    gdy wykaz deklaruje k obiektow."""
    encje: List[Encja] = []
    for i in pula:
        p = bd[i]
        if p["ha"] < par.poligon_min_ha:
            continue
        encje.append({"ids": [i], "ha": p["ha"], "lat": p["lat"], "lon": p["lon"],
                      "main": i, "kind": "poligon", "srednica": 0})
    widziane: Set[Tuple[int, ...]] = set()
    for czlonkowie in _klastry(par, bd, stojace).values():
        if len(czlonkowie) < 2:
            continue
        e = _kompleks(bd, czlonkowie, "kompleks")
        if e:
            encje.append(e)
            widziane.add(tuple(e["ids"]))
        if 1 < k_oczekiwane < len(czlonkowie):
            pod = sorted(czlonkowie, key=lambda i: -bd[i]["ha"])[:k_oczekiwane]
            klucz = tuple(sorted(pod))
            if klucz not in widziane:
                e2 = _kompleks(bd, pod, "kompleks (%d najwiekszych)" % k_oczekiwane)
                if e2:
                    encje.append(e2)
                    widziane.add(klucz)
    return encje


def ocen_encje(par: Zbiorniki, bd: Sequence[Rekord], e: Encja, lat: float, lon: float,
               ha_wykaz: Optional[float], nazwa_wykaz: str, kara: Dict[int, float],
               k_oczekiwane: int) -> Dict:
    """Oblicza ocene encji i jej skladowe.

    Odleglosc do oceny = min(odleglosc do centroidu, odleglosc do najblizszego
    wierzcholka konturu dowolnego poligonu encji). Ocena = powierzchnia +
    odleglosc + nazwa - kara za ciek (+ bonus za zgodna liczbe obiektow).
    """
    d_cen = odleglosc_m(lat, lon, e["lat"], e["lon"])
    d_min = min(odleglosc_do_konturu_m((lat, lon), bd[i]["ring"]) for i in e["ids"])
    d_oceny = min(d_cen, d_min)
    s_pow, q = ocena_powierzchni(par, e["ha"], ha_wykaz)
    nazwy = [bd[i]["n"] for i in e["ids"] if bd[i].get("n")]
    naj_nazwa, naj_pkt, naj_powod = None, 0.0, "brak nazwy w BDOT"
    for nm in nazwy:
        s, powod = ocena_nazwy(par, nm, nazwa_wykaz)
        if s > naj_pkt:
            naj_nazwa, naj_pkt, naj_powod = nm, s, powod
    if nazwy and naj_nazwa is None:
        naj_nazwa = nazwy[0]
    kara_pkt = max(kara.get(i, 0.0) for i in e["ids"])
    ocena = s_pow + ocena_odleglosci(par, d_oceny) + naj_pkt - kara_pkt
    if k_oczekiwane > 1 and len(e["ids"]) == k_oczekiwane:
        ocena += par.bonus_liczba_obiektow
    return {
        "ent": e, "ocena": round(ocena, 1), "kara_ciek": round(kara_pkt, 1),
        "q": (round(q, 3) if q else None), "d_cen": round(d_cen), "d_min": round(d_min),
        "s_area": round(s_pow, 1), "s_dist": round(ocena_odleglosci(par, d_oceny), 1),
        "s_name": round(naj_pkt, 1), "nazwa_bdot": naj_nazwa, "name_reason": naj_powod,
    }


def klasyfikuj(par: Zbiorniki, bd: Sequence[Rekord], ocenione: List[Dict], ha_wykaz: Optional[float],
               zaporowy: bool) -> Tuple[str, str]:
    """Klasa wyniku (pewne / do_wyboru / brak) z uzasadnieniem tekstowym.

    `pewne`: q w oknie +/-pewne_tolerancja_ha, odleglosc centroidu <= pewne_odleglosc_m,
    ocena >= pewne_min_ocena, przewaga >= pewne_min_przewaga, srednica kompleksu
    <= pewne_max_srednica_m, a poligon "woda plynaca" tylko dla zbiornika zaporowego;
    alternatywnie pelna zgodnosc nazwy + q w oknie +/-nazwa_tolerancja_ha + przewaga.
    `brak`: najlepsza ocena < brak_min_ocena; albo zaden kandydat niewiarygodny
    (q poza brak_okno_q i nazwa < wiarygodna_nazwa_min) i ocena < brak_ocena;
    albo q poza [brak_q_min, brak_q_max] przy nazwie < brak_nazwa_max.
    Pozostale przypadki: `do_wyboru`.
    """
    if not ocenione:
        return "brak", "brak jakichkolwiek poligonow wod w promieniu %d m" % par.promien_poszukiwan_m
    b = ocenione[0]
    drugi = ocenione[1]["ocena"] if len(ocenione) > 1 else 0.0
    q = b["q"]
    ha_ok = q is not None and (1 - par.pewne_tolerancja_ha) <= q <= (1 + par.pewne_tolerancja_ha)
    ha_ok_nazwa = q is not None and (1 - par.nazwa_tolerancja_ha) <= q <= (1 + par.nazwa_tolerancja_ha)
    przewaga = b["ocena"] - drugi
    srednica_ok = b["ent"].get("srednica", 0) <= par.pewne_max_srednica_m
    ciek_ok = (bd[b["ent"]["main"]]["rodzaj"] == par.rodzaj_woda_stojaca) or zaporowy
    if (ha_ok and b["d_cen"] <= par.pewne_odleglosc_m and b["ocena"] >= par.pewne_min_ocena
            and przewaga >= par.pewne_min_przewaga and srednica_ok and ciek_ok):
        return "pewne", ("powierzchnia %.2f ha vs wykaz %.2f ha (q=%.2f, w oknie +/-%d%%), "
                         "odleglosc %d m < %d m, ocena %.1f, przewaga %.1f pkt"
                         % (b["ent"]["ha"], ha_wykaz or 0, q, par.pewne_tolerancja_ha * 100,
                            b["d_cen"], par.pewne_odleglosc_m, b["ocena"], przewaga))
    if (b["s_name"] >= par.waga_nazwa and ha_ok_nazwa and b["d_cen"] <= par.promien_poszukiwan_m
            and przewaga >= par.pewne_min_przewaga and srednica_ok and ciek_ok):
        return "pewne", ('nazwa BDOT "%s" zgodna z wykazem, powierzchnia q=%.2f (okno +/-%d%%), '
                         "odleglosc %d m, przewaga %.1f pkt"
                         % (b["nazwa_bdot"], q, par.nazwa_tolerancja_ha * 100, b["d_cen"], przewaga))
    q_lo, q_hi = par.brak_okno_q
    wiarygodny = any((x["q"] is not None and q_lo <= x["q"] <= q_hi) or x["s_name"] >= par.wiarygodna_nazwa_min
                     for x in ocenione)
    if (b["ocena"] < par.brak_min_ocena or (not wiarygodny and b["ocena"] < par.brak_ocena)
            or (q is not None and (q < par.brak_q_min or q > par.brak_q_max) and b["s_name"] < par.brak_nazwa_max)):
        if not wiarygodny:
            return "brak", ("zaden z %d kandydatow nie ma powierzchni w oknie %.2f-%.2f wykazu "
                            "ani zgodnej nazwy; najlepsza ocena %.1f (< %.0f)"
                            % (len(ocenione), q_lo, q_hi, b["ocena"], par.brak_ocena))
        if b["ocena"] < par.brak_min_ocena:
            return "brak", "najlepsza ocena %.1f ponizej progu %.0f" % (b["ocena"], par.brak_min_ocena)
        return "brak", ("skrajna niezgodnosc powierzchni: najlepszy kandydat %.2f ha wobec %.2f ha "
                        "w wykazie (q=%.3f, poza oknem %.2f-%.2f), brak zgodnosci nazwy"
                        % (b["ent"]["ha"], ha_wykaz or 0, b["q"], par.brak_q_min, par.brak_q_max))
    return "do_wyboru", ("brak jednoznacznego zwyciezcy: ocena %.1f, przewaga %.1f pkt, q=%s, odleglosc %d m"
                         % (b["ocena"], przewaga, b["q"], b["d_cen"]))


def _kandydat_wyjsciowy(bd: Sequence[Rekord], s: Dict, pierwszy: bool) -> Dict:
    """Rekord kandydata do pliku wynikowego; kontur (`ring`) tylko dla kandydata #1."""
    e = s["ent"]
    c = {
        "lat": e["lat"], "lon": e["lon"], "ha": e["ha"],
        "nazwa_bdot": s["nazwa_bdot"], "rodzaj": bd[e["main"]]["rodzaj"],
        "odleglosc_m": s["d_cen"], "ocena": s["ocena"],
        "teryt": bd[e["main"]]["teryt"],
        "typ_kandydata": e["kind"], "liczba_poligonow": len(e["ids"]),
        "srednica_kompleksu_m": e.get("srednica", 0),
        "odleglosc_do_konturu_m": s["d_min"],
        "q_ha": s["q"],
        "skladowe_oceny": {"powierzchnia": s["s_area"], "odleglosc": s["s_dist"],
                           "nazwa": s["s_name"], "kara_ciek": s["kara_ciek"]},
    }
    if pierwszy:
        c["ring"] = bd[e["main"]]["ring"]
        if e["kind"] == "kompleks":
            c["ringi_kompleksu_n"] = len(e["ids"])
    return c


def dopasuj_zbiornik(par: Zbiorniki, bd: Sequence[Rekord], indeks: IndeksSiatki, z: Dict) -> Dict:
    """Pelne dopasowanie jednego zbiornika: kandydaci, oceny, klasa.

    Zwraca rekord wyniku z polami opisowymi, lista `kandydaci` (maks. 4,
    malejaco po ocenie) oraz pomocniczym `_ids1` (poligony kandydata #1,
    uzywane do kontroli konfliktow).
    """
    lat, lon = z["p"]
    ha_wykaz = parsuj_ha(z.get("ha"))
    k_oczekiwane = liczba_obiektow(z.get("t", ""))
    w_promieniu = [i for i in indeks.sasiedzi(lat, lon, par.promien_poszukiwan_m)
                   if odleglosc_m(lat, lon, bd[i]["lat"], bd[i]["lon"]) <= par.promien_poszukiwan_m]
    zaporowy = par.slowo_zaporowy in normalizuj(z.get("t", "") or "")
    stojace = [i for i in w_promieniu if bd[i]["rodzaj"] == par.rodzaj_woda_stojaca]
    plynace = [i for i in w_promieniu if bd[i]["rodzaj"] != par.rodzaj_woda_stojaca]
    kara = {i: (0.0 if zaporowy else par.kara_ciek) for i in plynace}
    encje = encje_kandydatow(par, bd, stojace + plynace, stojace, k_oczekiwane)
    ocenione = [ocen_encje(par, bd, e, lat, lon, ha_wykaz, z["n"], kara, k_oczekiwane) for e in encje]
    ocenione.sort(key=lambda x: -x["ocena"])
    zachowane, uzyte_glowne = [], set()
    for s in ocenione:
        if s["ent"]["main"] in uzyte_glowne:
            continue
        uzyte_glowne.add(s["ent"]["main"])
        zachowane.append(s)
    ocenione = zachowane
    klasa, uzasadnienie = klasyfikuj(par, bd, ocenione, ha_wykaz, zaporowy)
    return {
        "nazwa": z["n"], "obecna_pozycja": [lat, lon], "ha_wykaz": ha_wykaz,
        "ha_wykaz_tekst": z.get("ha"), "typ_wykaz": z.get("t"),
        "klasa": klasa, "uzasadnienie": uzasadnienie,
        "kandydatow_ocenianych": len(ocenione),
        "ocena_najlepszego": (ocenione[0]["ocena"] if ocenione else None),
        "ocena_drugiego": (ocenione[1]["ocena"] if len(ocenione) > 1 else None),
        "ha_drugiego": (ocenione[1]["ent"]["ha"] if len(ocenione) > 1 else None),
        "kandydaci": [_kandydat_wyjsciowy(bd, s, j == 0) for j, s in enumerate(ocenione[:4])],
        "_ids1": (ocenione[0]["ent"]["ids"] if ocenione else []),
    }


def kontrola_konfliktow(wyniki: List[Dict]) -> List[Tuple[str, str]]:
    """Degraduje `pewne` do `do_wyboru`, gdy ten sam poligon jest kandydatem #1 dwoch zbiornikow."""
    konflikty: List[Tuple[str, str]] = []
    for i in range(len(wyniki)):
        for j in range(i + 1, len(wyniki)):
            A, B = wyniki[i], wyniki[j]
            if A["_ids1"] and B["_ids1"] and set(A["_ids1"]) & set(B["_ids1"]):
                konflikty.append((A["nazwa"], B["nazwa"]))
                for W, inny in ((A, B), (B, A)):
                    if W["klasa"] == "pewne":
                        W["klasa"] = "do_wyboru"
                        W["uzasadnienie"] += (' | ZDEGRADOWANE do "do_wyboru": ten sam poligon BDOT '
                                              'jest najlepszym kandydatem rowniez dla lowiska "%s"' % inny["nazwa"])
    return konflikty


def opis_progow(par: Zbiorniki) -> Dict[str, object]:
    """Tekstowy opis progow do sekcji meta pliku wynikowego."""
    return {
        "promien_poszukiwan_m": par.promien_poszukiwan_m,
        "klastrowanie_kompleksow": "single-linkage po centroidach, prog %d m, zalazki >= %.2f ha"
                                   % (par.klaster_prog_m, par.klaster_min_ha),
        "ocena": "ocena = %g*exp(-ln(ha_bdot/ha_wykaz)^2/(2*%g^2)) + %g*exp(-d/%gm) + nazwa(%g pelna / %s czesciowa) + %g pkt za zgodna liczbe obiektow w kompleksie"
                 % (par.waga_powierzchnia, par.sigma_log_powierzchni, par.waga_odleglosc, par.tau_odleglosci_m,
                    par.waga_nazwa, ("%g" % (par.waga_nazwa / 2)).replace(".", ","), par.bonus_liczba_obiektow),
        "odleglosc_do_oceny": "min(odleglosc do centroidu, odleglosc do najblizszego wierzcholka konturu)",
        "cieki": 'poligony "woda plynaca" sa zawsze kandydatami (zbiorniki zaporowe i starorzecza bywaja tak mapowane w BDOT), ale z kara %.0f pkt; kara uchylona gdy wykaz opisuje lowisko jako "zbiornik zaporowy". Klasa "pewne" dla poligonu typu "woda plynaca" mozliwa tylko dla zbiornikow zaporowych. Klastrowanie kompleksow obejmuje wylacznie wody stojace.' % par.kara_ciek,
        "pewne": "powierzchnia w oknie +/-%d%% wykazu ORAZ odleglosc centroidu <= %d m ORAZ ocena >= %.0f ORAZ przewaga >= %.0f pkt nad drugim kandydatem; alternatywnie pelna zgodnosc nazwy BDOT + powierzchnia +/-%d%% + przewaga >= %.0f pkt"
                 % (par.pewne_tolerancja_ha * 100, par.pewne_odleglosc_m, par.pewne_min_ocena,
                    par.pewne_min_przewaga, par.nazwa_tolerancja_ha * 100, par.pewne_min_przewaga),
        "brak": "zaden kandydat nie ma powierzchni w oknie %.2f-%.2f wykazu ani zgodnej nazwy, a najlepsza ocena < %.0f; albo najlepsza ocena < %.0f; albo q < %.2f / q > %.2f przy braku zgodnosci nazwy. Dla tej klasy zwracane sa mimo to %d najblizsze warianty jako trop dla operatora."
                % (par.brak_okno_q[0], par.brak_okno_q[1], par.brak_ocena, par.brak_min_ocena,
                   par.brak_q_min, par.brak_q_max, par.limit_kandydatow["brak"]),
        "do_wyboru": "pozostale przypadki; zwracane maks. %d najlepsze warianty" % par.limit_kandydatow["do_wyboru"],
        "ograniczenie_kompleksu": 'kandydat-kompleks o srednicy > %d m nie moze byc "pewny" (ryzyko sklejenia lancuchowego)'
                                  % par.pewne_max_srednica_m,
        "podzbiory": 'gdy wykaz deklaruje k obiektow (np. "5 wyrobisk"), oceniany jest takze podzbior k najwiekszych poligonow klastra',
        "kontrola_konfliktow": 'jesli ten sam poligon BDOT jest kandydatem #1 dla dwoch roznych lowisk, obie klasyfikacje "pewne" sa degradowane do "do_wyboru"',
    }


def dopasuj_wszystkie(cfg: Konfiguracja, data: Dict, poligony: Sequence[Rekord], data_raportu: str) -> Dict:
    """Dopasowuje wszystkie zbiorniki z `a == 1` i zwraca {meta, wyniki}.

    Po ocenie wykonywana jest kontrola konfliktow, a liczba zwracanych
    kandydatow jest ograniczana wg klasy (`limit_kandydatow`).
    """
    par = cfg.zbiorniki
    zbiorniki = [z for z in data["zb"] if z.get("a") == 1]
    log.info("zbiornikow do dopasowania (a=1): %d, poligonow wod: %d", len(zbiorniki), len(poligony))
    indeks = IndeksSiatki(poligony, par.siatka_deg)
    wyniki = [dopasuj_zbiornik(par, poligony, indeks, z) for z in zbiorniki]
    konflikty = kontrola_konfliktow(wyniki)
    for a, b in konflikty:
        log.info("konflikt kandydata #1: %s / %s", a, b)
    for w in wyniki:
        del w["_ids1"]
        w["kandydaci"] = w["kandydaci"][: par.limit_kandydatow[w["klasa"]]]
        log.info("%-28s %-10s ocena=%s  kandydatow=%d", w["nazwa"], w["klasa"],
                 w["ocena_najlepszego"], len(w["kandydaci"]))
    klasy: Dict[str, int] = defaultdict(int)
    for w in wyniki:
        klasy[w["klasa"]] += 1
    log.info("klasy: %s", dict(klasy))
    meta = {
        "data": data_raportu,
        "zrodlo": cfg.meta.zrodlo_kandydatow,
        "liczba_zbiornikow": len(wyniki),
        "progi": opis_progow(par),
    }
    return {"meta": meta, "wyniki": wyniki}
