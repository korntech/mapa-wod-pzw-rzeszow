# Dopasowanie zbiorników PZW do poligonów BDOT10k

**Data:** 2026-09-20  
**Źródło referencyjne:** BDOT10k, warstwa OT_PTWP_A (GUGiK) — 23 935 poligonów wód z 23 powiatów  
**Zakres:** 39 zbiorników z wykazu PZW oznaczonych jako lokalizacja przybliżona (`a == 1`)

## 1. Metoda

Dla każdego zbiornika pobrano wszystkie poligony wód w promieniu **5 000 m** od obecnej pinezki
(pinezka stoi dziś w środku miejscowości, bo oficjalny wykaz podaje tylko nazwę i gminę).

Kandydatem jest albo pojedynczy poligon, albo **kompleks** — grupa poligonów wód stojących
sklejona metodą single-linkage z progiem 400 m (zalążki ≥ 0,15 ha). Dla łowisk, których wykaz
deklaruje *k* obiektów („5 wyrobisk", „3 stawy"), oceniany jest dodatkowo podzbiór **k największych**
poligonów kompleksu — bo wykazowa powierzchnia dotyczy właśnie tych k akwenów, a nie wszystkich
sadzawek w okolicy.

Ocena kandydata (0–110 pkt):

| składnik | waga | wzór |
|---|---|---|
| powierzchnia | 45 | `45 · exp(−ln(ha_BDOT/ha_wykaz)² / (2·0,35²))` — maksimum przy idealnej zgodności, ok. 37 pkt przy ±25 %, ok. 6 pkt przy dwukrotnej różnicy |
| odległość | 40 | `40 · exp(−d/1500 m)`, gdzie `d = min(odległość do środka ciężkości, odległość do najbliższego wierzchołka konturu)` |
| nazwa | 25 / 12,5 | pełna / częściowa zgodność nazwy BDOT z nazwą łowiska (bez polskich znaków, bez wielkości liter, z pominięciem słów typu „zbiornik", „stawy", „no-kill") |
| liczba obiektów | +4 | kompleks ma dokładnie tyle poligonów, ile deklaruje wykaz |
| kara za ciek | −10 | poligon `woda płynąca`; **kara uchylona**, gdy wykaz opisuje łowisko jako „zbiornik zaporowy" |

Cieków nie odrzucamy z góry. Okazało się, że BDOT10k mapuje część zbiorników zaporowych jako
`woda płynąca` (poszerzone koryto) — np. Zbiornik Blizne to poligon „Stopnica", a Zbiornik
Brzóza Królewska to poligon „Tartakówka". Gdyby je odfiltrować, oba łowiska trafiłyby do klasy `brak`.

## 2. Progi klasyfikacji

**`pewne`** — wszystkie warunki jednocześnie:

1. powierzchnia BDOT w oknie **±25 %** wykazu (`0,75 ≤ q ≤ 1,25`, gdzie `q = ha_BDOT / ha_wykaz`),
2. przesunięcie pinezki **≤ 2 500 m**,
3. ocena zwycięzcy **≥ 55 pkt**,
4. przewaga nad drugim kandydatem **≥ 15 pkt**,
5. jeśli kandydatem jest kompleks — jego **średnica ≤ 1 200 m** (zabezpieczenie przed łańcuchowym sklejeniem stawów z dwóch różnych dolin),
6. jeśli kandydatem jest `woda płynąca` — wykaz musi opisywać łowisko jako zbiornik zaporowy,
7. ten sam poligon nie jest kandydatem nr 1 dla innego łowiska (kontrola konfliktów).

Wariant alternatywny: **pełna zgodność nazwy** BDOT + powierzchnia ±50 % + przewaga ≥ 15 pkt.

**`brak`** — gdy żaden kandydat nie ma powierzchni w oknie 0,75–1,33 wykazu ani zgodnej nazwy,
a najlepsza ocena jest niższa niż 50 pkt. Mimo to w pliku zostawiono 2 najbliższe warianty jako trop.

**`do_wyboru`** — wszystko pozostałe; zwracane maks. 4 warianty malejąco po ocenie.

Progi 4 i 5 dobrano *po* obejrzeniu wyników pilotażowych: przy przewadze 12 pkt do klasy `pewne`
wchodziły Mrowla IV i Mrowla V, czyli dwa z pięciu sąsiadujących wyrobisk kompleksu Mrowla–Lipie,
gdzie ryzyko zamiany łowisk miejscami jest realne. Przy progu 1 200 m wypadła Błażkowa (kompleks
5 wyrobisk rozciągnięty na 1 394 m) — powierzchnia zgadza się tam znakomicie, ale środek ciężkości
takiego kompleksu wypada między akwenami, więc automatyczne przestawienie pinezki byłoby ryzykowne.

## 3. Wyniki — wszystkie 39 zbiorników

| # | Zbiornik | ha wykaz | Klasa | Kand. | ha BDOT (#1) | q | Przesunięcie | Ocena #1 / #2 | Uwaga |
|---:|---|---:|---|---:|---:|---:|---:|---|---|
| 1 | Męciszów | 32,00 | `pewne` | 73 | 31,18 | 0,97 | **925 m** | 72,4 / 43,2 |  |
| 2 | Stawy Głogów Młp. | 3,20 | `pewne` | 109 | 3,78 | 1,18 | **872 m** | 70,7 / 50,5 | kompleks 3 poligonów, Ø 420 m |
| 3 | Stawy Trzciana | 8,72 | `pewne` | 27 | 8,60 | 0,99 | **1 822 m** | 62,2 / 15,5 | kompleks 2 poligonów, Ø 163 m |
| 4 | Zbiornik Blizne | 11,00 | `pewne` | 25 | 13,46 | 1,22 | **667 m** | 77,3 / 42,9 | BDOT: „Stopnica"; rodzaj: woda płynąca |
| 5 | Stawy Janda | 1,70 | `pewne` | 53 | 1,75 | 1,03 | **403 m** | 82,3 / 44,9 | kompleks 2 poligonów, Ø 196 m |
| 6 | Zbiornik Jelna | 0,61 | `pewne` | 57 | 0,75 | 1,23 | **286 m** | 74,5 / 30,6 |  |
| 7 | Zbiornik Mokrzec | 145,00 | `pewne` | 88 | 142,61 | 0,98 | **1 137 m** | 72,6 / 30,8 | BDOT: „Pilzno" |
| 8 | Wola Dalsza | 26,00 | `pewne` | 64 | 26,05 | 1,00 | **1 544 m** | 62,8 / 25,3 |  |
| 9 | Czarna Sędziszowska | 44,79 | `pewne` | 48 | 49,08 | 1,10 | **1 150 m** | 66,1 / 28,6 |  |
| 10 | Zalew Kamionka | 9,52 | `pewne` | 120 | 9,18 | 0,96 | **1 601 m** | 71,6 / 53,5 | BDOT: „Zb. Kamionka" |
| 11 | Błażkowa, Brzyska | 29,94 | `do_wyboru` | 47 | 28,29 | 0,94 | 1 642 m | 65,4 / 28,7 | kompleks 5 poligonów, Ø 1 394 m |
| 12 | Lipie (no-kill) | 10,00 | `do_wyboru` | 114 | 10,38 | 1,04 | 197 m | 81,4 / 78,6 |  |
| 13 | Mrowla–Lipie II | 11,20 | `do_wyboru` | 120 | 11,32 | 1,01 | 518 m | 78,4 / 75,3 |  |
| 14 | Mrowla III | 3,57 | `do_wyboru` | 110 | 3,27 | 0,92 | 280 m | 78,8 / 73,1 |  |
| 15 | Mrowla IV | 18,01 | `do_wyboru` | 110 | 14,42 | 0,80 | 78 m | 75,5 / 62,5 |  |
| 16 | Mrowla V | 6,52 | `do_wyboru` | 113 | 6,95 | 1,07 | 189 m | 83,4 / 69,8 |  |
| 17 | Zbiornik Cierpisz | 4,22 | `do_wyboru` | 102 | 2,69 | 0,64 | 438 m | 55,6 / 54,5 |  |
| 18 | Stawy Tarnawka | 6,55 | `do_wyboru` | 24 | 5,60 | 0,85 | 3 484 m | 44,9 / 27,1 |  |
| 19 | Strzegocice I i II | 53,11 | `do_wyboru` | 66 | 60,14 | 1,13 | 2 358 m | 53,1 / 20,9 |  |
| 20 | Rakszawa Górna | 1,60 | `do_wyboru` | 103 | 1,00 | 0,62 | 231 m | 58,9 / 56,4 | kompleks 2 poligonów, Ø 135 m |
| 21 | Zbiorniki Łętownia | 5,71 | `do_wyboru` | 29 | 7,50 | 1,31 | 1 521 m | 49,4 / 42,1 |  |
| 22 | Zbiornik Głuchów | 4,20 | `do_wyboru` | 55 | 3,85 | 0,92 | 2 017 m | 54,7 / 46,7 |  |
| 23 | Zbiornik Grand-Chotowa | 4,90 | `do_wyboru` | 92 | 4,54 | 0,93 | 1 861 m | 57,9 / 51,9 |  |
| 24 | Zbiornik Przychojec | 1,00 | `do_wyboru` | 36 | 0,98 | 0,98 | 2 350 m | 53,7 / 47,2 |  |
| 25 | Rzemień — Stawy 1 i 2 | 5,97 | `do_wyboru` | 76 | 5,56 | 0,93 | 278 m | 80,2 / 52,6 | kompleks 7 poligonów, Ø 513 m; konflikt z innym łowiskiem |
| 26 | Rzemień — Staw 3 | 7,50 | `do_wyboru` | 79 | 5,56 | 0,74 | 425 m | 68,3 / 51,9 | kompleks 7 poligonów, Ø 513 m |
| 27 | Zbiornik Rudnik n. Sanem | 0,80 | `do_wyboru` | 59 | 0,72 | 0,90 | 832 m | 67,2 / 64,3 | BDOT: „Rudna"; rodzaj: woda płynąca |
| 28 | Zbiornik Brzóza Królewska | 2,50 | `do_wyboru` | 55 | 3,27 | 1,31 | 474 m | 69,2 / 47,1 | BDOT: „Tartakówka"; rodzaj: woda płynąca |
| 29 | Zbiornik Grodzisko Górne | 0,80 | `do_wyboru` | 38 | 0,90 | 1,12 | 4 551 m | 44,7 / 43,5 |  |
| 30 | Zbiornik Struga (Ulanów) | 0,50 | `do_wyboru` | 81 | 0,44 | 0,87 | 724 m | 68,0 / 56,7 | kompleks 2 poligonów, Ø 83 m |
| 31 | Cmolas-Dąbrówki | 0,07 | `do_wyboru` | 97 | 0,07 | 0,94 | 461 m | 74,1 / 69,3 |  |
| 32 | Świętoniowa | 15,00 | `do_wyboru` | 48 | 16,99 | 1,13 | 2 639 m | 55,8 / 37,2 | kompleks 3 poligonów, Ø 635 m |
| 33 | Zbiornik Nowa Wieś | 3,20 | `do_wyboru` | 51 | 2,51 | 0,79 | 1 297 m | 53,7 / 51,8 | BDOT: „Mrówka"; rodzaj: woda płynąca |
| 34 | Tama Żołynia | 2,50 | `do_wyboru` | 114 | 2,08 | 0,83 | 1 892 m | 51,9 / 42,4 |  |
| 35 | Zbiornik Turza | 2,67 | `do_wyboru` | 36 | 2,18 | 0,82 | 2 203 m | 48,0 / 46,8 |  |
| 36 | Zwięczyca | 1,90 | `brak` | 51 | 1,42 | 0,75 | 1 622 m | 47,3 / 34,8 | kompleks 3 poligonów, Ø 657 m |
| 37 | Glinianka Dobrzechów | 3,80 | `brak` | 28 | 2,53 | 0,67 | 1 358 m | 40,3 / 33,0 |  |
| 38 | Stobierna | 5,05 | `brak` | 50 | 6,75 | 1,34 | 2 754 m | 38,9 / 25,0 |  |
| 39 | Otałęż | 22,34 | `brak` | 147 | 34,34 | 1,54 | 1 231 m | 45,4 / 38,8 |  |

## 4. Klasa `pewne` — przesunięcia pinezek

| Zbiornik | Wykaz [ha] | BDOT [ha] | Różnica | Przesunięcie pinezki | Przewaga nad #2 |
|---|---:|---:|---:|---:|---:|
| Stawy Trzciana | 8,72 | 8,60 | -1,4 % | 1 822 m | 46,7 pkt |
| Zalew Kamionka | 9,52 | 9,18 | -3,6 % | 1 601 m | 18,1 pkt |
| Wola Dalsza | 26,00 | 26,05 | +0,2 % | 1 544 m | 37,5 pkt |
| Czarna Sędziszowska | 44,79 | 49,08 | +9,6 % | 1 150 m | 37,5 pkt |
| Zbiornik Mokrzec | 145,00 | 142,61 | -1,6 % | 1 137 m | 41,8 pkt |
| Męciszów | 32,00 | 31,18 | -2,6 % | 925 m | 29,2 pkt |
| Stawy Głogów Młp. | 3,20 | 3,78 | +18,2 % | 872 m | 20,2 pkt |
| Zbiornik Blizne | 11,00 | 13,46 | +22,4 % | 667 m | 34,4 pkt |
| Stawy Janda | 1,70 | 1,75 | +2,8 % | 403 m | 37,4 pkt |
| Zbiornik Jelna | 0,61 | 0,75 | +22,6 % | 286 m | 43,9 pkt |

Największe przesunięcie w klasie `pewne` to **1 822 m** (Stawy Trzciana) — mieści się w progu 2 500 m,
żadnego przypadku typu „4 km skoku" nie ma.

## 5. Klasa `brak` — co dalej

| Zbiornik | ha wykaz | Najlepszy kandydat | Dlaczego odrzucony |
|---|---:|---|---|
| Zwięczyca | 1,90 | 1,42 ha w odl. 1 622 m | q = 0,746, poza oknem 0,75–1,33; ocena 47,3 < 50 |
| Glinianka Dobrzechów | 3,80 | 2,53 ha w odl. 1 358 m | q = 0,666, poza oknem 0,75–1,33; ocena 40,3 < 50 |
| Stobierna | 5,05 | 6,75 ha w odl. 2 754 m | q = 1,336, poza oknem 0,75–1,33; ocena 38,9 < 50 |
| Otałęż | 22,34 | 34,34 ha w odl. 1 231 m | q = 1,537, poza oknem 0,75–1,33; ocena 45,4 < 50 |

## 6. Podsumowanie liczbowe

| Klasa | Liczba | Udział | Co robić |
|---|---:|---:|---|
| `pewne` | 10 | 25,6 % | nanieść automatycznie |
| `do_wyboru` | 25 | 64,1 % | operator wybiera z listy 2–4 wariantów |
| `brak` | 4 | 10,3 % | wymaga ręcznego wskazania na ortofotomapie |
| **razem** | **39** | **100,0 %** | |

- Ocenionych kandydatów łącznie: **2795** (średnio 71,7 na zbiornik); w pliku wynikowym zapisano 118.
- Kontury (`ring`) dołączono wyłącznie do kandydata nr 1 każdego zbiornika — plik ma 0,58 MB.
- Wszystkie współrzędne mieszczą się w zakresie lat 49,75–50,50 / lon 21,23–22,48 — wewnątrz dopuszczalnego okna 49,0–51,0 / 20,5–23,5.
- Liczba rekordów na wejściu = na wyjściu = **39**, nazwy w tej samej kolejności.

## 7. Przypadki podejrzane (do obejrzenia przez operatora)

1. **Czarna Sędziszowska** (`pewne`) — wykaz mówi o *2 wyrobiskach* o łącznej powierzchni 44,79 ha,
   a zwycięzcą jest **pojedynczy** poligon 49,08 ha. Powierzchnia się zgadza (+9,6 %), ale liczba obiektów nie.
   Prawdopodobnie BDOT scala to, co PZW liczy jako dwa akweny — warto zerknąć na ortofoto.
2. **Zbiornik Blizne** (`pewne`) — dopasowanie do poligonu typu `woda płynąca` („Stopnica", 13,46 ha vs 11,00 ha).
   Merytorycznie spójne (zbiornik zaporowy na potoku), ale to jedyny „pewny" oparty na cieku.
3. **Kompleks Mrowla–Lipie** (5 łowisk: Lipie, Mrowla–Lipie II, Mrowla III, IV, V) — wszystkie `do_wyboru`,
   wszystkie o wysokich ocenach (65–83 pkt), ale o *identycznych* zbiorach kandydatów. Powierzchnie sąsiednich
   wyrobisk (6,95 / 7,95 / 10,38 / 11,32 / 12,71 / 14,42 ha) są zbyt zbliżone, by rozstrzygnąć je algorytmicznie.
   To najpilniejszy przypadek do ręcznego rozpisania przez zarząd koła.
4. **Rzemień — Stawy 1 i 2** vs **Rzemień — Staw 3** — oba wskazują ten sam 7-poligonowy kompleks;
   klasyfikacja została automatycznie zdegradowana z `pewne` do `do_wyboru`.
5. **Błażkowa, Brzyska** (`do_wyboru`) — najmocniejszy „prawie pewny": 5 największych poligonów kompleksu
   daje 28,29 ha wobec 29,94 ha w wykazie (q = 0,95), liczba obiektów zgadza się co do jednego.
   Odrzucony wyłącznie przez limit średnicy kompleksu (1 394 m > 1 200 m).
6. **Strzegocice I i II** (`do_wyboru`) — 60,14 ha vs 53,11 ha, przewaga 32 pkt, ale ocena 53,1 < 55.
   Drugi „prawie pewny".
7. **Otałęż** (`brak`) — w odległości 1 231 m leży wyrobisko 34,34 ha przy 22,34 ha w wykazie.
   Żwirownie się powiększają, więc to może być poprawne dopasowanie z nieaktualną powierzchnią wykazową.
8. **Zwięczyca** (`brak`) — 51 kandydatów w promieniu, żaden o powierzchni bliskiej 1,90 ha;
   akwen leży w obrębie Rzeszowa, gdzie starorzeczy Wisłoka jest bardzo dużo.

## 8. Szczerze o jakości dopasowania

Automatycznie da się bezpiecznie nanieść **10 z 39** zbiorników (26 %). To niewiele, ale progi celowo
ustawiono ostro: błędne przestawienie pinezki jest gorsze niż jej pozostawienie w środku wsi, bo wprowadza
w błąd wędkarza w terenie. W klasie `pewne` wszystkie dopasowania mają powierzchnię zgodną w granicach
−3,6 %…+22,6 % i przesunięcie poniżej 1,9 km — to jakość wystarczająca do publikacji.

Realne ograniczenia:

- **Wykazowa powierzchnia bywa nieaktualna.** Wyrobiska pożwirowe rosną z roku na rok, więc `q` systematycznie
  przesuwa się w górę. Tam, gdzie q ≈ 1,5 (Otałęż), trudno rozstrzygnąć, czy to zły akwen, czy stara liczba.
- **BDOT dzieli akweny inaczej niż PZW.** „2 stawy" w wykazie to w BDOT bywa 7 poligonów albo 1.
  Podzbiory k największych częściowo to łatają, ale nie zawsze.
- **Kompleksy wielołowiskowe są nierozstrzygalne bez wiedzy lokalnej.** Mrowla–Lipie to 5 wpisów wykazu
  na ~6 sąsiadujących wyrobisk — algorytm dopasuje powierzchnie, ale przypisanie numerów jest zgadywaniem.
- **Brak nazw w BDOT.** Tylko 864 z 23 935 poligonów (3,6 %) ma nazwę, więc najmocniejszy discriminator —
  nazwa własna — zadziałał raptem trzykrotnie (Mokrzec/„Pilzno", Kamionka/„Zb. Kamionka", Blizne/„Stopnica").
  Cały ciężar spoczywa na powierzchni i odległości.

Rekomendacja: nanieść 10 `pewnych`, a 25 `do_wyboru` przepuścić przez panel operatora —
w 16 z nich kandydat nr 1 ma ocenę powyżej 55 pkt, więc wybór powinien zająć kilkanaście sekund na zbiornik.
