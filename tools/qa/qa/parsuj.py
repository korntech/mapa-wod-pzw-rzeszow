"""Etap parsowania: komórki OCR (JSON) → rekordy wykazu (zbiorniki, obwody nizinne, obwody górskie)."""

from __future__ import annotations

import bisect
import json
import logging
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .konfiguracja import Konfiguracja
from .tekst import normalizuj, parsuj_ha, polacz_wiersze, popraw_ocr

log = logging.getLogger(__name__)

TAB_NIZINNE = "obwody_nizinne"
TAB_ZBIORNIKI = "zbiorniki"
TAB_GORSKIE = "obwody_gorskie"


@dataclass
class Zbiornik:
    """Rekord TAB. II: zbiornik z powierzchnią, uwagami (typem) i zasadami."""

    nazwa: str
    ha: float | None
    ha_tekst: str
    uwagi: str
    zasady: list[str] = field(default_factory=list)
    strona: int = 0
    strony_kontynuacji: list[int] = field(default_factory=list)

    @property
    def zasady_tekst(self) -> str:
        return " ".join(self.zasady)


@dataclass
class ObwodNizinny:
    """Rekord TAB. I: obwód rybacki wód nizinnych."""

    obwod: str
    granice: str
    ha: float | None
    ha_tekst: str
    zbiorniki_tekst: str
    zbiorniki: list[str] = field(default_factory=list)
    strona: int = 0


@dataclass
class ObwodGorski:
    """Rekord TAB. III: rzeka krainy pstrąga i lipienia w obwodzie."""

    obwod: str
    rzeka: str
    rzeka_surowa: str
    granice: str
    metody: str
    zasady: list[str] = field(default_factory=list)
    strona: int = 0


@dataclass
class _Komorka:
    """Komórka z JSON wraz z przypisaniem do kolumn i pasma rekordu."""

    dane: dict[str, Any]
    kol_od: int = -1
    kol_do: int = -1
    pasmo: int = -1

    @property
    def x0(self) -> int:
        return int(self.dane["x0"])

    @property
    def x1(self) -> int:
        return int(self.dane["x1"])

    @property
    def y0(self) -> int:
        return int(self.dane["y0"])

    @property
    def y1(self) -> int:
        return int(self.dane["y1"])

    @property
    def ksztalt_l(self) -> bool:
        return bool(self.dane.get("pasma"))

    def tekst(self, poprawki: list[list[str]]) -> str:
        return popraw_ocr(self.dane.get("tekst") or "", poprawki).strip()

    def tekst_liczbowy(self) -> str:
        return (self.dane.get("tekst_liczbowy") or self.dane.get("tekst") or "").strip()


