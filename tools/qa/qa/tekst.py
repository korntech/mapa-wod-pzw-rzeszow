"""Normalizacja tekstu, poprawki typowych błędów OCR, parsowanie liczb i miary podobieństwa."""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable

from rapidfuzz import fuzz

_POLSKIE = str.maketrans({"ł": "l", "Ł": "L"})
_INTERPUNKCJA = re.compile(r"[^0-9a-z\s]+")
_BIALE = re.compile(r"\s+")


def bez_diakrytykow(tekst: str) -> str:
    """Usuwa znaki diakrytyczne (w tym ł/Ł, których NFKD nie rozkłada)."""
    tekst = tekst.translate(_POLSKIE)
    rozlozony = unicodedata.normalize("NFKD", tekst)
    return "".join(ch for ch in rozlozony if not unicodedata.combining(ch))


def normalizuj(tekst: str | None) -> str:
    """Postać kanoniczna do porównań: małe litery, bez diakrytyków i interpunkcji, pojedyncze spacje."""
    if not tekst:
        return ""
    t = bez_diakrytykow(tekst).lower()
    t = _INTERPUNKCJA.sub(" ", t)
    return _BIALE.sub(" ", t).strip()


def klucz(tekst: str | None, stopwords: Iterable[str] = (), aliasy: dict[str, str] | None = None) -> str:
    """Klucz dopasowania nazwy: postać znormalizowana bez słów pomijanych, z zastosowanymi aliasami."""
    n = normalizuj(tekst)
    if aliasy:
        n = aliasy.get(n, n)
    stop = set(stopwords)
    slowa = [s for s in n.split() if s not in stop]
    wynik = " ".join(slowa)
    if aliasy:
        wynik = aliasy.get(wynik, wynik)
    return wynik


def popraw_ocr(tekst: str, poprawki: list[list[str]]) -> str:
    """Stosuje listę poprawek [wzorzec, zamiennik] z konfiguracji do surowego tekstu OCR."""
    for wzorzec, zamiennik in poprawki:
        tekst = re.sub(wzorzec, zamiennik, tekst)
    return tekst


_LICZBA = re.compile(r"(\d+)(?:[,.](\d+))?")


def parsuj_ha(tekst: str | None, bez_separatora_dwa_miejsca: bool = True) -> float | None:
    """Parsuje powierzchnię w ha z tekstu OCR („48,10”, „48.10”, „810” → 8,10 gdy brak separatora)."""
    if not tekst:
        return None
    t = tekst.replace(" ", "").replace("O", "0").replace("o", "0")
    m = _LICZBA.search(t)
    if not m:
        return None
    calkowita, ulamek = m.group(1), m.group(2)
    if ulamek is None:
        if bez_separatora_dwa_miejsca and len(calkowita) >= 3:
            return float(f"{calkowita[:-2]}.{calkowita[-2:]}")
        return float(calkowita)
    return float(f"{calkowita}.{ulamek}")


def format_ha(wartosc: float | None) -> str:
    """Formatuje powierzchnię w zapisie polskim (przecinek dziesiętny)."""
    if wartosc is None:
        return "—"
    return f"{wartosc:.2f}".replace(".", ",")


def podobienstwo(a: str | None, b: str | None) -> int:
    """Podobieństwo dwóch tekstów (0–100) na postaci znormalizowanej; odporne na kolejność słów."""
    na, nb = normalizuj(a), normalizuj(b)
    if not na and not nb:
        return 100
    if not na or not nb:
        return 0
    return int(round(fuzz.token_set_ratio(na, nb)))


_RZYMSKIE = re.compile(r"^(\d+|i{2,3}|iv|vi{0,3}|v|ix|x)$")


def numeraly(klucz_: str) -> frozenset[str]:
    """Tokeny liczbowe nazwy (cyfry, liczby rzymskie); „i” liczy się jako numer, gdy kończy nazwę lub poprzedza numer."""
    tokeny = klucz_.split()
    wynik: set[str] = set()
    for i, t in enumerate(tokeny):
        if _RZYMSKIE.match(t):
            wynik.add(t)
        elif t == "i" and (i == len(tokeny) - 1 or _RZYMSKIE.match(tokeny[i + 1]) or tokeny[i + 1] == "i"):
            wynik.add(t)
    return frozenset(wynik)


def podobienstwo_nazw(a: str, b: str, kara_numeracji: int = 60) -> int:
    """Podobieństwo kluczy nazw (0–100): odporne na przestawienia i dodatkowe słowa (np. lokalizację w nawiasie),
    ale nazwy różniące się numeracją (Staw 3 vs Stawy 1 i 2, Mrowla III vs IV) są ograniczane do `kara_numeracji`."""
    if not a or not b:
        return 0
    wynik = int(round(max(fuzz.ratio(a, b), fuzz.token_sort_ratio(a, b), fuzz.token_set_ratio(a, b))))
    if numeraly(a) != numeraly(b):
        return min(wynik, kara_numeracji)
    return wynik


def polacz_wiersze(wiersze: list[str], poczatek_punktu: str, koniec_punktu: str | None = None) -> list[str]:
    """Łączy zawinięte wiersze OCR w punkty.

    Nowy punkt zaczyna się od myślnika, gwiazdki lub numeru (`poczatek_punktu`), a także wtedy,
    gdy poprzedni wiersz kończy się zdaniem lub nagłówkiem (`koniec_punktu`, np. kropka poza skrótami,
    dwukropek, nawias) — dzięki temu śródtytuły w rodzaju „Staw nr 2” nie sklejają się z poprzednim punktem.
    """
    wzorzec = re.compile(poczatek_punktu)
    koniec = re.compile(koniec_punktu, re.IGNORECASE) if koniec_punktu else None
    punkty: list[str] = []
    for w in wiersze:
        w = w.strip()
        if not w:
            continue
        nowy = wzorzec.match(w) is not None or not punkty or (koniec is not None and koniec.search(punkty[-1]) is not None)
        if nowy:
            punkty.append(wzorzec.sub("", w).strip())
        else:
            punkty[-1] = f"{punkty[-1]} {w}"
    return [p for p in punkty if p]
