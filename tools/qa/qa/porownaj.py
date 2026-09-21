"""Etap porównania: rekordy wykazu (rekordy.json) vs dane aplikacji (data.json) → raport Markdown i JSON."""

from __future__ import annotations

import json
import logging
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .konfiguracja import Konfiguracja
from .tekst import format_ha, klucz, normalizuj, parsuj_ha, podobienstwo, podobienstwo_nazw

log = logging.getLogger(__name__)

TWARDA = "twarda"
MIEKKA = "miekka"
INFO = "info"


@dataclass
class Rozbieznosc:
    """Pojedyncza rozbieżność między wykazem a danymi aplikacji."""

    sekcja: str
    kategoria: str
    waga: str
    pozycja: str
    opis: str
    wykaz: str = ""
    dane: str = ""
    podobienstwo: int | None = None
    strona: int | None = None


@dataclass
class Dopasowanie:
    """Para rekord wykazu ↔ rekord danych wraz z miarami zgodności."""

    sekcja: str
    wykaz: str
    dane: str
    strona: int | None = None
    podobienstwo_nazwy: int = 100
    szczegoly: dict[str, Any] = field(default_factory=dict)


class Porownanie:
    """Wykonuje dopasowania i zbiera rozbieżności dla trzech sekcji wykazu."""

    def __init__(self, konf: Konfiguracja, rekordy: dict[str, Any], dane: dict[str, Any]) -> None:
        self.cfg = konf.porownanie
        self.rekordy = rekordy
        self.dane = dane
        self.rozbieznosci: list[Rozbieznosc] = []
        self.dopasowania: list[Dopasowanie] = []
        self.liczniki: Counter[str] = Counter()

    # --- narzędzia -------------------------------------------------------------------------

    def _dodaj(self, r: Rozbieznosc) -> None:
        self.rozbieznosci.append(r)
        self.liczniki[f"{r.sekcja}:{r.kategoria}"] += 1

    def _sim(self, a: str, b: str) -> int:
        return podobienstwo_nazw(a, b, self.cfg["kara_numeracji"])

    def _klucz_zb(self, nazwa: str) -> str:
        return klucz(nazwa, self.cfg["stopwords_nazw"], self.cfg["aliasy_nazw"])

    def _klucz_rzeki(self, nazwa: str) -> str:
        return klucz(nazwa, self.cfg["stopwords_rzek"], self.cfg["aliasy_rzek"])

    def _klucz_obwodu(self, nazwa: str) -> str:
        return klucz(nazwa, self.cfg["stopwords_obwodow"])

    def _dopasuj_nazwy(
        self, lewe: dict[str, str], prawe: dict[str, str]
    ) -> tuple[dict[str, str], list[str], list[str]]:
        """Dopasowuje klucze lewe→prawe: najpierw dokładnie, potem rozmytą miarą powyżej progu (zachłannie wg wyniku)."""
        pary: dict[str, str] = {k: k for k in lewe if k in prawe}
        wolne_l = [k for k in lewe if k not in prawe]
        wolne_p = [k for k in prawe if k not in lewe]
        kandydaci = sorted(((self._sim(a, b), a, b) for a in wolne_l for b in wolne_p), reverse=True)
        for wynik, a, b in kandydaci:
            if wynik < self.cfg["prog_nazwy"]:
                break
            if a in pary or b in pary.values():
                continue
            pary[a] = b
        return pary, [k for k in lewe if k not in pary], [k for k in prawe if k not in pary.values()]

    def _podpowiedz(self, k: str, kandydaci: dict[str, str], etykieta: str) -> str:
        """Najbliższa nazwa spośród kandydatów, jeśli podobieństwo przekracza próg podpowiedzi."""
        if not kandydaci:
            return ""
        wynik, najlepszy = max((self._sim(k, kk), nazwa) for kk, nazwa in kandydaci.items())
        return f"{etykieta}: {najlepszy} ({wynik}%)" if wynik >= self.cfg["podpowiedz_min"] else ""

    def _zasady_ogolne(self, tekst: str) -> bool:
        n = normalizuj(tekst)
        return not n or any(f in n for f in self.cfg["frazy_zasad_ogolnych"])

    # --- zbiorniki -------------------------------------------------------------------------

    def zbiorniki(self) -> None:
        wykaz = {self._klucz_zb(z["nazwa"]): z for z in self.rekordy["zbiorniki"] if z["nazwa"]}
        dane = {self._klucz_zb(z["n"]): z for z in self.dane.get("zb", [])}
        if len(wykaz) != len(self.rekordy["zbiorniki"]) or len(dane) != len(self.dane.get("zb", [])):
            log.warning("Zbiorniki: zduplikowane lub puste klucze nazw po normalizacji")
        pary, brak_w_danych, brak_w_wykazie = self._dopasuj_nazwy(
            {k: z["nazwa"] for k, z in wykaz.items()}, {k: z["n"] for k, z in dane.items()}
        )
        for k in brak_w_danych:
            z = wykaz[k]
            self._dodaj(Rozbieznosc(
                "zbiorniki", "brak_w_danych", TWARDA, z["nazwa"],
                "zbiornik z wykazu nie występuje w data.json",
                wykaz=f"{z['nazwa']} — {format_ha(z['ha'])} ha — {z['uwagi']}",
                dane=self._podpowiedz(k, {kk: dane[kk]["n"] for kk in brak_w_wykazie}, "najbliższa nazwa w danych"),
                strona=z["strona"],
            ))
        for k in brak_w_wykazie:
            z = dane[k]
            self._dodaj(Rozbieznosc(
                "zbiorniki", "brak_w_wykazie", TWARDA, z["n"],
                "zbiornik z data.json nie występuje w wykazie",
                dane=f"{z['n']} — {z.get('ha')} ha — {z.get('t')}",
                wykaz=self._podpowiedz(k, {kk: wykaz[kk]["nazwa"] for kk in brak_w_danych}, "najbliższa nazwa w wykazie"),
            ))
        for kw, kd in pary.items():
            self._porownaj_zbiornik(wykaz[kw], dane[kd], self._sim(kw, kd))

    def _porownaj_zbiornik(self, w: dict[str, Any], d: dict[str, Any], sim_nazwy: int) -> None:
        ha_d = parsuj_ha(str(d.get("ha", "")), False)
        ha_w = w["ha"]
        zgodna_ha = ha_w is not None and ha_d is not None and abs(ha_w - ha_d) <= self.cfg["tolerancja_ha"]
        sim_typu = podobienstwo(w["uwagi"], d.get("t", ""))
        zasady_w = w.get("zasady_tekst") or " ".join(w.get("zasady", []))
        zasady_d = d.get("r") or ""
        sim_zasad = 100 if not zasady_w and self._zasady_ogolne(zasady_d) else podobienstwo(zasady_w, zasady_d)
        self.dopasowania.append(Dopasowanie(
            "zbiorniki", w["nazwa"], d["n"], w["strona"], sim_nazwy,
            {"ha_wykaz": ha_w, "ha_dane": ha_d, "ha_zgodna": zgodna_ha,
             "typ_podobienstwo": sim_typu, "zasady_podobienstwo": sim_zasad},
        ))
        if sim_nazwy < 100:
            self._dodaj(Rozbieznosc(
                "zbiorniki", "nazwa_rozmyta", INFO, w["nazwa"], "nazwa dopasowana rozmyto",
                wykaz=w["nazwa"], dane=d["n"], podobienstwo=sim_nazwy, strona=w["strona"],
            ))
        if not zgodna_ha:
            self._dodaj(Rozbieznosc(
                "zbiorniki", "powierzchnia", TWARDA, w["nazwa"], "inna powierzchnia",
                wykaz=f"{format_ha(ha_w)} ha (OCR: {w['ha_tekst']!r})", dane=f"{d.get('ha')} ha", strona=w["strona"],
            ))
        if sim_typu < self.cfg["prog_typu"]:
            self._dodaj(Rozbieznosc(
                "zbiorniki", "typ", MIEKKA, w["nazwa"], "inne uwagi / typ zbiornika",
                wykaz=w["uwagi"], dane=str(d.get("t", "")), podobienstwo=sim_typu, strona=w["strona"],
            ))
        if sim_zasad < self.cfg["prog_zasad"]:
            self._dodaj(Rozbieznosc(
                "zbiorniki", "zasady", MIEKKA, w["nazwa"], "treść zasad poniżej progu podobieństwa",
                wykaz=zasady_w or "(brak zasad w wykazie)", dane=zasady_d or "(brak zasad w danych)",
                podobienstwo=sim_zasad, strona=w["strona"],
            ))

    # --- obwody nizinne --------------------------------------------------------------------

    def obwody_nizinne(self) -> None:
        wykaz = {self._klucz_obwodu(o["obwod"]): o for o in self.rekordy["obwody_nizinne"]}
        grupy: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in self.dane.get("rivers", []):
            if r.get("c") == "niz":
                grupy[self._klucz_obwodu(r.get("o", ""))].append(r)
        pary, brak_w_danych, brak_w_wykazie = self._dopasuj_nazwy(
            {k: o["obwod"] for k, o in wykaz.items()}, {k: g[0].get("o", "") for k, g in grupy.items()}
        )
        for k in brak_w_danych:
            o = wykaz[k]
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "brak_w_danych", TWARDA, o["obwod"], "obwód z TAB. I nie ma odcinka c='niz' w danych",
                wykaz=f"{o['obwod']} — {o['granice']}", strona=o["strona"],
            ))
        for k in brak_w_wykazie:
            g = grupy[k]
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "brak_w_wykazie", TWARDA, g[0].get("o", ""), "obwód z danych nie występuje w TAB. I",
                dane="; ".join(r["n"] for r in g),
            ))
        zb_klucze = {self._klucz_zb(z["n"]): z["n"] for z in self.dane.get("zb", [])}
        for kw, kd in pary.items():
            self._porownaj_obwod(wykaz[kw], grupy[kd], self._sim(kw, kd), zb_klucze)

    def _porownaj_obwod(self, o: dict[str, Any], g: list[dict[str, Any]], sim_nazwy: int, zb_klucze: dict[str, str]) -> None:
        opis_d = " ".join(r.get("d") or "" for r in g)
        zasady_d = " ".join(r.get("r") or "" for r in g)
        sim_granic = podobienstwo(o["granice"], opis_d)
        if self._zasady_ogolne(o["zbiorniki_tekst"]) and self._zasady_ogolne(zasady_d):
            sim_zasad = 100
        else:
            sim_zasad = podobienstwo(o["zbiorniki_tekst"], zasady_d)
        ha_dane = self._ha_z_opisu(opis_d)
        self.dopasowania.append(Dopasowanie(
            "obwody_nizinne", o["obwod"], ", ".join(r["n"] for r in g), o["strona"], sim_nazwy,
            {"ha_wykaz": o["ha"], "ha_dane": ha_dane, "granice_podobienstwo": sim_granic,
             "zasady_podobienstwo": sim_zasad, "odcinki": len(g)},
        ))
        if sim_granic < self.cfg["prog_granic"]:
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "granice", MIEKKA, o["obwod"], "opis granic poniżej progu podobieństwa",
                wykaz=o["granice"], dane=opis_d, podobienstwo=sim_granic, strona=o["strona"],
            ))
        if sim_zasad < self.cfg["prog_zasad"]:
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "zasady", MIEKKA, o["obwod"],
                "kolumna „Występujące zbiorniki / Uwagi” vs zasady odcinków",
                wykaz=o["zbiorniki_tekst"], dane=zasady_d, podobienstwo=sim_zasad, strona=o["strona"],
            ))
        if o["ha"] is not None and ha_dane is not None and abs(o["ha"] - ha_dane) > self.cfg["tolerancja_ha"]:
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "powierzchnia", TWARDA, o["obwod"], "inna powierzchnia obwodu",
                wykaz=f"{format_ha(o['ha'])} ha", dane=f"{format_ha(ha_dane)} ha (z opisu granic)", strona=o["strona"],
            ))
        elif o["ha"] is not None and ha_dane is None:
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "powierzchnia_brak", INFO, o["obwod"], "dane nie podają powierzchni obwodu",
                wykaz=f"{format_ha(o['ha'])} ha", strona=o["strona"],
            ))
        for nazwa in o["zbiorniki"]:
            k = self._klucz_zb(nazwa)
            if k in zb_klucze:
                continue
            wynik, najblizszy = max(((self._sim(k, kk), n) for kk, n in zb_klucze.items()), default=(0, ""))
            if wynik >= self.cfg["prog_nazwy"]:
                continue
            self._dodaj(Rozbieznosc(
                "obwody_nizinne", "zbiornik_brak", TWARDA, f"{o['obwod']} / {nazwa}",
                "zbiornik wymieniony w obwodzie nie występuje w `zb`",
                wykaz=o["zbiorniki_tekst"], dane=f"najbliższa nazwa: {najblizszy} ({wynik}%)" if najblizszy else "",
                strona=o["strona"],
            ))

    @staticmethod
    def _ha_z_opisu(tekst: str) -> float | None:
        m = re.search(r"pow\.?\s*(\d+[,.]\d+)\s*ha", tekst, re.IGNORECASE)
        return parsuj_ha(m.group(1), False) if m else None

    # --- kraina pstrąga --------------------------------------------------------------------

    def obwody_gorskie(self) -> None:
        wykaz = {self._klucz_rzeki(o["rzeka"]): o for o in self.rekordy["obwody_gorskie"]}
        grupy: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in self.dane.get("rivers", []):
            if r.get("c") == "gor":
                grupy[self._klucz_rzeki(r["n"])].append(r)
        pary, brak_w_danych, brak_w_wykazie = self._dopasuj_nazwy(
            {k: o["rzeka"] for k, o in wykaz.items()}, {k: g[0]["n"] for k, g in grupy.items()}
        )
        for k in brak_w_danych:
            o = wykaz[k]
            self._dodaj(Rozbieznosc(
                "kraina_pstraga", "brak_w_danych", TWARDA, o["rzeka"],
                "rzeka z TAB. III nie ma odcinka c='gor' w danych",
                wykaz=f"{o['rzeka_surowa']} ({o['obwod']}) — {o['granice']}",
                dane=self._podpowiedz(k, {kk: grupy[kk][0]["n"] for kk in brak_w_wykazie}, "najbliższa nazwa w danych"),
                strona=o["strona"],
            ))
        for k in brak_w_wykazie:
            g = grupy[k]
            self._dodaj(Rozbieznosc(
                "kraina_pstraga", "brak_w_wykazie", TWARDA, g[0]["n"], "rzeka c='gor' z danych nie występuje w TAB. III",
                dane=f"{g[0]['n']} ({g[0].get('o', '')}) — {g[0].get('d', '')}",
                wykaz=self._podpowiedz(k, {kk: wykaz[kk]["rzeka"] for kk in brak_w_danych}, "najbliższa nazwa w wykazie"),
            ))
        for kw, kd in pary.items():
            g = grupy[kd]
            for r in g:
                self._porownaj_rzeke(wykaz[kw], r, self._sim(kw, kd), len(g))
            if len(g) > 1:
                self._dodaj(Rozbieznosc(
                    "kraina_pstraga", "wiele_odcinkow", INFO, wykaz[kw]["rzeka"], f"rzeka ma {len(g)} odcinki w danych",
                    dane="; ".join(r["n"] for r in g), strona=wykaz[kw]["strona"],
                ))

    def _porownaj_rzeke(self, o: dict[str, Any], r: dict[str, Any], sim_nazwy: int, odcinki: int) -> None:
        sim_granic = podobienstwo(o["granice"], r.get("d", ""))
        zasady_w = " ".join([o["metody"]] + o["zasady"])
        sim_zasad = podobienstwo(zasady_w, r.get("r", ""))
        obwod_ok = self._klucz_obwodu(o["obwod"]) == self._klucz_obwodu(r.get("o", ""))
        self.dopasowania.append(Dopasowanie(
            "kraina_pstraga", f"{o['rzeka']} ({o['obwod']})", f"{r['n']} ({r.get('o', '')})", o["strona"], sim_nazwy,
            {"obwod_zgodny": obwod_ok, "granice_podobienstwo": sim_granic,
             "zasady_podobienstwo": sim_zasad, "odcinki": odcinki},
        ))
        if sim_nazwy < 100 and odcinki == 1:
            self._dodaj(Rozbieznosc(
                "kraina_pstraga", "nazwa_rozmyta", INFO, o["rzeka"], "nazwa dopasowana rozmyto",
                wykaz=o["rzeka_surowa"], dane=r["n"], podobienstwo=sim_nazwy, strona=o["strona"],
            ))
        if not obwod_ok:
            self._dodaj(Rozbieznosc(
                "kraina_pstraga", "obwod", TWARDA, o["rzeka"], "inny obwód rybacki",
                wykaz=o["obwod"], dane=str(r.get("o", "")), strona=o["strona"],
            ))
        if sim_granic < self.cfg["prog_granic"]:
            self._dodaj(Rozbieznosc(
                "kraina_pstraga", "granice", MIEKKA, o["rzeka"], "opis granic poniżej progu podobieństwa",
                wykaz=o["granice"], dane=str(r.get("d", "")), podobienstwo=sim_granic, strona=o["strona"],
            ))
        if sim_zasad < self.cfg["prog_zasad"]:
            self._dodaj(Rozbieznosc(
                "kraina_pstraga", "zasady", MIEKKA, o["rzeka"], "zasady / metody poniżej progu podobieństwa",
                wykaz=zasady_w, dane=str(r.get("r", "")), podobienstwo=sim_zasad, strona=o["strona"],
            ))

    # --- podsumowanie ----------------------------------------------------------------------

    def _zgodne(self, sekcja: str) -> int:
        c = self.cfg
        wynik = 0
        for d in self.dopasowania:
            if d.sekcja != sekcja:
                continue
            s = d.szczegoly
            ok = s["zasady_podobienstwo"] >= c["prog_zasad"]
            if sekcja == "zbiorniki":
                ok = ok and s["ha_zgodna"] and s["typ_podobienstwo"] >= c["prog_typu"]
            else:
                ok = ok and s["granice_podobienstwo"] >= c["prog_granic"] and s.get("obwod_zgodny", True)
            wynik += int(ok)
        return wynik

    def podsumowanie(self) -> dict[str, Any]:
        wg_wagi = Counter(r.waga for r in self.rozbieznosci)
        rzeki = self.dane.get("rivers", [])
        sekcje = ("zbiorniki", "obwody_nizinne", "kraina_pstraga")
        return {
            "wykaz": {
                "zbiorniki": len(self.rekordy["zbiorniki"]),
                "obwody_nizinne": len(self.rekordy["obwody_nizinne"]),
                "kraina_pstraga": len(self.rekordy["obwody_gorskie"]),
            },
            "dane": {
                "zbiorniki": len(self.dane.get("zb", [])),
                "obwody_nizinne": len({r.get("o") for r in rzeki if r.get("c") == "niz"}),
                "kraina_pstraga": sum(1 for r in rzeki if r.get("c") == "gor"),
            },
            "dopasowane": {s: sum(1 for d in self.dopasowania if d.sekcja == s) for s in sekcje},
            "w_pelni_zgodne": {s: self._zgodne(s) for s in sekcje},
            "rozbieznosci_wg_wagi": {w: wg_wagi.get(w, 0) for w in (TWARDA, MIEKKA, INFO)},
            "rozbieznosci_wg_kategorii": dict(sorted(self.liczniki.items())),
        }