class Parser:
    """Buduje rekordy z komórek stron na podstawie nagłówków tabel i separatorów rekordów."""

    def __init__(self, konf: Konfiguracja) -> None:
        self.cfg = konf.parser
        self.poprawki: list[list[str]] = self.cfg["poprawki_ocr"]
        self.re_zasady = re.compile(self.cfg["zasady_naglowek"], re.IGNORECASE)
        self.re_ciag_ze = re.compile(self.cfg["ciag_dalszy_ze"], re.IGNORECASE)
        self.re_ciag_na = re.compile(self.cfg["ciag_dalszy_na"], re.IGNORECASE)
        self.re_prefiks_zb = re.compile(self.cfg["prefiks_zbiornikow"], re.IGNORECASE)
        self.zbiorniki: list[Zbiornik] = []
        self.nizinne: list[ObwodNizinny] = []
        self.gorskie: list[ObwodGorski] = []

    # --- narzędzia -------------------------------------------------------------------------

    def _wiersze(self, tekst: str) -> list[str]:
        return [w.strip() for w in tekst.splitlines() if w.strip()]

    def _typ_tabeli(self, naglowek: str) -> str | None:
        n = normalizuj(naglowek)
        for typ in (TAB_ZBIORNIKI, TAB_GORSKIE, TAB_NIZINNE):
            if any(slowo in n for slowo in self.cfg["naglowki"][typ]):
                return typ
        return None

    def _punkty_zasad(self, wiersze: list[str]) -> list[str]:
        """Usuwa nagłówki „Obowiązujące zasady” i adnotacje o kontynuacji, łączy zawinięte wiersze w punkty."""
        czyste: list[str] = []
        for w in wiersze:
            w = self.re_ciag_na.sub("", w).strip()
            w = self.re_ciag_ze.sub("", w).strip()
            if not w or self.re_zasady.match(w):
                continue
            czyste.append(w)
        return polacz_wiersze(czyste, self.cfg["poczatek_punktu"], self.cfg.get("koniec_punktu"))

    @staticmethod
    def _nachodzenie_y(a: _Komorka, b: _Komorka) -> float:
        wspolne = min(a.y1, b.y1) - max(a.y0, b.y0)
        return wspolne / max(1, min(a.y1 - a.y0, b.y1 - b.y0))

    # --- strona ----------------------------------------------------------------------------

    def strona(self, dane: dict[str, Any]) -> None:
        nr = int(dane["nr"])
        komorki = [_Komorka(k) for k in dane.get("komorki", [])]
        if not komorki:
            log.warning("Strona %02d: brak komórek", nr)
            return
        y_min = min(k.y0 for k in komorki)
        naglowek = sorted([k for k in komorki if k.y0 <= y_min + 6], key=lambda k: k.x0)
        kolumny = [(k.x0, k.x1) for k in naglowek]
        typ = self._typ_tabeli(" ".join(k.tekst(self.poprawki) for k in naglowek))
        if typ is None:
            log.warning("Strona %02d: nierozpoznany nagłówek tabeli: %r", nr, [k.dane.get("tekst") for k in naglowek])
            return
        separatory = list(dane.get("separatory", []))
        tol = 8
        for k in komorki:
            k.kol_od = next((i for i, (a, b) in enumerate(kolumny) if a - tol <= k.x0 < b), -1)
            k.kol_do = next((i for i, (a, b) in enumerate(kolumny) if a < k.x1 <= b + tol), -1)
            k.pasmo = bisect.bisect_right(separatory, k.y0 + 5)
        cialo = [k for k in komorki if k not in naglowek]
        log.debug("Strona %02d: %s, kolumny %s", nr, typ, kolumny)
        if typ == TAB_ZBIORNIKI:
            self._tab_zbiorniki(nr, cialo)
        elif typ == TAB_NIZINNE:
            self._tab_nizinne(nr, cialo)
        else:
            self._tab_gorskie(nr, cialo)

    # --- TAB. II ---------------------------------------------------------------------------

    def _tab_zbiorniki(self, nr: int, komorki: list[_Komorka]) -> None:
        pasma = sorted({k.pasmo for k in komorki})
        for p in pasma:
            grupa = [k for k in komorki if k.pasmo == p]
            nazwa_k = [k for k in grupa if k.kol_od == 0 and (k.kol_do == 0 or k.ksztalt_l)]
            ha_k = [k for k in grupa if k.kol_od == 1 and k.kol_do == 1]
            uwagi_k = [k for k in grupa if k.kol_od == 2 and k.kol_do == 2]
            pelne = [k for k in grupa if k.kol_od == 0 and k.kol_do >= 2 and not k.ksztalt_l]
            wiersze_zasad: list[str] = []
            if not nazwa_k and not ha_k:
                tekst = "\n".join(k.tekst(self.poprawki) for k in pelne + [k for k in grupa if k not in pelne])
                self._kontynuacja(nr, tekst)
                continue
            nazwa = ""
            if nazwa_k:
                wiersze = self._wiersze(nazwa_k[0].tekst(self.poprawki))
                if wiersze:
                    nazwa, reszta = self._odetnij_naglowek_zasad(wiersze[0])
                    wiersze_zasad.extend(([reszta] if reszta else []) + wiersze[1:])
            for k in pelne:
                wiersze_zasad.extend(self._wiersze(k.tekst(self.poprawki)))
            ha_tekst = ha_k[0].tekst_liczbowy() if ha_k else ""
            uwagi = " ".join(self._wiersze(uwagi_k[0].tekst(self.poprawki))) if uwagi_k else ""
            rekord = Zbiornik(
                nazwa=self._czysc_nazwe(nazwa),
                ha=parsuj_ha(ha_tekst, self.cfg["ha_bez_separatora_dwa_miejsca"]),
                ha_tekst=ha_tekst,
                uwagi=uwagi.strip(" ."),
                zasady=self._punkty_zasad(wiersze_zasad),
                strona=nr,
            )
            if not rekord.nazwa:
                log.warning("Strona %02d, pasmo %d: pusta nazwa zbiornika (ha=%r, uwagi=%r)", nr, p, ha_tekst, uwagi)
            self.zbiorniki.append(rekord)

    def _odetnij_naglowek_zasad(self, wiersz: str) -> tuple[str, str]:
        """Rozdziela nazwę od nagłówka zasad, gdy OCR skleił je w jednym wierszu."""
        m = re.search(r"obowi[aą]zuj[aą]ce\s+zasady", wiersz, re.IGNORECASE)
        if not m:
            return wiersz, ""
        return wiersz[: m.start()], wiersz[m.start() :]

    def _kontynuacja(self, nr: int, tekst: str) -> None:
        """Dołącza pasmo „Ciąg dalszy ze str. N” do ostatniego rekordu TAB. II."""
        if not self.zbiorniki:
            log.warning("Strona %02d: kontynuacja bez poprzedniego rekordu: %r", nr, tekst[:60])
            return
        rekord = self.zbiorniki[-1]
        rekord.zasady.extend(self._punkty_zasad(self._wiersze(tekst)))
        rekord.strony_kontynuacji.append(nr)
        log.info("Strona %02d: kontynuacja zasad dla %r", nr, rekord.nazwa)

    @staticmethod
    def _czysc_nazwe(nazwa: str) -> str:
        return re.sub(r"^[\s.,:;_|-]+|[\s.,:;_|-]+$", "", nazwa).strip()

    # --- TAB. I ----------------------------------------------------------------------------

    def _tab_nizinne(self, nr: int, komorki: list[_Komorka]) -> None:
        for p in sorted({k.pasmo for k in komorki}):
            grupa = [k for k in komorki if k.pasmo == p]
            kol = {i: [k for k in grupa if k.kol_od == i and k.kol_do == i] for i in range(4)}
            if not kol[0]:
                log.warning("Strona %02d, pasmo %d: brak nazwy obwodu", nr, p)
                continue
            obwod = " ".join(self._wiersze(kol[0][0].tekst(self.poprawki)))
            granice = " ".join(self._wiersze(kol[1][0].tekst(self.poprawki))) if kol[1] else ""
            ha_tekst = kol[2][0].tekst_liczbowy() if kol[2] else ""
            zb_tekst = " ".join(self._wiersze(kol[3][0].tekst(self.poprawki))) if kol[3] else ""
            self.nizinne.append(
                ObwodNizinny(
                    obwod=self._czysc_nazwe(obwod),
                    granice=granice,
                    ha=parsuj_ha(ha_tekst, self.cfg["ha_bez_separatora_dwa_miejsca"]),
                    ha_tekst=ha_tekst,
                    zbiorniki_tekst=zb_tekst,
                    zbiorniki=self._nazwy_zbiornikow(zb_tekst),
                    strona=nr,
                )
            )

    def _nazwy_zbiornikow(self, tekst: str) -> list[str]:
        """Wyciąga nazwy zbiorników z kolumny „Występujące zbiorniki / Uwagi”."""
        t = self.re_prefiks_zb.sub("", tekst.strip())
        t = re.split(r"\s+od\s+", t, maxsplit=1)[0]
        nazwy = [self._czysc_nazwe(n) for n in re.split(r"[,;]", t)]
        return [n for n in nazwy if n]

    # --- TAB. III --------------------------------------------------------------------------

    def _tab_gorskie(self, nr: int, komorki: list[_Komorka]) -> None:
        rzeki = sorted([k for k in komorki if k.kol_od == 1 and k.kol_do == 1], key=lambda k: k.y0)
        for r in rzeki:
            def kolumna(i: int) -> _Komorka | None:
                kandydaci = [k for k in komorki if k.kol_od == i and k.kol_do == i and self._nachodzenie_y(k, r) > 0.5]
                return max(kandydaci, key=lambda k: self._nachodzenie_y(k, r)) if kandydaci else None

            obwod_k, granice_k, zasady_k = kolumna(0), kolumna(2), kolumna(3)
            rzeka_surowa = " ".join(self._wiersze(r.tekst(self.poprawki)))
            wiersze = self._wiersze(zasady_k.tekst(self.poprawki)) if zasady_k else []
            metody = " ".join(w for w in wiersze if normalizuj(w).startswith("metoda"))
            reszta = [w for w in wiersze if not normalizuj(w).startswith("metoda")]
            self.gorskie.append(
                ObwodGorski(
                    obwod=self._czysc_nazwe(" ".join(self._wiersze(obwod_k.tekst(self.poprawki)))) if obwod_k else "",
                    rzeka=self._nazwa_rzeki(rzeka_surowa),
                    rzeka_surowa=rzeka_surowa,
                    granice=" ".join(self._wiersze(granice_k.tekst(self.poprawki))) if granice_k else "",
                    metody=metody.strip(" ."),
                    zasady=self._punkty_zasad(reszta),
                    strona=nr,
                )
            )

    @staticmethod
    def _nazwa_rzeki(surowa: str) -> str:
        return re.sub(r"\s*z\s+dop[łl]ywami\s*", " ", surowa, flags=re.IGNORECASE).strip(" ,.")


def uruchom(konf: Konfiguracja, plik_komorek: Path, wyjscie: Path) -> Path:
    """Parsuje `komorki.json` i zapisuje `rekordy.json`."""
    dane = json.loads(plik_komorek.read_text(encoding="utf-8"))
    parser = Parser(konf)
    for strona in dane["strony"]:
        parser.strona(strona)
    wynik = {
        "zbiorniki": [dict(asdict(z), zasady_tekst=z.zasady_tekst) for z in parser.zbiorniki],
        "obwody_nizinne": [asdict(o) for o in parser.nizinne],
        "obwody_gorskie": [asdict(o) for o in parser.gorskie],
    }
    plik = wyjscie / konf.nazwa_pliku("rekordy")
    plik.write_text(json.dumps(wynik, ensure_ascii=False, indent=1), encoding="utf-8")
    log.info(
        "Rekordy: %d zbiorników, %d obwodów nizinnych, %d rzek górskich → %s",
        len(parser.zbiorniki), len(parser.nizinne), len(parser.gorskie), plik,
    )
    return plik
