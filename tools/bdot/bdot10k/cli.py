"""Interfejs wiersza polecen: `python -m bdot10k <krok> [opcje]`.

Kroki (w kolejnosci potoku): powiaty, wybierz, pobierz, parsuj, zszyj,
zbiorniki, zloz; `all` uruchamia kolejne kroki od `--od` do `--do`.
Wspolne opcje: --config, --work (katalog roboczy), --log-level. Sciezki
plikow posrednich maja wartosci domyslne z sekcji `sciezki` konfiguracji
(wzgledem katalogu roboczego) i moga byc nadpisane opcjami kroku.
"""

from __future__ import annotations

import argparse
import datetime
import logging
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional

from . import parsuj, pobierz, powiaty, wybierz, zbiorniki, zloz, zszyj
from .config import Konfiguracja, wczytaj_konfiguracje
from .pliki import wczytaj_json, zapisz_json

log = logging.getLogger("bdot10k")

KROKI: List[str] = ["powiaty", "wybierz", "pobierz", "parsuj", "zszyj", "zbiorniki", "zloz"]
DOMYSLNY_CONFIG = Path(__file__).resolve().parent.parent / "config.json"


class Srodowisko:
    """Konfiguracja, katalog roboczy i rozwiazywanie sciezek plikow posrednich."""

    def __init__(self, cfg: Konfiguracja, work: Path) -> None:
        self.cfg = cfg
        self.work = work

    def sciezka(self, nadpisanie: Optional[str], klucz: str) -> Path:
        """Sciezka podana w opcji albo domyslna z konfiguracji wzgledem katalogu roboczego."""
        if nadpisanie:
            return Path(nadpisanie)
        return self.work / getattr(self.cfg.sciezki, klucz)


def _dzis() -> str:
    return datetime.date.today().isoformat()


def krok_powiaty(env: Srodowisko, a: argparse.Namespace) -> None:
    """Pobiera indeks powiatow z WFS i zapisuje powiaty w zasiegu Okregu."""
    plik_wfs = Path(a.wfs_plik) if a.wfs_plik else env.work / "wfs_powiaty.xml"
    powiaty.pobierz_indeks(env.cfg, plik_wfs, wymus=a.wymus)
    lista = powiaty.powiaty_w_zasiegu(env.cfg, plik_wfs)
    for r in lista:
        log.info("  %s  %-32s akt.%s  %s", r["teryt"], r["nazwa"], r["akt"], r["bbox"])
    zapisz_json(env.sciezka(a.wyjscie, "powiaty"), lista)


def krok_wybierz(env: Srodowisko, a: argparse.Namespace) -> None:
    """Zaweza liste powiatow do tych, w ktorych leza obiekty z data.json."""
    lista = wczytaj_json(env.sciezka(a.powiaty, "powiaty"))
    data = wczytaj_json(Path(a.data))
    zapisz_json(env.sciezka(a.wyjscie, "powiaty_wybrane"), wybierz.wybierz_powiaty(env.cfg, lista, data))


def krok_pobierz(env: Srodowisko, a: argparse.Namespace) -> None:
    """Pobiera paczki GML wybranych powiatow."""
    lista = wczytaj_json(env.sciezka(a.powiaty_wybrane, "powiaty_wybrane"))
    pobierz.pobierz_paczki(env.cfg, lista, env.sciezka(a.paczki, "paczki"), wymus=a.wymus)


def krok_parsuj(env: Srodowisko, a: argparse.Namespace) -> None:
    """Parsuje warstwy GML z paczek do bdot_ptwp.json, bdot_cieki.json i bdot_meta.json."""
    katalog = env.sciezka(a.paczki, "paczki")
    plik = env.sciezka(a.powiaty_wybrane, "powiaty_wybrane")
    if not a.wszystkie and plik.exists():
        lista = wczytaj_json(plik)
        paczki = [pobierz.sciezka_paczki(katalog, str(p["teryt"])) for p in lista]
    else:
        log.info("parsuje wszystkie paczki *.zip z %s", katalog)
        paczki = sorted(katalog.glob("*.zip"))
    if not paczki:
        raise FileNotFoundError(f"brak paczek ZIP w {katalog}")
    brak = [p for p in paczki if not p.exists()]
    if brak:
        raise FileNotFoundError("brak paczek: " + ", ".join(str(p) for p in brak))
    poligony, cieki, meta = parsuj.parsuj_paczki(env.cfg, paczki)
    zapisz_json(env.sciezka(a.poligony, "bdot_poligony"), poligony, wciecie=None)
    zapisz_json(env.sciezka(a.cieki, "bdot_cieki"), cieki, wciecie=None)
    zapisz_json(env.sciezka(a.meta, "bdot_meta"), meta)


