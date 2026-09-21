"""Etap OCR: PDF → strony PNG → siatka tabeli (linie) → komórki → tekst komórek (JSON)."""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytesseract

from .konfiguracja import Konfiguracja

log = logging.getLogger(__name__)


@dataclass
class Komorka:
    """Prostokątna komórka tabeli z tekstem OCR (współrzędne w pikselach strony)."""

    id: int
    x0: int
    y0: int
    x1: int
    y1: int
    tekst: str = ""
    tekst_liczbowy: str | None = None
    skladnik: int = 0
    pasma: list[list[int]] = field(default_factory=list)

    @property
    def szerokosc(self) -> int:
        return self.x1 - self.x0

    @property
    def wysokosc(self) -> int:
        return self.y1 - self.y0


@dataclass
class Strona:
    """Wynik OCR jednej strony: komórki, separatory pełnej szerokości i tekst tła (tytuły)."""

    nr: int
    plik: str
    szer: int
    wys: int
    tabela: list[int] = field(default_factory=list)
    separatory: list[int] = field(default_factory=list)
    tlo: str = ""
    komorki: list[Komorka] = field(default_factory=list)


def rasteryzuj(pdf: Path, katalog: Path, dpi: int) -> list[Path]:
    """Renderuje strony PDF do PNG poleceniem `pdftoppm`; zwraca posortowaną listę plików."""
    katalog.mkdir(parents=True, exist_ok=True)
    prefiks = katalog / "str"
    log.info("Rasteryzacja %s → %s (%d dpi)", pdf, katalog, dpi)
    subprocess.run(
        ["pdftoppm", "-r", str(dpi), "-png", str(pdf), str(prefiks)],
        check=True,
        capture_output=True,
    )
    strony = sorted(katalog.glob("str-*.png"))
    if not strony:
        raise RuntimeError(f"pdftoppm nie utworzył żadnych stron w {katalog}")
    return strony


def maska_siatki(szary: np.ndarray, cfg: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """Wykrywa linie siatki morfologią (otwarcie jądrem poziomym i pionowym). Zwraca (siatka, linie poziome)."""
    _, binarny = cv2.threshold(szary, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    h, w = szary.shape
    dlugosc = max(20, int(w * cfg["dlugosc_linii_ulamek"]))
    poziome = cv2.morphologyEx(binarny, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (dlugosc, 1)))
    pionowe = cv2.morphologyEx(binarny, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, dlugosc)))
    siatka = cv2.dilate(poziome | pionowe, np.ones((3, 3), np.uint8))
    return siatka, poziome


def _pasma(etykiety: np.ndarray, indeks: int, x: int, y: int, w: int, h: int, cfg: dict[str, Any]) -> list[tuple[int, int, int, int]]:
    """Rozkłada składową (np. komórkę w kształcie L) na prostokąty: pasma wierszy o stałym zasięgu x."""
    wycinek = etykiety[y : y + h, x : x + w] == indeks
    tol = cfg["tolerancja_pasma_px"]
    min_h = cfg["min_wysokosc_pasma_px"]
    pasma: list[list[int]] = []
    for wiersz in range(h):
        kol = np.flatnonzero(wycinek[wiersz])
        if kol.size == 0:
            continue
        x0, x1 = int(kol[0]) + x, int(kol[-1]) + x + 1
        if pasma and abs(pasma[-1][0] - x0) <= tol and abs(pasma[-1][1] - x1) <= tol:
            pasma[-1][3] = wiersz + y + 1
        else:
            pasma.append([x0, x1, wiersz + y, wiersz + y + 1])
    wynik = [(p[0], p[2], p[1], p[3]) for p in pasma if p[3] - p[2] >= min_h]
    return wynik or [(x, y, x + w, y + h)]


def _przygotuj(szary: np.ndarray, skala: int) -> np.ndarray:
    """Powiększa wycinek i dodaje biały margines, co poprawia rozpoznawanie drobnego druku."""
    if skala > 1:
        szary = cv2.resize(szary, None, fx=skala, fy=skala, interpolation=cv2.INTER_CUBIC)
    return cv2.copyMakeBorder(szary, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=255)


def _ocr(obraz: np.ndarray, jezyk: str, psm: int, dodatkowe: str = "") -> str:
    """Uruchamia tesseract na wycinku z podanym trybem segmentacji."""
    konfig = f"--psm {psm} {dodatkowe}".strip()
    return pytesseract.image_to_string(obraz, lang=jezyk, config=konfig).strip()


def ocr_komorki(szary: np.ndarray, komorka: Komorka, cfg: dict[str, Any], maska: np.ndarray | None = None) -> None:
    """Rozpoznaje tekst pojedynczej komórki (psm 7 dla niskich, psm 6 dla wielowierszowych).

    Dla komórki w kształcie L (`maska` = piksele składowej) wycinek obejmuje cały obrys,
    a piksele spoza składowej są wybielane, dzięki czemu tekst przechodzący między pasmami
    (nazwa i nagłówek zasad) rozpoznawany jest w jednym bloku.
    """
    m = cfg["margines_komorki_px"]
    wycinek = szary[komorka.y0 + m : komorka.y1 - m, komorka.x0 + m : komorka.x1 - m]
    if wycinek.size == 0:
        return
    if maska is not None:
        wycinek = wycinek.copy()
        maska_w = maska[komorka.y0 + m : komorka.y1 - m, komorka.x0 + m : komorka.x1 - m]
        maska_w = cv2.erode(maska_w.astype(np.uint8), np.ones((2 * m + 1, 2 * m + 1), np.uint8))
        wycinek[maska_w == 0] = 255
    if (wycinek < 128).sum() < 10:
        return
    obraz = _przygotuj(wycinek, cfg["skala"])
    jednowierszowa = komorka.wysokosc < cfg["wysokosc_jednowierszowa_px"]
    psm = cfg["psm_jednowierszowy"] if jednowierszowa else cfg["psm_wielowierszowy"]
    komorka.tekst = _ocr(obraz, cfg["jezyk"], psm)
    if jednowierszowa and komorka.szerokosc < cfg.get("max_szerokosc_liczby_px", 160):
        komorka.tekst_liczbowy = _ocr(
            obraz, cfg["jezyk"], cfg["psm_liczba"], "-c tessedit_char_whitelist=0123456789,."
        )


