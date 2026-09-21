# Pipeline danych przestrzennych z BDOT10k (GUGiK)

Skrypty odtwarzają geometrie rzek i kontury zbiorników wyłącznie z polskich
danych państwowych — Bazy Danych Obiektów Topograficznych BDOT10k, udostępnianej
bezpłatnie przez Główny Urząd Geodezji i Kartografii.

## Kolejność uruchomienia

```bash
pip install pyproj --break-system-packages
python3 powiaty.py      # 1. lista powiatów z WFS Geoportalu -> powiaty.json
python3 wybierz.py      # 2. zawężenie do powiatów z łowiskami -> powiaty_sel.json
bash   dl.sh lista.txt  # 3. pobranie paczek GML (ok. 1,2 GB, 23 powiaty)
python3 parse_bdot.py   # 4. parsowanie warstw -> bdot_ptwp.json, bdot_cieki.json
python3 zszyj.py        # 5. zszycie odcinków rzek wzdłuż istniejących granic obwodów
python3 zloz.py         # 6. złożenie data.json
```

## Warstwy BDOT10k

| Plik w paczce | Zawartość | Do czego |
|---|---|---|
| `OT_SWRS_L.xml` | sieć wodna — rzeki i strumienie (linie) | przebiegi rzek |
| `OT_SWKN_L.xml` | sieć wodna — kanały (linie) | przebiegi rzek |
| `OT_PTWP_A.xml` | powierzchniowe wody powierzchniowe (poligony) | kontury i powierzchnie zbiorników |

Paczki: `https://opendata.geoportal.gov.pl/bdot10k/schemat2021/<woj>/<TERYT>_GML.zip`
— bez logowania i bez klucza API. Indeks powiatów: usługa WFS `PobieranieBDOT10k`.

## Pułapki, na które trzeba uważać

1. **Kolejność osi.** W plikach GML `<gml:posList>` ma kolejność (easting, northing)
   w układzie EPSG:2180, więc w `pyproj` należy użyć `always_xy=True`.
   W kopertach `<gml:Envelope>` usługi WFS obowiązuje odwrotna kolejność autorytetu
   (northing, easting). Pomylenie ich przenosi wyniki nad Bałtyk.
2. **Granice powiatów.** BDOT10k jest cięty per powiat, więc rzeka przekraczająca
   granicę ma odcinki, których końce się nie stykają. `zszyj.py` mostkuje takie
   przerwy (parametr `BRIDGE`, domyślnie 2500 m).
3. **Warianty nazw.** BDOT bywa niezgodny z nazewnictwem wykazu PZW. Zweryfikowane
   aliasy są w słowniku `ALIASY` w `zszyj.py`:
   - `Stobnica` (wykaz) = `Stopnica` (BDOT) — potwierdzone geometrycznie, 171/171
     wierzchołków pokrywa się w promieniu 250 m,
   - `Wielopolka` w dolnym biegu = `Brzeźnica` (BDOT).
4. **Odcinki źródłowe bez nazwy.** BDOT często nie nazywa cieków źródliskowych.
   `zszyj.py` dopuszcza odcinki nienazwane w wąskim korytarzu 80 m od istniejącej linii.

## Zasada nadrzędna

Skrypty NIE zmieniają granic obwodów ani treści merytorycznej — te pochodzą
z oficjalnego wykazu wód Okręgu. Podmieniane jest wyłącznie ŹRÓDŁO geometrii:
stara linia służy jako „kręgosłup", wzdłuż którego układane są odcinki BDOT.