def krok_zszyj(env: Srodowisko, a: argparse.Namespace) -> None:
    """Buduje geometrie rzek z odcinkow BDOT10k wzdluz istniejacych linii."""
    data = wczytaj_json(Path(a.data))
    cieki = wczytaj_json(env.sciezka(a.cieki, "bdot_cieki"))
    geometrie, raport = zszyj.zszyj_wszystkie(env.cfg, data, cieki)
    zapisz_json(env.sciezka(a.geometrie, "rzeki_geometrie"), geometrie, wciecie=None)
    zapisz_json(env.sciezka(a.raport, "rzeki_raport"), raport)


def krok_zbiorniki(env: Srodowisko, a: argparse.Namespace) -> None:
    """Dopasowuje zbiorniki o przyblizonej lokalizacji do poligonow wod."""
    data = wczytaj_json(Path(a.data))
    poligony = wczytaj_json(env.sciezka(a.poligony, "bdot_poligony"))
    wynik = zbiorniki.dopasuj_wszystkie(env.cfg, data, poligony, a.data_raportu or _dzis())
    zapisz_json(env.sciezka(a.wyjscie, "kandydaci"), wynik)


def krok_zloz(env: Srodowisko, a: argparse.Namespace) -> None:
    """Sklada wynikowy data.json i plik kandydatow dla panelu operatora."""
    stare = wczytaj_json(Path(a.data))
    geometrie = wczytaj_json(env.sciezka(a.geometrie, "rzeki_geometrie"))
    kandydaci = wczytaj_json(env.sciezka(a.kandydaci, "kandydaci"))
    plik_meta = env.sciezka(a.meta, "bdot_meta")
    if a.powiatow_bdot is not None:
        powiatow = a.powiatow_bdot
    elif plik_meta.exists():
        powiatow = int(wczytaj_json(plik_meta)["powiatow"])
    else:
        raise FileNotFoundError(f"brak {plik_meta}; podaj --powiatow-bdot")
    out = zloz.zloz_data(env.cfg, stare, geometrie, kandydaci, a.data_aktualizacji or _dzis(), powiatow)
    zapisz_json(env.sciezka(a.wyjscie, "data_wyjsciowy"), out, zwarty=True)
    zapisz_json(env.sciezka(a.panel, "kandydaci_panel"), zloz.kandydaci_dla_panelu(kandydaci), zwarty=True)


KROK_FUNKCJE: Dict[str, Callable[[Srodowisko, argparse.Namespace], None]] = {
    "powiaty": krok_powiaty, "wybierz": krok_wybierz, "pobierz": krok_pobierz,
    "parsuj": krok_parsuj, "zszyj": krok_zszyj, "zbiorniki": krok_zbiorniki, "zloz": krok_zloz,
}


def _dodaj_wspolne(p: argparse.ArgumentParser) -> None:
    p.add_argument("--config", default=str(DOMYSLNY_CONFIG), help="plik config.json")
    p.add_argument("--work", default=None,
                   help="katalog roboczy (domyslnie sciezki.katalog_roboczy z konfiguracji, wzgledem cwd)")
    p.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])


# Opcje krokow: (krok, opis kroku, [(nazwy, parametry add_argument, dostepna w trybie all)]).
OPCJE = [
    ("powiaty", "indeks powiatow z WFS -> powiaty.json", [
        (("--wfs-plik",), dict(help="zapisana odpowiedz WFS (pomija pobieranie, gdy istnieje)"), True),
        (("--wymus",), dict(action="store_true", help="pobierz ponownie mimo istniejacych plikow"), True),
        (("--wyjscie",), dict(help="plik wynikowy (domyslnie sciezki.powiaty)"), False),
    ]),
    ("wybierz", "powiaty z obiektami z data.json -> powiaty_sel.json", [
        (("--data",), dict(help="wejsciowy data.json"), True),
        (("--powiaty",), dict(help="plik powiaty.json"), False),
        (("--wyjscie",), dict(help="plik wynikowy (domyslnie sciezki.powiaty_wybrane)"), False),
    ]),
    ("pobierz", "pobranie paczek GML wybranych powiatow", [
        (("--powiaty-wybrane",), dict(help="plik powiaty_sel.json"), False),
        (("--paczki",), dict(help="katalog paczek ZIP"), True),
        (("--wymus",), dict(action="store_true", help="pobierz ponownie mimo istniejacych plikow"), True),
    ]),
    ("parsuj", "parsowanie warstw GML -> bdot_ptwp.json, bdot_cieki.json", [
        (("--powiaty-wybrane",), dict(help="plik powiaty_sel.json (lista paczek do parsowania)"), False),
        (("--paczki",), dict(help="katalog paczek ZIP"), True),
        (("--wszystkie",), dict(action="store_true", help="parsuj wszystkie *.zip z katalogu paczek"), True),
        (("--poligony",), dict(help="wyjscie: poligony wod"), False),
        (("--cieki",), dict(help="wyjscie: odcinki ciekow"), False),
        (("--meta",), dict(help="wyjscie: metadane parsowania"), False),
    ]),
    ("zszyj", "zszycie odcinkow rzek -> rzeki_geometrie.json, rzeki_raport.json", [
        (("--data",), dict(help="wejsciowy data.json"), True),
        (("--cieki",), dict(help="plik bdot_cieki.json"), False),
        (("--geometrie",), dict(help="wyjscie: geometrie rzek"), False),
        (("--raport",), dict(help="wyjscie: raport zszywania"), False),
    ]),
    ("zbiorniki", "dopasowanie zbiornikow -> kandydaci_zbiorniki.json", [
        (("--data",), dict(help="wejsciowy data.json"), True),
        (("--poligony",), dict(help="plik bdot_ptwp.json"), False),
        (("--wyjscie",), dict(help="plik wynikowy (domyslnie sciezki.kandydaci)"), False),
        (("--data-raportu",), dict(help="data w meta (domyslnie dzis, ISO 8601)"), True),
    ]),
    ("zloz", "zlozenie data.json i kandydatow dla panelu", [
        (("--data",), dict(help="wejsciowy data.json"), True),
        (("--geometrie",), dict(help="plik rzeki_geometrie.json"), False),
        (("--kandydaci",), dict(help="plik kandydaci_zbiorniki.json"), False),
        (("--meta",), dict(help="plik bdot_meta.json (liczba powiatow)"), False),
        (("--powiatow-bdot",), dict(type=int, help="liczba powiatow do meta (zamiast bdot_meta.json)"), True),
        (("--data-aktualizacji",), dict(help="data aktualizacji geometrii w meta (domyslnie dzis)"), True),
        (("--wyjscie",), dict(help="wyjscie: data.json (domyslnie sciezki.data_wyjsciowy)"), False),
        (("--panel",), dict(help="wyjscie: kandydaci dla panelu"), False),
    ]),
]
KROKI_Z_DATA = {krok for krok, _, opcje in OPCJE if any(n[0] == "--data" for n, _, _ in opcje)}


