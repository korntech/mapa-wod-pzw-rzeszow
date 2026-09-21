# Potok danych BDOT10k dla mapy wód PZW Okręgu w Rzeszowie

Pakiet `bdot10k` odtwarza geometrie rzek i wyszukuje kontury zbiorników na
podstawie Bazy Danych Obiektów Topograficznych **BDOT10k**, udostępnianej przez
Główny Urząd Geodezji i Kartografii. Wejściem jest `data.json` aplikacji
(wykaz wód z liniami rzek i pinezkami zbiorników), wyjściem nowy `data.json`
z geometriami z BDOT10k oraz plik kandydatów zbiorników dla panelu operatora.

Potok nie zmienia treści merytorycznej (granic obwodów, opisów, regulaminów):
istniejąca linia rzeki służy wyłącznie jako „kręgosłup” wyznaczający zasięg
i kierunek, wzdłuż którego układane są odcinki BDOT10k. Ręczne poprawki
operatora i pole `a` zbiorników nie są przedmiotem potoku.

## Struktura

```
tools/bdot/
├── config.json          # wszystkie adresy URL, obszar, warstwy, parametry algorytmów, nazwy plików
├── requirements.txt     # pyproj (reszta to biblioteka standardowa)
├── README.md
├── tests/test_podstawy.py  # testy jednostkowe (unittest)
└── bdot10k/             # pakiet Pythona (python -m bdot10k)
    ├── cli.py           # podkomendy i argumenty
    ├── config.py        # wczytanie i walidacja config.json
    ├── pliki.py         # JSON, pobieranie HTTP z ponawianiem
    ├── geo.py           # transformacja układów, odległości, RDP, pole wielokąta
    ├── nazwy.py         # normalizacja nazw, aliasy, tokeny
    ├── powiaty.py       # krok 1: indeks powiatów z WFS
    ├── wybierz.py       # krok 2: powiaty z obiektami z data.json
    ├── pobierz.py       # krok 3: paczki GML
    ├── parsuj.py        # krok 4: GML -> JSON
    ├── zszyj.py         # krok 5: geometrie rzek
    ├── zbiorniki.py     # krok 6: kandydaci zbiorników
    └── zloz.py          # krok 7: wynikowy data.json i plik dla panelu
```

## Instalacja

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```

Wymagany Python 3.9+. Testy jednostkowe: `python3 -m unittest discover -s tests`.

## Uruchomienie krok po kroku

Polecenia wykonuje się z katalogu `tools/bdot/`. Każdy krok czyta i zapisuje
pliki w katalogu roboczym (`--work`, domyślnie `sciezki.katalog_roboczy`
z konfiguracji względem bieżącego katalogu); nazwy plików pośrednich pochodzą
z sekcji `sciezki` i można je nadpisać opcjami danego kroku.

```bash
WORK=work
DATA=/sciezka/do/data.json          # wejściowy data.json aplikacji

# 1. indeks powiatów z WFS Geoportalu (zapisuje też surową odpowiedź wfs_powiaty.xml)
python3 -m bdot10k powiaty   --work $WORK

# 2. zawężenie do powiatów, w których leżą obiekty z data.json
python3 -m bdot10k wybierz   --work $WORK --data $DATA

# 3. pobranie paczek GML (ok. 1,2 GB dla 23 powiatów; istniejące paczki są pomijane)
python3 -m bdot10k pobierz   --work $WORK

# 4. parsowanie warstw z paczek (bez rozpakowywania) -> bdot_ptwp.json, bdot_cieki.json, bdot_meta.json
python3 -m bdot10k parsuj    --work $WORK

# 5. geometrie rzek -> rzeki_geometrie.json, rzeki_raport.json
python3 -m bdot10k zszyj     --work $WORK --data $DATA

# 6. kandydaci zbiorników -> kandydaci_zbiorniki.json
python3 -m bdot10k zbiorniki --work $WORK --data $DATA

