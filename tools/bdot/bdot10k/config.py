"""Wczytywanie i walidacja pliku config.json.

Konfiguracja jest jedynym miejscem, w ktorym znajduja sie adresy URL,
parametry algorytmow i domyslne nazwy plikow posrednich. Kazda sekcja
pliku jest odwzorowana na dataclass, dzieki czemu brak klucza lub zly typ
zglaszany jest przy starcie, a nie w polowie przetwarzania.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple, get_type_hints

log = logging.getLogger(__name__)


class BladKonfiguracji(ValueError):
    """Niepoprawna lub niekompletna konfiguracja."""


@dataclass(frozen=True)
class Wfs:
    url: str
    typeNames: str
    count: int
    timeout_s: float
    proby: int
    odstep_s: float


@dataclass(frozen=True)
class Paczki:
    url_szablon: str
    timeout_s: float
    proby: int
    odstep_s: float


@dataclass(frozen=True)
class Crs:
    zrodlowy: str
    docelowy: str


@dataclass(frozen=True)
class Obszar:
    lat_min: float
    lon_min: float
    lat_max: float
    lon_max: float
    margines_deg: float
    margines_wyboru_deg: float

    def zasieg(self) -> Tuple[float, float, float, float]:
        """Zwraca (lat_min, lat_max, lon_min, lon_max) powiekszone o margines."""
        m = self.margines_deg
        return (
            round(self.lat_min - m, 6),
            round(self.lat_max + m, 6),
            round(self.lon_min - m, 6),
            round(self.lon_max + m, 6),
        )


@dataclass(frozen=True)
class Warstwy:
    poligony_wod: List[str]
    cieki: List[str]


@dataclass(frozen=True)
class Geometria:
    miejsca_dziesietne: int
    miejsca_dziesietne_pinezki: int


@dataclass(frozen=True)
class Rzeki:
    aliasy: Dict[str, List[str]]
    korytarz_m: float
    udzial_min_nazwane: float
    korytarz_nienazwane_m: float
    udzial_min_nienazwane: float
    bbox_margines_deg: float
    join_m: float
    bridge_m: float
    tolerancja_pozycji: float
    rdp_eps_m: float


@dataclass(frozen=True)
class Zbiorniki:
    promien_poszukiwan_m: float
    siatka_deg: float
    klaster_prog_m: float
    klaster_min_ha: float
    poligon_min_ha: float
    waga_powierzchnia: float
    waga_odleglosc: float
    waga_nazwa: float
    sigma_log_powierzchni: float
    tau_odleglosci_m: float
    bonus_liczba_obiektow: float
    kara_ciek: float
    pewne_tolerancja_ha: float
    pewne_odleglosc_m: float
    pewne_min_ocena: float
    pewne_min_przewaga: float
    pewne_max_srednica_m: float
    nazwa_tolerancja_ha: float
    brak_min_ocena: float
    brak_okno_q: List[float]
    brak_ocena: float
    brak_q_min: float
    brak_q_max: float
    wiarygodna_nazwa_min: float
    brak_nazwa_max: float
    limit_kandydatow: Dict[str, int]
    slowa_pomijane: List[str]
    rodzaj_woda_stojaca: str
    slowo_zaporowy: str


@dataclass(frozen=True)
class Meta:
    zrodla: Dict[str, str]
    zrodlo_kandydatow: str
    uwaga: str


@dataclass(frozen=True)
class Sciezki:
    katalog_roboczy: str
    paczki: str
    powiaty: str
    powiaty_wybrane: str
    bdot_poligony: str
    bdot_cieki: str
    bdot_meta: str
    rzeki_geometrie: str
    rzeki_raport: str
    kandydaci: str
    data_wyjsciowy: str
    kandydaci_panel: str


@dataclass(frozen=True)
class Konfiguracja:
    wfs: Wfs
    paczki: Paczki
    crs: Crs
    obszar: Obszar
    warstwy: Warstwy
    geometria: Geometria
    rzeki: Rzeki
    zbiorniki: Zbiorniki
    meta: Meta
    sciezki: Sciezki
    plik: Path = field(default=Path("config.json"), compare=False)


def _zbuduj(klasa: type, dane: Any, sciezka: str) -> Any:
    """Rekurencyjnie tworzy dataclass `klasa` ze slownika `dane`.

    Brakujace klucze i klucze nieznane zglaszane sa jako BladKonfiguracji
    z pelna sciezka w pliku (np. "zbiorniki.kara_ciek").
    """
    if not isinstance(dane, dict):
        raise BladKonfiguracji(f"{sciezka}: oczekiwano obiektu JSON")
    pola = [f.name for f in fields(klasa) if f.name != "plik"]
    typy = get_type_hints(klasa)
    nieznane = set(dane) - set(pola)
    if nieznane:
        raise BladKonfiguracji(f"{sciezka}: nieznane klucze {sorted(nieznane)}")
    wartosci: Dict[str, Any] = {}
    for nazwa in pola:
        if nazwa not in dane:
            raise BladKonfiguracji(f"{sciezka}.{nazwa}: brak klucza")
        w = dane[nazwa]
        typ = typy.get(nazwa)
        if isinstance(typ, type) and is_dataclass(typ):
            w = _zbuduj(typ, w, f"{sciezka}.{nazwa}")
        wartosci[nazwa] = w
    return klasa(**wartosci)


def wczytaj_konfiguracje(sciezka: Path) -> Konfiguracja:
    """Wczytuje config.json i zwraca zweryfikowana Konfiguracje.

    Wejscie: sciezka do pliku JSON.
    Wyjscie: Konfiguracja z polem `plik` ustawionym na sciezke bezwzgledna.
    """
    sciezka = Path(sciezka).resolve()
    with open(sciezka, encoding="utf-8") as fh:
        dane = json.load(fh)
    sekcje = {
        "wfs": Wfs, "paczki": Paczki, "crs": Crs, "obszar": Obszar,
        "warstwy": Warstwy, "geometria": Geometria, "rzeki": Rzeki,
        "zbiorniki": Zbiorniki, "meta": Meta, "sciezki": Sciezki,
    }
    nieznane = set(dane) - set(sekcje)
    if nieznane:
        raise BladKonfiguracji(f"nieznane sekcje {sorted(nieznane)}")
    zbudowane = {}
    for nazwa, klasa in sekcje.items():
        if nazwa not in dane:
            raise BladKonfiguracji(f"brak sekcji '{nazwa}'")
        zbudowane[nazwa] = _zbuduj(klasa, dane[nazwa], nazwa)
    log.debug("wczytano konfiguracje z %s", sciezka)
    return Konfiguracja(plik=sciezka, **zbudowane)