def _dodaj_podparsery(sub: argparse._SubParsersAction) -> None:
    """Tworzy podparser kazdego kroku z jego opcjami (--data jest w nich wymagane)."""
    for krok, opis, opcje in OPCJE:
        q = sub.add_parser(krok, help=opis, description=opis)
        _dodaj_wspolne(q)
        for nazwy, kw, _ in opcje:
            q.add_argument(*nazwy, required=(nazwy[0] == "--data"), **kw)


def _dodaj_opcje_all(q: argparse.ArgumentParser) -> None:
    """Do parsera `all` dodaje tylko opcje wspolne dla trybu all; pozostale dostaja wartosc None."""
    dodane = set()
    for _, _, opcje in OPCJE:
        for nazwy, kw, w_all in opcje:
            if nazwy[0] in dodane:
                continue
            dodane.add(nazwy[0])
            cel = nazwy[0].lstrip("-").replace("-", "_")
            if w_all:
                q.add_argument(*nazwy, **kw)
            else:
                q.set_defaults(**{cel: None})


def zbuduj_parser() -> argparse.ArgumentParser:
    """Parser argparse z podkomendami dla kazdego kroku oraz `all`."""
    p = argparse.ArgumentParser(prog="bdot10k", description="Potok danych BDOT10k dla mapy wod PZW.")
    sub = p.add_subparsers(dest="krok", required=True)
    _dodaj_podparsery(sub)
    q = sub.add_parser("all", help="uruchom kolejne kroki od --od do --do",
                       description="Uruchamia kroki potoku po kolei; pliki posrednie w katalogu roboczym.")
    _dodaj_wspolne(q)
    q.add_argument("--od", default=KROKI[0], choices=KROKI, help="pierwszy krok")
    q.add_argument("--do", default=KROKI[-1], choices=KROKI, help="ostatni krok")
    _dodaj_opcje_all(q)
    return p


def main(argv: Optional[List[str]] = None) -> int:
    """Punkt wejscia: parsuje argumenty, wczytuje konfiguracje i uruchamia krok(i)."""
    a = zbuduj_parser().parse_args(argv)
    logging.basicConfig(level=getattr(logging, a.log_level),
                        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    cfg = wczytaj_konfiguracje(Path(a.config))
    work = Path(a.work) if a.work else Path(cfg.sciezki.katalog_roboczy)
    work.mkdir(parents=True, exist_ok=True)
    env = Srodowisko(cfg, work)
    if a.krok == "all":
        i0, i1 = KROKI.index(a.od), KROKI.index(a.do)
        if i0 > i1:
            raise SystemExit("--od musi poprzedzac --do")
        kroki = KROKI[i0: i1 + 1]
        if a.data is None and any(k in KROKI_Z_DATA for k in kroki):
            raise SystemExit("--data jest wymagane dla krokow: " + ", ".join(sorted(KROKI_Z_DATA)))
    else:
        kroki = [a.krok]
    for krok in kroki:
        log.info("=== krok: %s ===", krok)
        KROK_FUNKCJE[krok](env, a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