# 7. złożenie -> data_nowe.json, kandydaci_panel.json
python3 -m bdot10k zloz      --work $WORK --data $DATA
```

Wszystkie kroki naraz (lub ich zakres):

```bash
python3 -m bdot10k all --work $WORK --data $DATA
python3 -m bdot10k all --work $WORK --data $DATA --od parsuj --do zloz
```

Przydatne opcje:

- `--config` – inny plik konfiguracji (domyślnie `config.json` obok pakietu);
- `--paczki` – katalog z paczkami ZIP (gdy leżą poza katalogiem roboczym);
- `--wfs-plik` – zapisana wcześniej odpowiedź WFS, pozwala powtórzyć krok 1 bez sieci;
- `--data-raportu`, `--data-aktualizacji` – daty w sekcjach `meta` (domyślnie dzisiejsza);
- `--log-level DEBUG` – szczegółowy log (m.in. lista powiatów z liczbą trafień).

`python3 -m bdot10k <krok> --help` wypisuje pełną listę opcji kroku.

## Pliki wejściowe i wyjściowe

| Plik | Krok | Zawartość |
|---|---|---|
| `data.json` (wejście) | 2, 5, 6, 7 | `rivers[]` (`n`, `pts` [lat, lon]), `zb[]` (`n`, `p`, `ha`, `t`, `a`), `granice[]` |
| `wfs_powiaty.xml` | 1 | surowa odpowiedź GetFeature usługi WFS |
| `powiaty.json` | 1 | powiaty w zasięgu obszaru: `teryt`, `nazwa`, `url`, `akt`, `bbox` |
| `powiaty_sel.json` | 2 | jw. z liczbą trafień `punktow`, tylko powiaty z obiektami |
| `paczki/<TERYT>.zip` | 3 | paczki GML BDOT10k |
| `bdot_ptwp.json` | 4 | poligony wód: `n`, `rodzaj`, `lat`, `lon`, `ha`, `ring`, `teryt` |
| `bdot_cieki.json` | 4 | odcinki cieków: `n`, `rodzaj`, `pts`, `teryt` |
| `bdot_meta.json` | 4 | lista powiatów, liczby rekordów, użyte warstwy |
| `rzeki_geometrie.json` | 5 | lista równoległa do `rivers`: nowa linia albo `null` |
| `rzeki_raport.json` | 5 | statystyki zszywania każdej rzeki |
| `kandydaci_zbiorniki.json` | 6 | pełne wyniki dopasowania (z konturami) |
| `data_nowe.json` | 7 | wynikowy `data.json` (rzeki z `src`, zbiorniki `pewne` przesunięte, `meta`) |
| `kandydaci_panel.json` | 7 | wyniki bez klasy `pewne` i bez konturów, do panelu operatora |

## Warstwy BDOT10k

| Plik w paczce | Zawartość | Użycie |
|---|---|---|
| `OT_SWRS_L` | sieć wodna – rzeki, strumienie (linie) | przebiegi rzek |
| `OT_SWKN_L` | sieć wodna – kanały i rowy (linie) | przebiegi rzek |
| `OT_PTWP_A` | pokrycie terenu – wody powierzchniowe (poligony) | kontury i powierzchnie zbiorników |

Z cech odczytywane są pola `ot:nazwa`, `ot:rodzaj` oraz geometria
(`gml:posList`). W warstwie poligonowej brany jest tylko pierścień
zewnętrzny (`gml:exterior`); pole liczone jest wzorem Gaussa w lokalnym
przybliżeniu płaskim. Paczki są dostępne pod
`https://opendata.geoportal.gov.pl/bdot10k/schemat2021/<woj>/<TERYT>_GML.zip`
bez logowania i bez klucza API; indeks powiatów (TERYT, data aktualizacji,
adres paczki, koperta) daje usługa WFS `PobieranieBDOT10k`.

## Algorytmy

### Rzeki (krok 5)

1. Z nazwy rzeki w wykazie wyprowadzane są nazwy do szukania w BDOT
   (usunięte dopiski obwodu i biegu, treść nawiasu jako alternatywa,
   aliasy z konfiguracji).
2. Odcinki o zgodnej nazwie trafiają do zbioru, jeśli co najmniej połowa ich
   wierzchołków leży w korytarzu `korytarz_m` (250 m) od starej linii.
3. Odcinki nienazwane lub o innej nazwie trafiają do zbioru, jeśli 70 %
   wierzchołków leży w wąskim korytarzu `korytarz_nienazwane_m` (80 m)
   – BDOT10k często nie nazywa odcinków źródliskowych.
4. Zszywanie zaczyna się od wierzchołka najbliższego początkowi starej linii
   (może wypaść w środku odcinka). Kolejne odcinki dołączane są końcami
   w promieniu `join_m` (60 m), a gdy takiego brak – mostkiem do najbliższego
   końca w promieniu `bridge_m` (2 500 m), pod warunkiem postępu wzdłuż
   kręgosłupa.
5. Linia jest przycinana do wierzchołków najbliższych końcom starej linii
   i upraszczana algorytmem RDP z tolerancją `rdp_eps_m` (8 m).

### Zbiorniki (krok 6)