def ocr_tlo(szary: np.ndarray, etykiety: np.ndarray, indeks: int, cfg: dict[str, Any]) -> str:
    """Rozpoznaje tekst poza tabelą (tytuły) — piksele innych składowych są wybielane."""
    obraz = szary.copy()
    obraz[etykiety != indeks] = 255
    return _ocr(obraz, cfg["jezyk"], cfg["tlo_psm"])


def separatory_pelnej_szerokosci(poziome: np.ndarray, tabela: tuple[int, int, int, int], ulamek: float) -> list[int]:
    """Współrzędne y linii poziomych obejmujących (niemal) całą szerokość tabeli — granice rekordów."""
    x0, y0, x1, y1 = tabela
    if x1 <= x0 or y1 <= y0:
        return []
    pokrycie = (poziome[y0:y1, x0:x1] > 0).sum(axis=1) / float(x1 - x0)
    wiersze = np.flatnonzero(pokrycie >= ulamek) + y0
    wynik: list[int] = []
    for y in wiersze:
        if not wynik or y - wynik[-1] > 3:
            wynik.append(int(y))
    return wynik


def przetworz_strone(plik: Path, nr: int, cfg: dict[str, Any]) -> Strona:
    """Pełne przetwarzanie strony: siatka → składowe → prostokąty → OCR."""
    szary = cv2.imread(str(plik), cv2.IMREAD_GRAYSCALE)
    if szary is None:
        raise RuntimeError(f"Nie można wczytać obrazu {plik}")
    wys, szer = szary.shape
    siatka, poziome = maska_siatki(szary, cfg)
    n, etykiety, staty, _ = cv2.connectedComponentsWithStats(255 - siatka, connectivity=4)

    kandydaci = [
        (i, tuple(int(v) for v in staty[i][:4]))
        for i in range(1, n)
        if staty[i][cv2.CC_STAT_AREA] >= cfg["min_pole_komorki_px"]
    ]
    strona = Strona(nr=nr, plik=plik.name, szer=szer, wys=wys)

    # Składowa jest komórką, gdy każde jej pasmo jest niemal pełnym prostokątem (komórka prosta lub w kształcie L);
    # w przeciwnym razie (pierścień wokół tabeli, tło strony) traktowana jest jako tło z tytułami.
    komorki: list[Komorka] = []
    tlo_indeksy: set[int] = set()
    for i, (x, y, w, h) in kandydaci:
        pasma = _pasma(etykiety, i, x, y, w, h, cfg)
        wypelnienia = [float((etykiety[y0:y1, x0:x1] == i).mean()) for x0, y0, x1, y1 in pasma]
        if min(wypelnienia) < cfg["min_wypelnienie_pasma"]:
            tlo_indeksy.add(i)
            continue
        if len(pasma) == 1:
            x0, y0, x1, y1 = pasma[0]
            komorki.append(Komorka(id=len(komorki), x0=x0, y0=y0, x1=x1, y1=y1, skladnik=i))
        else:
            komorki.append(
                Komorka(id=len(komorki), x0=x, y0=y, x1=x + w, y1=y + h, skladnik=i, pasma=[list(p) for p in pasma])
            )
    komorki.sort(key=lambda k: (k.y0, k.x0))
    for idx, k in enumerate(komorki):
        k.id = idx
        ocr_komorki(szary, k, cfg, maska=(etykiety == k.skladnik) if k.pasma else None)
    strona.komorki = komorki

    if komorki:
        tabela = (min(k.x0 for k in komorki), min(k.y0 for k in komorki), max(k.x1 for k in komorki), max(k.y1 for k in komorki))
        strona.tabela = list(tabela)
        strona.separatory = separatory_pelnej_szerokosci(poziome, tabela, cfg["pelna_szerokosc_ulamek"])

    for i in tlo_indeksy:
        strona.tlo = (strona.tlo + "\n" + ocr_tlo(szary, etykiety, i, cfg)).strip()
    log.info("Strona %02d: %d komórek, %d separatorów", nr, len(komorki), len(strona.separatory))
    return strona


def uruchom(konf: Konfiguracja, pdf: Path, wyjscie: Path) -> Path:
    """Wykonuje etap OCR dla całego PDF i zapisuje `komorki.json` w katalogu wyjściowym."""
    cfg = konf.ocr
    katalog_stron = wyjscie / konf.nazwa_pliku("strony")
    strony = rasteryzuj(pdf, katalog_stron, cfg["dpi"])
    wyniki = [przetworz_strone(p, nr, cfg) for nr, p in enumerate(strony, start=1)]
    plik = wyjscie / konf.nazwa_pliku("komorki")
    dane = {"dpi": cfg["dpi"], "jezyk": cfg["jezyk"], "strony": [asdict(s) for s in wyniki]}
    plik.write_text(json.dumps(dane, ensure_ascii=False, indent=1), encoding="utf-8")
    log.info("Zapisano %s", plik)
    return plik
