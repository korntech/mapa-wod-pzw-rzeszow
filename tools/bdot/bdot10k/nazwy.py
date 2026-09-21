"""Normalizacja i porownywanie nazw wod z wykazu PZW i z BDOT10k."""

from __future__ import annotations

import re
import unicodedata
from typing import Dict, Iterable, List, Optional, Set

_RE_OBWOD = re.compile(r"\s*—\s*obw[óo]d.*$")
_RE_BIEG = re.compile(r"\s*—\s*(dolny|dolna|g[óo]rny|g[óo]rna).*$")
_RE_OBWOD_NAWIAS = re.compile(r"\s*\(obw[óo]d[^)]*\)")
_RE_NAWIAS = re.compile(r"\(([^)]+)\)")
_RE_NAWIAS_CALY = re.compile(r"\s*\([^)]*\)")
_RE_MYSLNIK = re.compile(r"\s*—.*$")
_RE_NUMER = re.compile(r"\s+\d+$")
_RE_LICZBA_NA_POCZATKU = re.compile(r"^\s*(\d+)\s")


def normalizuj(s: Optional[str]) -> str:
    """Sprowadza nazwe do postaci porownywalnej.

    Male litery, usuniete znaki diakrytyczne (NFKD), 'ł' -> 'l', wszystkie
    znaki poza [a-z0-9 ] zamienione na spacje, przyciete biale znaki.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", " ", s.replace("ł", "l")).strip()


def nazwy_bazowe(nazwa: str, aliasy: Dict[str, List[str]]) -> Set[str]:
    """Zbior znormalizowanych nazw BDOT, pod ktorymi szukac rzeki z wykazu.

    Z nazwy wykazu usuwane sa dopiski obwodu ("— obwod Wislok 3"), biegu
    ("— dolny"), nawiasy i koncowy numer. Tresc nawiasu (o ile nie opisuje
    krainy rybackiej) jest dodawana jako nazwa alternatywna, np.
    "Ruda (Mlynowka)" -> {"ruda", "mlynowka"}. Dla nazw "potok X" dodawane
    jest samo "x". Na koncu dolaczane sa aliasy z konfiguracji.
    """
    n = _RE_OBWOD.sub("", nazwa)
    n = _RE_BIEG.sub("", n)
    n = _RE_OBWOD_NAWIAS.sub("", n)
    alt: Set[str] = set()
    m = _RE_NAWIAS.search(n)
    if m and "krain" not in m.group(1).lower():
        alt.add(normalizuj(m.group(1)))
    n = _RE_NAWIAS_CALY.sub("", n)
    n = _RE_MYSLNIK.sub("", n)
    n = _RE_NUMER.sub("", n).strip()
    baza = normalizuj(n)
    alt.add(baza)
    if baza.startswith("potok "):
        alt.add(baza[6:])
    for klucz, warianty in aliasy.items():
        if klucz in alt:
            alt.update(warianty)
    return {a for a in alt if a}


def tokeny(s: Optional[str], pomijane: Iterable[str]) -> Set[str]:
    """Znaczace slowa nazwy: dluzsze niz 2 znaki i spoza listy slow pomijanych."""
    stop = set(pomijane)
    return {t for t in normalizuj(s).split() if len(t) > 2 and t not in stop}


def liczba_obiektow(opis: Optional[str]) -> int:
    """Liczba obiektow deklarowana w opisie typu ("5 wyrobisk pozwirowych" -> 5), domyslnie 1."""
    m = _RE_LICZBA_NA_POCZATKU.match(opis or "")
    return int(m.group(1)) if m else 1


def parsuj_ha(s: Optional[str]) -> Optional[float]:
    """Powierzchnia z tekstu wykazu ("29,94" -> 29.94); None gdy brak lub nieliczbowa."""
    if not s:
        return None
    try:
        return float(str(s).replace(",", ".").strip())
    except ValueError:
        return None
