"""Interfejs wiersza poleceń: `python -m qa {pobierz,ocr,parsuj,porownaj,all}`."""

from __future__ import annotations

import argparse
import logging
import sys
import urllib.request
from pathlib import Path

from . import konfiguracja, ocr, parsuj, porownaj

log = logging.getLogger("qa")


def _pobierz(konf: konfiguracja.Konfiguracja, cel: Path) -> Path:
    """Pobiera PDF wykazu z adresu w konfiguracji do podanej ścieżki."""
    url = konf.zrodlo["url"]
    cel.parent.mkdir(parents=True, exist_ok=True)
    log.info("Pobieranie %s → %s", url, cel)
    with urllib.request.urlopen(url, timeout=60) as odp, cel.open("wb") as f:
        f.write(odp.read())
    return cel


def zbuduj_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="qa", description="QA harness: wykaz wód PZW (PDF) vs data.json")
    p.add_argument("--config", help="plik konfiguracji (domyślnie config.json obok pakietu)")
    p.add_argument("--wyjscie", help="katalog wyników (domyślnie z konfiguracji)")
    p.add_argument("-v", "--verbose", action="store_true", help="szczegółowe logowanie")
    sub = p.add_subparsers(dest="polecenie", required=True)

    s = sub.add_parser("pobierz", help="pobierz PDF wykazu z adresu w konfiguracji")
    s.add_argument("--pdf", help="ścieżka docelowa PDF")

    s = sub.add_parser("ocr", help="PDF → strony → komórki tabel → komorki.json")
    s.add_argument("--pdf", help="ścieżka do PDF wykazu")

    s = sub.add_parser("parsuj", help="komorki.json → rekordy.json")
    s.add_argument("--komorki", help="plik komórek (domyślnie w katalogu wyników)")

    s = sub.add_parser("porownaj", help="rekordy.json vs data.json → raport.md / raport.json")
    s.add_argument("--rekordy", help="plik rekordów (domyślnie w katalogu wyników)")
    s.add_argument("--dane", help="ścieżka do data.json")

    s = sub.add_parser("all", help="ocr + parsuj + porownaj")
    s.add_argument("--pdf", help="ścieżka do PDF wykazu")
    s.add_argument("--dane", help="ścieżka do data.json")
    return p


def main(argv: list[str] | None = None) -> int:
    args = zbuduj_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    konf = konfiguracja.wczytaj(args.config)
    wyjscie = konf.sciezka("wyjscie", args.wyjscie)
    wyjscie.mkdir(parents=True, exist_ok=True)

    if args.polecenie == "pobierz":
        _pobierz(konf, konf.sciezka("pdf", args.pdf))
        return 0

    kod = 0
    if args.polecenie in ("ocr", "all"):
        pdf = konf.sciezka("pdf", args.pdf)
        if not pdf.is_file():
            log.error("Brak pliku PDF: %s (podaj --pdf lub użyj polecenia pobierz)", pdf)
            return 2
        ocr.uruchom(konf, pdf, wyjscie)
    if args.polecenie in ("parsuj", "all"):
        komorki = Path(getattr(args, "komorki", None) or wyjscie / konf.nazwa_pliku("komorki"))
        parsuj.uruchom(konf, komorki, wyjscie)
    if args.polecenie in ("porownaj", "all"):
        rekordy = Path(getattr(args, "rekordy", None) or wyjscie / konf.nazwa_pliku("rekordy"))
        dane = konf.sciezka("dane", args.dane)
        if not dane.is_file():
            log.error("Brak pliku danych: %s", dane)
            return 2
        kod = porownaj.uruchom(konf, rekordy, dane, wyjscie)
    return kod


if __name__ == "__main__":
    sys.exit(main())
