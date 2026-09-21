# QA harness: wykaz wód PZW (PDF) vs `data.json`

Narzędzie porównuje oficjalny „Wykaz wód PZW Okręgu w Rzeszowie udostępnionych do wędkowania”
(skan PDF bez warstwy tekstowej) z danymi aplikacji (`public/data.json`) i generuje raport rozbieżności.

Potok przetwarzania:

1. `ocr` — PDF → strony PNG (`pdftoppm`) → wykrycie siatki tabel (linie poziome i pionowe, morfologia OpenCV)
   → komórki (także w kształcie L: nazwa + wiersz „Obowiązujące zasady”) → OCR każdej komórki osobno
   (tesseract, `pol`, psm 6/7; kolumna powierzchni dodatkowo w trybie liczbowym) → `komorki.json`.
2. `parsuj` — komórki → rekordy: zbiorniki (TAB. II, wraz z łączeniem „Ciąg dalszy ze str. N”),
   obwody nizinne (TAB. I), rzeki krainy pstrąga i lipienia (TAB. III) → `rekordy.json`.
   Typ tabeli rozpoznawany jest po nagłówku, kolumny po położeniu komórek nagłówka,
   rekordy po liniach poziomych pełnej szerokości.
3. `porownaj` — rekordy vs `data.json` → `raport.md` + `raport.json`, kod wyjścia.
4. `all` — wszystkie trzy etapy.

## Wymagania

Systemowe:

- Python ≥ 3.10
- `tesseract` 5 z pakietem języka polskiego (`tesseract-ocr`, `tesseract-ocr-pol`)
- `poppler-utils` (polecenie `pdftoppm`)

Python (`pip install -r requirements.txt`): OpenCV, NumPy, pytesseract, Pillow, rapidfuzz.

## Uruchomienie

```bash
cd tools/qa
pip install -r requirements.txt

# PDF nie jest częścią repozytorium (prawa PZW): podaj własną kopię lub pobierz z adresu w config.json
python -m qa pobierz --pdf /sciezka/wykaz.pdf

python -m qa all --pdf /sciezka/wykaz.pdf --dane ../../public/data.json --wyjscie run
# lub etapami:
python -m qa ocr --pdf /sciezka/wykaz.pdf --wyjscie run
python -m qa parsuj --wyjscie run
python -m qa porownaj --dane ../../public/data.json --wyjscie run
```

Opcje wspólne: `--config plik.json` (domyślnie `config.json` obok pakietu), `--wyjscie katalog`, `-v`.

Kod wyjścia: `1`, gdy liczba rozbieżności **twardych** przekracza `porownanie.max_twardych` (domyślnie 0),
w przeciwnym razie `0`. Błąd konfiguracji lub brak pliku wejściowego: `2`.

## Konfiguracja (`config.json`)

| Sekcja | Zawartość |
|---|---|
| `zrodlo` | adres PDF wykazu (do polecenia `pobierz`) |
| `sciezki` | domyślne ścieżki: PDF, `data.json`, katalog wyników i nazwy plików pośrednich |
| `ocr` | dpi, język tesseracta, skala powiększenia komórek, tryby psm, parametry wykrywania siatki |
| `parser` | słowa kluczowe nagłówków tabel, wyrażenia dla „Obowiązujące zasady” i „Ciąg dalszy”, lista poprawek typowych błędów OCR (`Ill`→`III`, `|`→`I`, „(ałkowity”→„Całkowity” …), reguła interpretacji liczb bez separatora |
| `porownanie` | progi podobieństwa (nazwy, typ, zasady, granice), tolerancja powierzchni, słowa pomijane i aliasy nazw, limit rozbieżności twardych |

W kodzie nie ma adresów ani ścieżek środowiska — wszystko pochodzi z konfiguracji lub argumentów.

## Zawartość raportu

`raport.md` (i równoważny `raport.json`):

- podsumowanie liczbowe: rekordy w wykazie i w danych, dopasowane, w pełni zgodne; liczba rozbieżności
  wg wagi (twarde / miękkie / informacyjne) i wg kategorii;
- **Zbiorniki (TAB. II)** — dopasowanie po znormalizowanej nazwie (bez diakrytyków, wielkości liter,
  interpunkcji i słów typu „zbiornik”, „stawy”; rozmycie z progiem, z karą za inną numerację, np. „Staw 3”
  vs „Stawy 1 i 2”). Kategorie: `brak_w_danych`, `brak_w_wykazie` (z podpowiedzią najbliższej nazwy),
  `powierzchnia` (ha), `typ` (uwagi), `zasady` (podobieństwo treści w %, przy wyniku poniżej progu obie wersje
  tekstu), `nazwa_rozmyta`;
- **Obwody nizinne (TAB. I)** — dopasowanie po polu `o` odcinków `c="niz"`; porównanie opisu granic z `d`,
  kolumny „Występujące zbiorniki / Uwagi” z `r`, powierzchni z liczbą „Pow. … ha” w opisie oraz sprawdzenie,
  czy zbiorniki wymienione w obwodzie istnieją w `zb`;
- **Kraina pstrąga (TAB. III)** — dopasowanie po nazwie rzeki z odcinkami `c="gor"`; zgodność obwodu,
  granic i zasad (metody + zakazy); informacja o rzekach mających kilka odcinków w danych;
- tabele zestawień wszystkich dopasowań z miarami.

Wagi: twarde — brak pozycji, inna powierzchnia, inny obwód; miękkie — typ, granice lub zasady poniżej progu;
informacyjne — dopasowania rozmyte, wielokrotne odcinki.

## Ograniczenia OCR i parsera

- Zasady w `data.json` są streszczeniami, więc podobieństwo zasad (token-set ratio na tekście
  znormalizowanym) rzadko sięga 100 %; próg `prog_zasad` służy do wychwycenia istotnych różnic, a nie
  identyczności — rozbieżności `zasady` wymagają oceny ręcznej na podstawie obu cytowanych tekstów.
- Tesseract myli pojedyncze znaki (np. „Trzciana” → „Irzciana”, „C” na początku pogrubionego wiersza,
  „I” → „|”); część przypadków naprawiają `poprawki_ocr`, resztę pokrywa dopasowanie rozmyte.
  Nazwa dopasowana rozmyto jest raportowana jako pozycja informacyjna.
- Powierzchnia jest czytana z osobnej komórki w trybie liczbowym; liczba bez separatora i co najmniej
  trzycyfrowa jest interpretowana jako zapis z dwoma miejscami po przecinku („810” → 8,10).
- Wykrywanie siatki zakłada ciągłe linie tabeli; strony bez linii (np. tekst wolny) nie są parsowane.
  Tytuły poza tabelą trafiają do pola `tlo` strony w `komorki.json` i nie są używane do klasyfikacji —
  o typie tabeli decyduje jej nagłówek.
- Podział zasad na punkty opiera się na myślnikach i zakończeniach zdań; zawinięcia wiersza po kropce
  w środku punktu mogą dać dodatkowy punkt (tekst łączny pozostaje poprawny).
- Kontynuacja rekordu („Ciąg dalszy ze str. N”) jest dołączana do ostatniego rekordu TAB. II,
  niezależnie od numeru strony w adnotacji (numeracja w wykazie odnosi się do druku, nie do PDF).
