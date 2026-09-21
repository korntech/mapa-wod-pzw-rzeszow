"""Krok 3: pobranie paczek GML BDOT10k dla wybranych powiatow."""

from __future__ import annotations

import logging
import zipfile
from pathlib import Path
from typing import Dict, List

from .config import Konfiguracja
from .pliki import pobierz_do_pliku

log = logging.getLogger(__name__)


def url_paczki(cfg: Konfiguracja, teryt: str) -> str:
    """Adres paczki GML dla powiatu; {woj} to dwa pierwsze znaki kodu TERYT."""
    return cfg.paczki.url_szablon.format(woj=teryt[:2], teryt=teryt)


def sciezka_paczki(katalog: Path, teryt: str) -> Path:
    """Sciezka lokalnej paczki dla powiatu (<katalog>/<TERYT>.zip)."""
    return katalog / f"{teryt}.zip"


def pobierz_paczki(cfg: Konfiguracja, powiaty: List[Dict], katalog: Path, *, wymus: bool = False) -> List[Path]:
    """Pobiera paczki GML dla listy powiatow do katalogu.

    Istniejace, poprawne archiwa ZIP sa pomijane (chyba ze wymus=True).
    Adres pochodzi z szablonu w konfiguracji; jesli indeks WFS podaje inny
    adres, jest to logowane jako ostrzezenie. Zwraca sciezki wszystkich
    paczek (pobranych i pominietych). Bledy pobierania sa zbierane i
    zglaszane po przejsciu calej listy.
    """
    katalog.mkdir(parents=True, exist_ok=True)
    wynik: List[Path] = []
    bledy: List[str] = []
    for p in powiaty:
        teryt = str(p["teryt"])
        cel = sciezka_paczki(katalog, teryt)
        url = url_paczki(cfg, teryt)
        if p.get("url") and p["url"] != url:
            log.warning("%s: adres z WFS (%s) rozni sie od szablonu (%s)", teryt, p["url"], url)
        if not wymus and cel.exists() and cel.stat().st_size > 0 and zipfile.is_zipfile(cel):
            log.info("%s: paczka juz istnieje (%.1f MB), pomijam", teryt, cel.stat().st_size / 2**20)
            wynik.append(cel)
            continue
        log.info("%s: pobieram %s", teryt, url)
        try:
            pobierz_do_pliku(url, cel, timeout_s=cfg.paczki.timeout_s,
                             proby=cfg.paczki.proby, odstep_s=cfg.paczki.odstep_s)
        except RuntimeError as e:
            bledy.append(f"{teryt}: {e}")
            continue
        if not zipfile.is_zipfile(cel):
            cel.unlink()
            bledy.append(f"{teryt}: pobrany plik nie jest archiwum ZIP")
            continue
        log.info("%s: pobrano %.1f MB", teryt, cel.stat().st_size / 2**20)
        wynik.append(cel)
    if bledy:
        raise RuntimeError("nie pobrano wszystkich paczek:\n  " + "\n  ".join(bledy))
    return wynik
