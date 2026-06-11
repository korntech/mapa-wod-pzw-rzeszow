# 🎣 Mapa wód PZW — Okręg Rzeszów

Interaktywna mapa łowisk Polskiego Związku Wędkarskiego Okręgu w Rzeszowie,
oparta na oficjalnym „Wykazie wód PZW Okręgu w Rzeszowie udostępnionych do wędkowania" na rok 2026.

**👉 Otwórz mapę: <https://korntech.github.io/mapa-wod-pzw-rzeszow/>**

## Co zawiera

- **49 zbiorników** (stawy, wyrobiska pożwirowe, zbiorniki zaporowe) z powierzchnią, typem i zasadami połowu
- **25 odcinków rzek** — wody nizinne oraz kraina pstrąga i lipienia, z granicami obwodów rybackich i zasadami
- **16 punktów granic obwodów** i punktów orientacyjnych
- Wyszukiwarkę (rozumie zapisy bez polskich znaków), filtry warstw, listę boczną,
  geolokalizację „Najbliżej mnie" z sortowaniem wg odległości oraz link „Nawiguj" (Google Maps)

## ⚠ Zastrzeżenie

Mapa ma charakter **poglądowy**. Lokalizacje części zbiorników są przybliżone (oznaczone ⚠),
a granice obwodów na rzekach wyznaczono orientacyjnie. Przed wędkowaniem zweryfikuj zasady
w aktualnym zezwoleniu i w [oficjalnym wykazie wód PZW Okręgu w Rzeszowie](https://rzeszow.pzw.pl/strefa-wedkarza/wykaz-wod-pzw-okreg-w-rzeszowie-w-2026-roku).

## Uruchomienie lokalne

Aplikacja to statyczny HTML + JSON — wystarczy dowolny serwer HTTP:

```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

(Otwarcie `index.html` bezpośrednio z dysku nie zadziała — `fetch('data.json')` wymaga HTTP.)

## Struktura danych (`data.json`)

| Klucz | Zawartość | Pola rekordu |
|---|---|---|
| `zb` | zbiorniki | `n` nazwa, `p` [lat, lon], `ha` powierzchnia, `t` typ, `r` zasady, `a` 1 = lokalizacja przybliżona |
| `rivers` | odcinki rzek | `n` nazwa, `c` `"niz"` (nizinna) / `"gor"` (kraina pstrąga), `o` obwód, `d` opis granic, `r` zasady, `pts` [[lat, lon], …] |
| `granice` | granice obwodów / punkty orientacyjne | `n` nazwa, `p` [lat, lon], `d` opis |

Geometrie rzek pochodzą z OpenStreetMap (Overpass), uproszczone algorytmem RDP
i przycięte do granic obwodów rybackich.

## Jak pomóc

Zgłoś błąd lub poprawkę przez [Issues](https://github.com/korntech/mapa-wod-pzw-rzeszow/issues)
albo wyślij PR — dane łowisk są w jednym pliku [`data.json`](data.json) (jeden rekord = jedna linia).

Znane braki — dobre na pierwszy wkład:

1. **Trzy potoki bez geometrii** (tylko punkty): Czarna (Grabinka), Potok Słotowski, Dopływ z Połomii —
   można dorysować ręcznie lub z Mapy Podziału Hydrograficznego Polski.
2. **Granica obwodów Wisłok 3/4** (most kolejowy w Rzeszowie) jest przybliżona — do doprecyzowania.
3. **Zbiorniki z `a:1`** mają lokalizację = środek miejscowości — do doprecyzowania na faktyczne akweny
   (np. Overpass: `natural=water` w pobliżu).
4. Pomysły: tryb offline (PWA), eksport GPX, warstwa pogody, zdjęcia łowisk.

**Zasada:** nie zmieniamy danych merytorycznych (zasady, powierzchnie, granice) bez weryfikacji
z oficjalnym wykazem PZW. Lokalizacje przybliżone oznaczamy `a:1`.

## Licencja i źródła

- Kod: [MIT](LICENSE)
- Dane o łowiskach: opracowane na podstawie oficjalnego wykazu wód
  [Okręgu PZW w Rzeszowie](https://rzeszow.pzw.pl/) (2026)
- Podkłady map: © [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL),
  OpenTopoMap (CC-BY-SA), Esri World Imagery
- Geometrie rzek: © autorzy OpenStreetMap (ODbL)

Projekt niezależny, niezwiązany formalnie z PZW.