# --- raport ------------------------------------------------------------------------------------

_SEKCJE = {
    "zbiorniki": "Zbiorniki (TAB. II)",
    "obwody_nizinne": "Obwody nizinne (TAB. I)",
    "kraina_pstraga": "Kraina pstrąga i lipienia (TAB. III)",
}
_WAGI = {TWARDA: "twarde", MIEKKA: "miękkie", INFO: "informacyjne"}


def _md(tekst: str) -> str:
    return tekst.replace("|", "\\|").replace("\n", " ").strip()


def _cytat(tekst: str) -> str:
    return "\n".join(f"> {w}" for w in (tekst or "—").splitlines())


def _wartosc(klucz_: str, v: Any) -> str:
    if isinstance(v, bool):
        return "tak" if v else "nie"
    if klucz_.startswith("ha_"):
        return format_ha(v)
    return str(v)


def raport_markdown(p: Porownanie, meta: dict[str, Any], kod: int) -> str:
    """Buduje raport Markdown: podsumowanie liczbowe, rozbieżności wg sekcji i wagi, zestawienia dopasowań."""
    s = p.podsumowanie()
    c = p.cfg
    w: list[str] = ["# Raport QA: wykaz wód PZW vs data.json", ""]
    w.append(f"- Wygenerowano: {meta['czas']}")
    w.append(f"- Rekordy wykazu: `{meta['rekordy']}`")
    w.append(f"- Dane aplikacji: `{meta['dane']}` (snapshot: {meta.get('snapshot') or '—'})")
    w.append(f"- Kod wyjścia: **{kod}** (limit rozbieżności twardych: {c['max_twardych']})")
    w += ["", "## Podsumowanie", ""]
    w.append("| Sekcja | W wykazie | W danych | Dopasowane | W pełni zgodne |")
    w.append("|---|---:|---:|---:|---:|")
    for sek, nazwa in _SEKCJE.items():
        w.append(f"| {nazwa} | {s['wykaz'][sek]} | {s['dane'][sek]} | {s['dopasowane'][sek]} | {s['w_pelni_zgodne'][sek]} |")
    w += ["", "| Waga rozbieżności | Liczba |", "|---|---:|"]
    for waga, etykieta in _WAGI.items():
        w.append(f"| {etykieta} | {s['rozbieznosci_wg_wagi'][waga]} |")
    w += ["", "| Sekcja : kategoria | Liczba |", "|---|---:|"]
    for k, v in s["rozbieznosci_wg_kategorii"].items():
        w.append(f"| {k} | {v} |")
    w += [
        "",
        "Wagi: **twarde** — brak pozycji, inna powierzchnia, inny obwód; **miękkie** — typ/uwagi, opis granic lub zasady "
        f"poniżej progu podobieństwa (nazwy {c['prog_nazwy']}%, typ {c['prog_typu']}%, zasady {c['prog_zasad']}%, "
        f"granice {c['prog_granic']}%); **informacyjne** — dopasowania rozmyte, wielokrotne odcinki, brak powierzchni w danych.",
        "",
    ]
    for sek, nazwa in _SEKCJE.items():
        w += [f"## {nazwa}", ""]
        for waga in (TWARDA, MIEKKA, INFO):
            lista = [r for r in p.rozbieznosci if r.sekcja == sek and r.waga == waga]
            if not lista:
                continue
            w += [f"### Rozbieżności {_WAGI[waga]} ({len(lista)})", ""]
            for r in lista:
                strona = f", str. {r.strona}" if r.strona else ""
                sim = f", podobieństwo {r.podobienstwo}%" if r.podobienstwo is not None else ""
                w += [f"#### {r.pozycja} — `{r.kategoria}`{strona}{sim}", "", r.opis, ""]
                if r.wykaz:
                    w += ["Wykaz:", "", _cytat(r.wykaz), ""]
                if r.dane:
                    w += ["Dane:", "", _cytat(r.dane), ""]
        dop = [d for d in p.dopasowania if d.sekcja == sek]
        if dop:
            klucze = list(dop[0].szczegoly.keys())
            w += [f"### Zestawienie dopasowań ({len(dop)})", ""]
            w.append("| Wykaz | Dane | Str. | Nazwa % | " + " | ".join(klucze) + " |")
            w.append("|---|---|---:|---:|" + "|".join("---:" for _ in klucze) + "|")
            for d in dop:
                wart = " | ".join(_wartosc(k, d.szczegoly[k]) for k in klucze)
                w.append(f"| {_md(d.wykaz)} | {_md(d.dane)} | {d.strona or ''} | {d.podobienstwo_nazwy} | {wart} |")
            w.append("")
    return "\n".join(w)


