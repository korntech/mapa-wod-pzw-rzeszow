"""Krok 7: zlozenie wynikowego data.json i odchudzonego pliku kandydatow dla panelu."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Sequence

from .config import Konfiguracja

log = logging.getLogger(__name__)


def zloz_rzeki(stare: Sequence[Dict], geometrie: Sequence[Optional[List]]) -> List[Dict]:
    """Podmienia geometrie rzek.

    Rzeka z nowa geometria (>= 2 wierzcholki) dostaje `pts` z BDOT10k i
    `src = "bdot10k"`; pozostale zachowuja stara linie i dostaja `src = "osm"`.
    Pozostale pola rekordu sa kopiowane bez zmian.
    """
    if len(stare) != len(geometrie):
        raise ValueError("liczba geometrii (%d) nie zgadza sie z liczba rzek (%d)" % (len(geometrie), len(stare)))
    rivers: List[Dict] = []
    for r, geom in zip(stare, geometrie):
        n = dict(r)
        if geom and len(geom) >= 2:
            n["pts"] = geom
            n["src"] = "bdot10k"
        else:
            n["src"] = "osm"
        rivers.append(n)
    return rivers


def zloz_zbiorniki(cfg: Konfiguracja, stare: Sequence[Dict], kandydaci: Dict) -> List[Dict]:
    """Przenosi pinezki zbiornikow o klasie `pewne` na centroid kandydata #1.

    Taki zbiornik dostaje `a = 0` i `src = "bdot10k"`. Zbiornik o klasie
    `do_wyboru` zachowuje pozycje, dostaje `src = "wykaz"` i `kand` (liczbe
    kandydatow). Pozostale rekordy sa kopiowane bez zmian.
    """
    idx = {w["nazwa"]: w for w in kandydaci["wyniki"]}
    miejsca = cfg.geometria.miejsca_dziesietne_pinezki
    zb: List[Dict] = []
    przesuniete = 0
    for z in stare:
        n = dict(z)
        w = idx.get(z["n"])
        if w and w["klasa"] == "pewne" and w["kandydaci"]:
            k = w["kandydaci"][0]
            n["p"] = [round(k["lat"], miejsca), round(k["lon"], miejsca)]
            n["a"] = 0
            n["src"] = "bdot10k"
            przesuniete += 1
        elif w and w["klasa"] == "do_wyboru":
            n["src"] = "wykaz"
            n["kand"] = len(w["kandydaci"])
        zb.append(n)
    log.info("zbiornikow przesunietych automatycznie: %d, pozostalo z a=1: %d",
             przesuniete, sum(1 for z in zb if z.get("a") == 1))
    return zb


def zloz_data(cfg: Konfiguracja, stare: Dict, geometrie: Sequence[Optional[List]], kandydaci: Dict,
              data_aktualizacji: str, powiatow_bdot: int) -> Dict:
    """Buduje wynikowy data.json: rzeki, zbiorniki, granice (bez zmian) i meta."""
    rivers = zloz_rzeki(stare["rivers"], geometrie)
    out = {
        "rivers": rivers,
        "zb": zloz_zbiorniki(cfg, stare["zb"], kandydaci),
        "granice": stare["granice"],
        "meta": {
            "zrodla": dict(cfg.meta.zrodla),
            "aktualizacja_geometrii": data_aktualizacji,
            "powiatow_bdot": powiatow_bdot,
            "uwaga": cfg.meta.uwaga,
        },
    }
    log.info("rzek z geometria BDOT: %d/%d, wierzcholkow rzek: %d -> %d",
             sum(1 for r in rivers if r["src"] == "bdot10k"), len(rivers),
             sum(len(r["pts"]) for r in stare["rivers"]), sum(len(r["pts"]) for r in rivers))
    return out


def kandydaci_dla_panelu(kandydaci: Dict) -> Dict:
    """Odchudzony plik kandydatow: bez klasy `pewne` i bez konturow (`ring`)."""
    lekki: Dict = {"meta": kandydaci["meta"], "wyniki": []}
    for w in kandydaci["wyniki"]:
        if w["klasa"] == "pewne":
            continue
        lekki["wyniki"].append({
            "nazwa": w["nazwa"], "klasa": w["klasa"], "ha_wykaz": w.get("ha_wykaz"),
            "obecna": w["obecna_pozycja"],
            "kandydaci": [{k: v for k, v in c.items() if k != "ring"} for c in w["kandydaci"]],
        })
    log.info("kandydatow dla panelu: %d", len(lekki["wyniki"]))
    return lekki
