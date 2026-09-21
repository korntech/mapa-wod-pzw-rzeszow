# Przejście na polskie źródła danych państwowych (GUGiK / PZGiK)

Data: 2026-09-20

## Cel

Oprzeć całą warstwę przestrzenną mapy wyłącznie na danych z państwowego zasobu
geodezyjnego i kartograficznego. Powód: mapa ma zostać przekazana Okręgowi PZW
w Rzeszowie jako narzędzie oficjalne, więc nie powinna zależeć od źródeł, wobec
których ktoś mógłby zgłosić zastrzeżenia. Skutek uboczny, równie ważny:
znika klauzula share-alike licencji ODbL, która ograniczała prawa Okręgu do danych.

## Decyzje

- Geometrie rzek: **BDOT10k** (`OT_SWRS_L`, `OT_SWKN_L`) zamiast OpenStreetMap.
- Kontury i powierzchnie zbiorników: **BDOT10k** (`OT_PTWP_A`).
- Podkłady: wyłącznie usługi WMTS Geoportalu (mapa topograficzna BDOT10k, ortofotomapa).
  Kafle OpenStreetMap **usunięte także z roli podkładu awaryjnego**; awaryjnie
  włącza się druga usługa GUGiK, a gdy i ona milczy — mapa działa bez podkładu.
- Geokodowanie (na przyszłość, przy dodawaniu łowisk): **UUG GUGiK**.
- Przycisk „Nawiguj": schemat `geo:` zamiast odsyłacza do Google Maps — otwiera
  domyślną aplikację nawigacyjną w telefonie użytkownika, bez wskazywania dostawcy.

## Zakres wykonanych zmian

| Plik | Zmiana |
|---|---|
| `data.json` | geometrie 25 rzek z BDOT10k; 10 zbiorników przeniesionych na rzeczywiste akweny; sekcja `meta` ze źródłami |
| `basemaps.js` | usunięta warstwa kafli OSM i jej atrybucja; podkład awaryjny = druga usługa GUGiK |
| `index.html` | nagłówek, atrybucja w oknie „O mapie", link nawigacji |
| `data/kandydaci-zbiorniki.json` | propozycje akwenów dla 27 zbiorników do zatwierdzenia przez operatora (2 kolejne poprawił operator w panelu w czerwcu) |
| `tools/bdot/` | odtwarzalny pipeline danych wraz z opisem pułapek |

## Wynik liczbowy

- Rzeki: 25 z 25 mają geometrię z BDOT10k. Wierzchołków 1 972 → 6 630
  (wyższa wierność meandrów). Długości zmieniły się o −4,7 % do +15,0 %,
  co odpowiada rzeczywistej krętości pominiętej w uproszczonych danych.
  24 z 25 odcinków ma końce w odległości poniżej 250 m od dotychczasowych granic obwodów.
- Zbiorniki: 39 przybliżonych → 27. Dziesięć przeniesiono automatycznie, dwa poprawił wcześniej operator w panelu
  (przesunięcia 287–1 822 m), pozostałe mają przygotowane listy kandydatów.
- `data.json`: 54,5 KB → 158,6 KB (po kompresji serwera ok. 45 KB).

## Wymagające decyzji człowieka

1. **Trzebośnica** — BDOT nazywa ciek dopiero 1,2 km poniżej punktu „od źródeł"
   z wykazu. Odcinek źródłowy pozostaje nieobjęty; do potwierdzenia z Okręgiem.
2. **Stobnica / Stopnica** — rozbieżność nazewnicza między wykazem PZW a BDOT10k.
   Tożsamość cieku potwierdzona geometrycznie, ale warto zgłosić rozbieżność.
3. **Kompleks Mrowla–Lipie** (5 łowisk) — sąsiadujące wyrobiska o zbliżonych
   powierzchniach; algorytm nie rozstrzyga, potrzebna wiedza lokalna.

## Poza zakresem

Paczka kafli offline z BDOT10k (wymaga własnego procesu generowania kafli),
edycja kandydatów w panelu operatora (do zrobienia w etapie 2).

## Uzupełnienie (etap 0, ten sam dzień)

- `db/migrate-2026-09-20-bdot10k.sql` — przenosi powyższe zmiany do bazy Supabase
  (baza jest źródłem prawdy; bez migracji nocny snapshot cofnąłby geometrię do OSM).
  Przetestowana na wiernej kopii żywej bazy: 1 972 → 6 630 wierzchołków, `a = 1`
  37 → 27, poprawki operatora nietknięte, idempotentna.
- `tools/snapshot/export.mjs`, `validate.mjs` oraz workflowy `snapshot.yml`,
  `healthcheck.yml`, `ci.yml` — opisane w README, sekcja „Automatyzacje".
- Ustalenie po drodze: baza zawierała dwie ręczne poprawki operatora (Mrowla IV,
  Rakszawa Górna) z czerwca, których snapshot w repo nie miał. `data.json` został
  zbudowany ze stanu bazy po migracji, więc je uwzględnia.