def uruchom(konf: Konfiguracja, plik_rekordow: Path, plik_danych: Path, wyjscie: Path) -> int:
    """Porównuje rekordy z danymi, zapisuje raporty i zwraca kod wyjścia (1 przy przekroczeniu limitu twardych)."""
    rekordy = json.loads(plik_rekordow.read_text(encoding="utf-8"))
    dane = json.loads(plik_danych.read_text(encoding="utf-8"))
    p = Porownanie(konf, rekordy, dane)
    p.zbiorniki()
    p.obwody_nizinne()
    p.obwody_gorskie()
    podsumowanie = p.podsumowanie()
    twarde = podsumowanie["rozbieznosci_wg_wagi"][TWARDA]
    kod = 1 if twarde > konf.porownanie["max_twardych"] else 0
    meta = {
        "czas": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "rekordy": str(plik_rekordow),
        "dane": str(plik_danych),
        "snapshot": (dane.get("meta") or {}).get("snapshot"),
    }
    (wyjscie / konf.nazwa_pliku("raport_md")).write_text(raport_markdown(p, meta, kod), encoding="utf-8")
    (wyjscie / konf.nazwa_pliku("raport_json")).write_text(
        json.dumps(
            {
                "meta": meta,
                "kod_wyjscia": kod,
                "podsumowanie": podsumowanie,
                "rozbieznosci": [asdict(r) for r in p.rozbieznosci],
                "dopasowania": [asdict(d) for d in p.dopasowania],
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    log.info(
        "Rozbieżności: %d twardych, %d miękkich, %d informacyjnych → kod wyjścia %d",
        twarde, podsumowanie["rozbieznosci_wg_wagi"][MIEKKA], podsumowanie["rozbieznosci_wg_wagi"][INFO], kod,
    )
    return kod
