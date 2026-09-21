"""Testy jednostkowe funkcji pomocniczych (uruchomienie: python3 -m unittest discover -s tests)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bdot10k import geo, nazwy  # noqa: E402
from bdot10k.config import wczytaj_konfiguracje  # noqa: E402

CONFIG = Path(__file__).resolve().parent.parent / "config.json"


class TestNazwy(unittest.TestCase):
    def setUp(self) -> None:
        self.aliasy = {"stobnica": ["stopnica"], "wielopolka": ["brzeznica"]}

    def test_normalizuj(self) -> None:
        self.assertEqual(nazwy.normalizuj("Wisłok obwód 3"), "wislok obwod 3")
        self.assertEqual(nazwy.normalizuj("Brzeźnica-Stara"), "brzeznica stara")
        self.assertEqual(nazwy.normalizuj(None), "")

    def test_nazwy_bazowe(self) -> None:
        self.assertEqual(nazwy.nazwy_bazowe("Wisłok — obwód Wisłok 3", {}), {"wislok"})
        self.assertEqual(nazwy.nazwy_bazowe("Ruda (Młynówka)", {}), {"ruda", "mlynowka"})
        self.assertEqual(nazwy.nazwy_bazowe("Złota 1 (kraina pstrąga)", {}), {"zlota"})
        self.assertEqual(nazwy.nazwy_bazowe("Potok Chotowski", {}), {"potok chotowski", "chotowski"})
        self.assertEqual(nazwy.nazwy_bazowe("Stobnica — obwód Stobnica 1", self.aliasy), {"stobnica", "stopnica"})
        self.assertEqual(nazwy.nazwy_bazowe("Wielopolka — dolna", self.aliasy), {"wielopolka", "brzeznica"})

    def test_liczba_obiektow_i_ha(self) -> None:
        self.assertEqual(nazwy.liczba_obiektow("5 wyrobisk pożwirowych"), 5)
        self.assertEqual(nazwy.liczba_obiektow("Zbiornik zaporowy"), 1)
        self.assertEqual(nazwy.parsuj_ha("29,94"), 29.94)
        self.assertIsNone(nazwy.parsuj_ha("b.d."))


class TestGeo(unittest.TestCase):
    def test_transformacja_osi(self) -> None:
        tr = geo.transformer("EPSG:2180", "EPSG:4326")
        (lat, lon), = geo.poslist_na_punkty("732212.39 235961.24", tr)
        self.assertAlmostEqual(lat, 50.03, delta=0.1)
        self.assertAlmostEqual(lon, 22.24, delta=0.1)

    def test_odleglosci(self) -> None:
        self.assertAlmostEqual(geo.odleglosc_lokalna_m((50.0, 22.0), (50.001, 22.0)), 111.32, places=2)
        d, t = geo.odleglosc_do_odcinka((50.0005, 22.0), (50.0, 22.0), (50.001, 22.0))
        self.assertAlmostEqual(d, 0.0, places=6)
        self.assertAlmostEqual(t, 0.5, places=6)

    def test_rdp(self) -> None:
        linia = [(50.0, 22.0), (50.0, 22.00001), (50.0, 22.001)]
        self.assertEqual(geo.uprosc_rdp(linia, 8.0), [(50.0, 22.0), (50.0, 22.001)])

    def test_powierzchnia(self) -> None:
        ring = [(50.0, 22.0), (50.0, 22.001), (50.001, 22.001), (50.001, 22.0)]
        self.assertAlmostEqual(geo.powierzchnia_ha(ring), 0.796, delta=0.01)


class TestConfig(unittest.TestCase):
    def test_wczytanie(self) -> None:
        cfg = wczytaj_konfiguracje(CONFIG)
        self.assertEqual(cfg.rzeki.bridge_m, 2500.0)
        self.assertEqual(cfg.obszar.zasieg(), (49.589, 50.54, 21.087, 22.831))
        self.assertIn("{teryt}", cfg.paczki.url_szablon)


if __name__ == "__main__":
    unittest.main()
