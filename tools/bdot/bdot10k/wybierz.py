"""Krok 2: zawezenie listy powiatow do tych, w ktorych leza obiekty z data.json."""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from .config import Konfiguracja

log = logging.getLogger(__name__)


def punkty_z_danych(data: Dict) -> List[Tuple[float, float]]:
    """Wszystkie punkty (lat, lon) z data.json: pinezki zbiornikow, granice obwodow i wierzcholki rzek."""
    pts = [(z["p"][0], z["p"][1]) for z in data["zb"]]
    pts += [(g["p"][0], g["p"][1]) for g in data["granice"]]
    for r in data["rivers"]:
        pts += [(p[0], p[1]) for p in r["pts"]]
    return pts


def wybierz_powiaty(cfg: Konfiguracja, powiaty: List[Dict], data: Dict) -> List[Dict]:
    """Zwraca powiaty, ktorych bbox (z marginesem) zawiera co najmniej jeden punkt danych.

    Kazdy rekord otrzymuje pole `punktow` (liczba trafien); lista posortowana
    malejaco po tej liczbie. Margines `obszar.margines_wyboru_deg` rekompensuje
    zaokraglenie bbox do 3 miejsc i obiekty lezace tuz przy granicy powiatu.
    """
    pts = punkty_z_danych(data)
    m = cfg.obszar.margines_wyboru_deg
    wybrane: List[Dict] = []
    for p in powiaty:
        la0, lo0, la1, lo1 = p["bbox"]
        n = sum(1 for la, lo in pts if la0 - m <= la <= la1 + m and lo0 - m <= lo <= lo1 + m)
        if n:
            wybrane.append(dict(p, punktow=n))
    wybrane.sort(key=lambda r: -r["punktow"])
    log.info("wybrano powiatow: %d z %d (trafien %d z %d punktow)",
             len(wybrane), len(powiaty), sum(s["punktow"] for s in wybrane), len(pts))
    for s in wybrane:
        log.debug("  %s %-32s punktow=%d", s["teryt"], s["nazwa"], s["punktow"])
    return wybrane
