"""Krok 1: indeks powiatow BDOT10k z uslugi WFS Geoportalu.

Usluga PobieranieBDOT10k zwraca dla kazdego powiatu m.in. kod TERYT, nazwe,
date aktualizacji, adres paczki GML oraz `gml:boundedBy` z koperta w
EPSG:2180. Wynikiem kroku jest lista powiatow, ktorych koperta przecina
obszar Okregu (bbox z konfiguracji powiekszony o margines).
"""

from __future__ import annotations

import logging
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Iterator, List, Optional

from .config import Konfiguracja
from .geo import transformer
from .pliki import pobierz_do_pliku

log = logging.getLogger(__name__)

Powiat = Dict[str, object]


def _lokalna(tag: str) -> str:
    """Nazwa elementu XML bez przestrzeni nazw."""
    return tag.rsplit("}", 1)[-1]


def url_wfs(cfg: Konfiguracja) -> str:
    """Adres zapytania GetFeature dla warstwy powiatow."""
    q = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": cfg.wfs.typeNames,
        "count": str(cfg.wfs.count),
    }
    return cfg.wfs.url + "?" + urllib.parse.urlencode(q)


def _czytaj_czlonkow(plik: Path) -> Iterator[Dict[str, str]]:
    """Iteruje po elementach wfs:member odpowiedzi WFS.

    Dla kazdego powiatu zwraca slownik pol tekstowych (TERYT, NAZWA_POWIATU,
    Data_aktualizacji, URL_GML, ...) oraz klucze `lowerCorner` i `upperCorner`
    z tresci gml:Envelope. Parsowanie strumieniowe, elementy sa zwalniane po
    przetworzeniu.
    """
    for _, el in ET.iterparse(plik, events=("end",)):
        if _lokalna(el.tag) != "member":
            continue
        pola: Dict[str, str] = {}
        for pot in el.iter():
            nazwa = _lokalna(pot.tag)
            if nazwa in ("lowerCorner", "upperCorner") or (
                pot.text and not len(pot) and nazwa not in ("posList", "pos")
            ):
                pola.setdefault(nazwa, (pot.text or "").strip())
        yield pola
        el.clear()


def powiaty_w_zasiegu(cfg: Konfiguracja, plik_wfs: Path) -> List[Powiat]:
    """Wybiera z odpowiedzi WFS powiaty przecinajace obszar Okregu.

    Wejscie: sciezka do zapisanej odpowiedzi GetFeature (GML 3.2).
    Wyjscie: lista slownikow {teryt, nazwa, url, akt, bbox=[lat0, lon0, lat1, lon1]}
    posortowana po TERYT. Koperta `gml:Envelope` w WFS ma kolejnosc osi
    autorytetu EPSG:2180, czyli (northing, easting); przed transformacja osie
    sa zamieniane na (easting, northing).
    """
    tr = transformer(cfg.crs.zrodlowy, cfg.crs.docelowy)
    lat_min, lat_max, lon_min, lon_max = cfg.obszar.zasieg()
    wynik: List[Powiat] = []
    razem = 0
    for f in _czytaj_czlonkow(plik_wfs):
        razem += 1
        if "URL_GML" not in f or "lowerCorner" not in f or "upperCorner" not in f:
            continue
        lo = [float(v) for v in f["lowerCorner"].split()]
        up = [float(v) for v in f["upperCorner"].split()]
        lon0, lat0 = tr.transform(lo[1], lo[0])
        lon1, lat1 = tr.transform(up[1], up[0])
        if lat1 < lat_min or lat0 > lat_max or lon1 < lon_min or lon0 > lon_max:
            continue
        wynik.append({
            "teryt": f["TERYT"],
            "nazwa": f.get("NAZWA_POWIATU", ""),
            "url": f["URL_GML"],
            "akt": f.get("Data_aktualizacji", "")[:10],
            "bbox": [round(lat0, 3), round(lon0, 3), round(lat1, 3), round(lon1, 3)],
        })
    wynik.sort(key=lambda r: str(r["teryt"]))
    log.info("powiatow w odpowiedzi WFS: %d, w zasiegu Okregu: %d", razem, len(wynik))
    return wynik


def pobierz_indeks(cfg: Konfiguracja, plik_wfs: Path, *, wymus: bool = False) -> Path:
    """Pobiera odpowiedz WFS do pliku (pomija pobieranie, gdy plik juz istnieje i nie podano wymus)."""
    if plik_wfs.exists() and plik_wfs.stat().st_size > 0 and not wymus:
        log.info("uzywam zapisanej odpowiedzi WFS: %s", plik_wfs)
        return plik_wfs
    url = url_wfs(cfg)
    log.info("pobieram indeks powiatow: %s", url)
    pobierz_do_pliku(url, plik_wfs, timeout_s=cfg.wfs.timeout_s, proby=cfg.wfs.proby, odstep_s=cfg.wfs.odstep_s)
    return plik_wfs