Dla każdego zbiornika z `a == 1` zbierane są poligony wód w promieniu
`promien_poszukiwan_m` (5 km). Kandydatem jest pojedynczy poligon lub kompleks
(single-linkage po centroidach wód stojących, próg 400 m). Ocena:
zgodność powierzchni (gaussowska w logarytmie ilorazu), odległość
(wykładnicza), zgodność nazwy, kara za poligon „woda płynąca” (uchylana dla
zbiorników zaporowych), bonus za zgodną liczbę obiektów. Klasy `pewne`,
`do_wyboru`, `brak` z progami z sekcji `zbiorniki` konfiguracji; ten sam
poligon jako kandydat nr 1 dwóch łowisk degraduje obie klasy `pewne`.
Pełny opis progów trafia do `meta.progi` pliku wynikowego.

## Pułapki techniczne

1. **Kolejność osi.** W plikach GML BDOT10k `gml:posList` zapisuje
   współrzędne EPSG:2180 w kolejności (easting, northing), dlatego
   transformator pyproj tworzony jest z `always_xy=True`. W kopertach
   `gml:Envelope` usługi WFS obowiązuje kolejność autorytetu EPSG:2180,
   czyli (northing, easting) – przed transformacją osie są zamieniane.
   Pomylenie kolejności przenosi wyniki o setki kilometrów.
2. **Cięcie per powiat.** BDOT10k jest publikowany po powiatach, więc ciek
   przekraczający granicę ma odcinki, których końce się nie stykają
   (a bywają odsunięte o setki metrów). Krok 5 mostkuje takie przerwy
   (`bridge_m`); ustawienie zbyt dużej wartości grozi przeskokiem na
   sąsiedni ciek, zbyt małej – urwaniem linii na granicy powiatu.
3. **Warianty nazw.** Nazewnictwo BDOT10k bywa niezgodne z wykazem PZW.
   Aliasy (nazwa wykazu → nazwy BDOT) są w `rzeki.aliasy` konfiguracji:
   `stobnica → stopnica`, `wielopolka → brzeznica` (dolny bieg Wielopolki
   nosi w BDOT nazwę Brzeźnica). Alias dodaje się dopiero po sprawdzeniu
   geometrycznym, że odcinki leżą w korytarzu starej linii.
4. **Odcinki bez nazwy.** Cieki źródliskowe i krótkie fragmenty często nie
   mają `ot:nazwa`; dopuszczane są tylko w wąskim korytarzu (80 m), inaczej
   linia wchłaniałaby dopływy.
5. **Zbiorniki zaporowe jako „woda płynąca”.** BDOT10k mapuje część zbiorników
   zaporowych i starorzeczy jako poszerzone koryto cieku; poligony
   „woda płynąca” nie są odrzucane, lecz karane punktowo.
6. **Rozmiar danych.** Odpowiedź WFS z geometriami powiatów ma ok. 60 MB,
   paczki powiatów do 150 MB; timeouty i liczba ponowień są w konfiguracji.
   Parser czyta warstwy strumieniowo bezpośrednio z archiwów ZIP.
7. **Zaokrąglenia.** Współrzędne zapisywane są z dokładnością
   `geometria.miejsca_dziesietne` (6 miejsc, ok. 0,1 m); klucz deduplikacji
   odcinków korzysta z tej samej dokładności.

## Konfiguracja (`config.json`)

| Sekcja | Zawartość |
|---|---|
| `wfs` | adres usługi WFS, `typeNames`, `count`, timeout, ponowienia |
| `paczki` | szablon adresu paczek `{woj}`/`{teryt}`, timeout, ponowienia |
| `crs` | układ źródłowy (EPSG:2180) i docelowy (EPSG:4326) |
| `obszar` | obrys Okręgu (lat/lon min/max), margines dla WFS, margines wyboru powiatów |
| `warstwy` | nazwy warstw poligonowych i liniowych |
| `geometria` | liczba miejsc dziesiętnych współrzędnych i pinezek |
| `rzeki` | aliasy nazw, korytarze, udziały wierzchołków, `join_m`, `bridge_m`, tolerancja RDP |
| `zbiorniki` | promień poszukiwań, klastrowanie, wagi oceny, progi klas, słowa pomijane |
| `meta` | teksty źródeł i uwaga licencyjna wpisywane do `data_nowe.json` |
| `sciezki` | katalog roboczy i nazwy plików pośrednich |

## Licencja danych

BDOT10k należy do państwowego zasobu geodezyjnego i kartograficznego (PZGiK)
i jest udostępniany bezpłatnie do ponownego wykorzystania na podstawie ustawy
Prawo geodezyjne i kartograficzne. Warunkiem jest podanie źródła:
**Główny Urząd Geodezji i Kartografii (GUGiK), BDOT10k**. Informacja o źródle
jest zapisywana w sekcji `meta` wynikowego `data.json`.
