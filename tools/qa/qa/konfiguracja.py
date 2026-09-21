"""Wczytywanie pliku `config.json` i rozwiązywanie ścieżek domyślnych."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

DOMYSLNY_PLIK = "config.json"


@dataclass(frozen=True)
class Konfiguracja:
    """Konfiguracja harnessu wraz z katalogiem, względem którego rozwiązywane są ścieżki."""

    dane: dict[str, Any]
    katalog: Path

    @property
    def ocr(self) -> dict[str, Any]:
        return self.dane["ocr"]

    @property
    def parser(self) -> dict[str, Any]:
        return self.dane["parser"]

    @property
    def porownanie(self) -> dict[str, Any]:
        return self.dane["porownanie"]

    @property
    def zrodlo(self) -> dict[str, Any]:
        return self.dane["zrodlo"]

    def sciezka(self, klucz: str, nadpisanie: str | Path | None = None) -> Path:
        """Zwraca ścieżkę z sekcji `sciezki` (lub nadpisaną z linii poleceń) jako ścieżkę bezwzględną."""
        wartosc = Path(nadpisanie) if nadpisanie else Path(self.dane["sciezki"][klucz])
        if not wartosc.is_absolute():
            wartosc = self.katalog / wartosc
        return wartosc.resolve()

    def nazwa_pliku(self, klucz: str) -> str:
        """Zwraca nazwę pliku pomocniczego z sekcji `sciezki` (bez rozwiązywania względem katalogu)."""
        return str(self.dane["sciezki"][klucz])


def wczytaj(plik: str | Path | None = None) -> Konfiguracja:
    """Wczytuje konfigurację; domyślnie `config.json` obok pakietu."""
    sciezka = Path(plik) if plik else Path(__file__).resolve().parent.parent / DOMYSLNY_PLIK
    sciezka = sciezka.resolve()
    log.debug("Konfiguracja: %s", sciezka)
    with sciezka.open(encoding="utf-8") as f:
        dane = json.load(f)
    return Konfiguracja(dane=dane, katalog=sciezka.parent)
