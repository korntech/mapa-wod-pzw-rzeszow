"""Krok 4: parsowanie warstw GML BDOT10k z paczek ZIP do JSON.

Z kazdej paczki czytane sa wylacznie pliki warstw wymienionych w
konfiguracji (`warstwy.poligony_wod`, `warstwy.cieki`). Parsowanie jest
strumieniowe (ElementTree.iterparse bezposrednio na strumieniu z archiwum),
wiec archiwa nie musza byc rozpakowywane, a pamiec nie zalezy od rozmiaru
pliku. Wspolrzedne EPSG:2180 (easting, northing) sa przeliczane na
(lat, lon) WGS84 i zaokraglane do `geometria.miejsca_dziesietne`.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Sequence, Tuple

from pyproj import Transformer

from .config import Konfiguracja
from .geo import poslist_na_punkty, powierzchnia_ha, transformer

log = logging.getLogger(__name__)

Rekord = Dict[str, object]
POLA_ATRYBUTOW = ("nazwa", "rodzaj", "x_kod", "idIIP")


def _lokalna(tag: str) -> str:
    """Nazwa elementu XML bez przestrzeni nazw."""
    return tag.rsplit("}", 1)[-1]


def _atrybuty(cecha: ET.Element) -> Dict[str, str]:
    """Wartosci pierwszego wystapienia pol z POLA_ATRYBUTOW w elemencie cechy."""
    d: Dict[str, str] = {}
    for el in cecha.iter():
        n = _lokalna(el.tag)
        if n in POLA_ATRYBUTOW and n not in d and el.text:
            d[n] = el.text
    return d


def _poslisty(el: ET.Element) -> List[str]:
    """Tresci wszystkich elementow gml:posList w poddrzewie (w kolejnosci dokumentu)."""
    return [p.text or "" for p in el.iter() if _lokalna(p.tag) == "posList"]


def _cechy(strumien) -> Iterator[ET.Element]:
    """Iteruje po elementach gml:featureMember dokumentu GML, zwalniajac je po uzyciu."""
    for _, el in ET.iterparse(strumien, events=("end",)):
        if _lokalna(el.tag) == "featureMember":
            yield el
            el.clear()


def parsuj_poligony(strumien, tr: Transformer, miejsca: int) -> List[Rekord]:
    """Parsuje warstwe poligonowa (OT_PTWP_A).

    Dla kazdej cechy brany jest pierwszy gml:posList wewnatrz gml:exterior
    (pierscienie wewnetrzne sa pomijane). Wynik: lista rekordow
    {n, rodzaj, lat, lon, ha, ring}, gdzie lat/lon to srednia wierzcholkow,
    ha to pole pierscienia zewnetrznego, ring to lista [lat, lon].
    Cechy bez pierscienia zewnetrznego lub z mniej niz 3 wierzcholkami sa pomijane.
    """
    out: List[Rekord] = []
    for cecha in _cechy(strumien):
        p = _atrybuty(cecha)
        zewn = next((e for e in cecha.iter() if _lokalna(e.tag) == "exterior"), None)
        if zewn is None:
            continue
        listy = _poslisty(zewn)
        if not listy:
            continue
        pts = poslist_na_punkty(listy[0], tr)
        if len(pts) < 3:
            continue
        lat = sum(q[0] for q in pts) / len(pts)
        lon = sum(q[1] for q in pts) / len(pts)
        out.append({
            "n": p.get("nazwa"),
            "rodzaj": p.get("rodzaj"),
            "lat": round(lat, miejsca),
            "lon": round(lon, miejsca),
            "ha": round(powierzchnia_ha(pts), 3),
            "ring": [[round(a, miejsca), round(b, miejsca)] for a, b in pts],
        })
    return out


def parsuj_linie(strumien, tr: Transformer, miejsca: int) -> List[Rekord]:
    """Parsuje warstwe liniowa (OT_SWRS_L, OT_SWKN_L).

    Kazdy gml:posList cechy staje sie osobnym rekordem {n, rodzaj, pts},
    gdzie pts to lista [lat, lon]. Listy o mniej niz 2 wierzcholkach sa pomijane.
    """
    out: List[Rekord] = []
    for cecha in _cechy(strumien):
        p = _atrybuty(cecha)
        for tekst in _poslisty(cecha):
            pts = poslist_na_punkty(tekst, tr)
            if len(pts) < 2:
                continue
            out.append({
                "n": p.get("nazwa"),
                "rodzaj": p.get("rodzaj"),
                "pts": [[round(a, miejsca), round(b, miejsca)] for a, b in pts],
            })
    return out


def _czlonek_warstwy(zf: zipfile.ZipFile, warstwa: str) -> Optional[str]:
    """Nazwa pliku w archiwum odpowiadajaca warstwie (np. '..._OT_PTWP_A.xml')."""
    koncowka = f"_{warstwa}.xml"
    for n in zf.namelist():
        if n.endswith(koncowka):
            return n
    return None


def parsuj_paczke(cfg: Konfiguracja, paczka: Path, tr: Transformer) -> Tuple[List[Rekord], List[Rekord]]:
    """Parsuje jedna paczke powiatu.

    Zwraca (poligony_wod, cieki); kazdy rekord ma dodane pole `teryt`
    (nazwa pliku ZIP bez rozszerzenia). Warstwy ciekow sa laczone w
    kolejnosci z konfiguracji. Brak pliku warstwy jest logowany jako ostrzezenie.
    """
    teryt = paczka.stem
    miejsca = cfg.geometria.miejsca_dziesietne
    poligony: List[Rekord] = []
    cieki: List[Rekord] = []
    with zipfile.ZipFile(paczka) as zf:
        for warstwa in cfg.warstwy.poligony_wod:
            czlonek = _czlonek_warstwy(zf, warstwa)
            if czlonek is None:
                log.warning("%s: brak warstwy %s", teryt, warstwa)
                continue
            with zf.open(czlonek) as fh:
                poligony += parsuj_poligony(fh, tr, miejsca)
        for warstwa in cfg.warstwy.cieki:
            czlonek = _czlonek_warstwy(zf, warstwa)
            if czlonek is None:
                log.warning("%s: brak warstwy %s", teryt, warstwa)
                continue
            with zf.open(czlonek) as fh:
                cieki += parsuj_linie(fh, tr, miejsca)
    for r in poligony:
        r["teryt"] = teryt
    for r in cieki:
        r["teryt"] = teryt
    log.info("%s: poligony wod=%5d  odcinki ciekow=%5d", teryt, len(poligony), len(cieki))
    return poligony, cieki


def parsuj_paczki(cfg: Konfiguracja, paczki: Sequence[Path]) -> Tuple[List[Rekord], List[Rekord], Dict]:
    """Parsuje wszystkie paczki (posortowane po nazwie, czyli po TERYT).

    Zwraca (poligony_wod, cieki, meta), gdzie meta opisuje zrodlo:
    liste TERYT, liczby rekordow i liczbe unikalnych nazw ciekow.
    """
    tr = transformer(cfg.crs.zrodlowy, cfg.crs.docelowy)
    poligony: List[Rekord] = []
    cieki: List[Rekord] = []
    teryty: List[str] = []
    for paczka in sorted(paczki, key=lambda p: p.name):
        pl, ci = parsuj_paczke(cfg, paczka, tr)
        poligony += pl
        cieki += ci
        teryty.append(paczka.stem)
    nazwane = {str(x["n"]) for x in cieki if x.get("n")}
    meta = {
        "powiaty": teryty,
        "powiatow": len(teryty),
        "poligonow_wod": len(poligony),
        "odcinkow_ciekow": len(cieki),
        "nazwanych_ciekow": len(nazwane),
        "warstwy": {"poligony_wod": list(cfg.warstwy.poligony_wod), "cieki": list(cfg.warstwy.cieki)},
        "crs": {"zrodlowy": cfg.crs.zrodlowy, "docelowy": cfg.crs.docelowy},
    }
    log.info("razem: poligony wod=%d, odcinki ciekow=%d, nazwanych ciekow=%d",
             len(poligony), len(cieki), len(nazwane))
    return poligony, cieki, meta
