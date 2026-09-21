"""Odczyt i zapis plikow JSON oraz pobieranie HTTP z ponawianiem."""

from __future__ import annotations

import json
import logging
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)


def wczytaj_json(sciezka: Path) -> Any:
    """Wczytuje plik JSON (UTF-8)."""
    with open(sciezka, encoding="utf-8") as fh:
        return json.load(fh)


def zapisz_json(sciezka: Path, dane: Any, *, zwarty: bool = False, wciecie: Optional[int] = 1) -> None:
    """Zapisuje dane jako JSON (UTF-8, bez escapowania znakow narodowych).

    `zwarty=True` daje minimalny zapis bez spacji (dla plikow serwowanych
    przez aplikacje), w przeciwnym razie uzywane jest wciecie `wciecie`.
    Zapis odbywa sie przez plik tymczasowy, aby przerwanie nie zostawilo
    uszkodzonego pliku docelowego.
    """
    sciezka = Path(sciezka)
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    tmp = sciezka.with_suffix(sciezka.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        if zwarty:
            json.dump(dane, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(dane, fh, ensure_ascii=False, indent=wciecie)
    tmp.replace(sciezka)
    log.debug("zapisano %s (%.1f KB)", sciezka, sciezka.stat().st_size / 1024)


def pobierz_do_pliku(url: str, cel: Path, *, timeout_s: float, proby: int, odstep_s: float) -> None:
    """Pobiera zasob HTTP(S) do pliku `cel` z ponawianiem.

    Dane trafiaja najpierw do pliku tymczasowego `<cel>.part`, ktory po
    pomyslnym zakonczeniu jest przemianowany na `cel`. Po nieudanej probie
    (blad sieci, HTTP >= 400, przerwany transfer) nastepuje odczekanie
    `odstep_s` sekund; po wyczerpaniu `proby` prob zglaszany jest wyjatek.
    """
    cel = Path(cel)
    cel.parent.mkdir(parents=True, exist_ok=True)
    czesciowy = cel.with_name(cel.name + ".part")
    ostatni: Optional[BaseException] = None
    for proba in range(1, proby + 1):
        try:
            zad = urllib.request.Request(url, headers={"User-Agent": "bdot10k-pipeline/1.0"})
            with urllib.request.urlopen(zad, timeout=timeout_s) as odp, open(czesciowy, "wb") as fh:
                shutil.copyfileobj(odp, fh, length=1 << 20)
            czesciowy.replace(cel)
            return
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            ostatni = e
            log.warning("proba %d/%d nieudana dla %s: %s", proba, proby, url, e)
            if czesciowy.exists():
                czesciowy.unlink()
            if proba < proby:
                time.sleep(odstep_s)
    raise RuntimeError(f"nie udalo sie pobrac {url}") from ostatni


def pobierz_tekst(url: str, *, timeout_s: float, proby: int, odstep_s: float) -> str:
    """Pobiera zasob HTTP(S) i zwraca go jako tekst UTF-8 (z ponawianiem jak pobierz_do_pliku)."""
    ostatni: Optional[BaseException] = None
    for proba in range(1, proby + 1):
        try:
            zad = urllib.request.Request(url, headers={"User-Agent": "bdot10k-pipeline/1.0"})
            with urllib.request.urlopen(zad, timeout=timeout_s) as odp:
                return odp.read().decode("utf-8", "replace")
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            ostatni = e
            log.warning("proba %d/%d nieudana dla %s: %s", proba, proby, url, e)
            if proba < proby:
                time.sleep(odstep_s)
    raise RuntimeError(f"nie udalo sie pobrac {url}") from ostatni
