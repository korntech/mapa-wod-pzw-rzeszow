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

Aplikacja jest budowana narzędziem [Vite](https://vite.dev) (od 21.09.2026 — wcześniej
biblioteki ładowały się z zewnętrznych CDN-ów; teraz są w repozytorium i serwowane
razem ze stroną, więc mapa w czasie działania łączy się wyłącznie z Geoportalem GUGiK
i własną bazą).

```bash
npm install        # raz
npm run dev        # serwer deweloperski, http://localhost:5173
npm run build      # wersja produkcyjna do dist/
npm run preview    # podgląd dist/ pod docelową ścieżką /mapa-wod-pzw-rzeszow/
npm run check      # składnia + walidacja danych (to samo, co robi CI)
```

Struktura:

| Ścieżka | Zawartość |
|---|---|
| `index.html`, `admin.html` | strony (HTML + style); logika w `src/` |
| `src/main.js`, `src/admin.js` | mapa publiczna, panel operatora |
| `src/data.js` | wspólna warstwa danych: Supabase + fallback do snapshotu |
| `src/basemaps.js` | podkłady GUGiK (WMTS) z podkładem awaryjnym |
| `config.js` | adres i klucz publiczny Supabase |
| `public/data.json` | snapshot bazy (odświeżany co noc przez GitHub Actions) |
| `public/data/kandydaci-zbiorniki.json` | propozycje akwenów do zatwierdzenia przez operatora |
| `tools/` | pipeline BDOT10k, eksport i walidacja danych |
| `db/` | schemat, seedy i migracje bazy |

Publikacja: GitHub Pages z artefaktu builda (`.github/workflows/deploy.yml`).
Po przejściu na własną subdomenę ustaw `PZW_BASE=/` przy budowaniu.

## Źródła danych — wyłącznie polski zasób państwowy

Od 20 września 2026 cała warstwa przestrzenna pochodzi z państwowego zasobu
geodezyjnego i kartograficznego (PZGiK), udostępnianego bezpłatnie przez
Główny Urząd Geodezji i Kartografii:

| Warstwa | Źródło |
|---|---|
| Podkład topograficzny i ortofotomapa | usługi WMTS [Geoportalu](https://www.geoportal.gov.pl/) |
| Przebiegi rzek | BDOT10k, warstwy `OT_SWRS_L` i `OT_SWKN_L` |
| Kontury i powierzchnie zbiorników | BDOT10k, warstwa `OT_PTWP_A` |
| Treść merytoryczna (nazwy, zasady, granice obwodów) | oficjalny wykaz wód Okręgu PZW |

Pipeline odtwarzający dane z BDOT10k wraz z opisem pułapek jest w
[`tools/bdot/`](tools/bdot/README.md). Konfiguracja podkładów — w
[`basemaps.js`](basemaps.js); gdy mapa topograficzna nie odpowiada, aplikacja
przełącza się na ortofotomapę GUGiK, a gdy i ona milczy — pokazuje same dane
łowisk bez podkładu.

## Struktura danych (`public/data.json`)

| Klucz | Zawartość | Pola rekordu |
|---|---|---|
| `zb` | zbiorniki | `n` nazwa, `p` [lat, lon], `ha` powierzchnia, `t` typ, `r` zasady, `a` 1 = lokalizacja przybliżona |
| `rivers` | odcinki rzek | `n` nazwa, `c` `"niz"` (nizinna) / `"gor"` (kraina pstrąga), `o` obwód, `d` opis granic, `r` zasady, `pts` [[lat, lon], …] |
| `granice` | granice obwodów / punkty orientacyjne | `n` nazwa, `p` [lat, lon], `d` opis |

Geometrie rzek pochodzą z BDOT10k (GUGiK), zszyte z odcinków warstw `OT_SWRS_L`
i `OT_SWKN_L`, uproszczone algorytmem RDP i przycięte do granic obwodów rybackich
wyznaczonych na podstawie wykazu. Pole `src` w rekordzie wskazuje źródło geometrii.

## Panel operatora (opcjonalny) — edycja łowisk online

Projekt zawiera opcjonalny **panel operatora** ([`admin.html`](admin.html)), w którym
wyznaczone osoby (np. z Okręgu PZW) mogą po zalogowaniu samodzielnie edytować dane:
- **zbiorniki** i **granice** (punkty) — przeciąganie pinezki na właściwe miejsce, edycja pól, dodawanie/usuwanie,
- **rzeki** (polilinie) — edycja przebiegu (przesuwanie/dodawanie/usuwanie wierzchołków, przedłużanie linii za pomocą [Leaflet-Geoman](https://geoman.io/)), rysowanie nowych odcinków oraz edycja atrybutów (kraina, obwód, granice, zasady).

Zmiany trafiają do bazy i są widoczne na publicznej mapie po odświeżeniu.

Rozwiązanie jest **bezserwerowe i darmowe**: dane trzyma [Supabase](https://supabase.com)
(darmowy próg), a strony hostuje GitHub Pages. Bez konfiguracji Supabase publiczna mapa
działa normalnie na danych z `data.json` (panel jest wtedy nieaktywny).

### Konfiguracja (jednorazowo)

1. Załóż darmowy projekt na <https://supabase.com>.
2. W **Project Settings → API** skopiuj `Project URL` oraz klucz `anon public`
   i wklej je do [`config.js`](config.js). (Klucz `anon` jest jawny z założenia —
   bezpieczeństwo zapisu zapewniają reguły RLS, więc plik można commitować.)
3. W **SQL Editor** wklej i uruchom całość [`db/schema.sql`](db/schema.sql)
   (tworzy tabele `zbiorniki`, `rivers`, `granice`, allow-listę `operators` i reguły dostępu).
4. W **SQL Editor** uruchom [`db/seed.sql`](db/seed.sql) (49 zbiorników) oraz
   [`db/seed-rivers-granice.sql`](db/seed-rivers-granice.sql) (rzeki i granice).
5. W **Authentication → Providers / Sign In** wyłącz publiczną rejestrację, a w
   **Authentication → Users** załóż konta (e-mail + hasło) operatorom.
6. Dla każdego operatora dopisz jego e-mail do allow-listy w **SQL Editor**:
   ```sql
   insert into public.operators (email) values ('operator@przyklad.pl');
   ```
   Tylko konta z tej listy mogą zapisywać dane — samo posiadanie konta nie wystarcza.

Panel jest pod adresem `…/admin.html` (np. <https://korntech.github.io/mapa-wod-pzw-rzeszow/admin.html>).

### Migracje bazy

Zmiany w danych, które wykraczają poza edycję w panelu, są w `db/migrate-*.sql`
— każdą uruchamia się raz w **SQL Editor** Supabase. Skrypty są bezpieczne do
ponownego uruchomienia i na końcu same sprawdzają, czy baza jest w oczekiwanym stanie.

| Migracja | Co robi | Stan |
|---|---|---|
| `db/migrate-2026-09-20-bdot10k.sql` | geometrie 25 rzek z BDOT10k; 10 zbiorników przeniesionych na rzeczywiste akweny (tylko te z `a = 1` — poprawki operatora nie są nadpisywane) | **do uruchomienia** |

## Automatyzacje (GitHub Actions)

Trzy workflowy w `.github/workflows/`, żadne nie wymaga sekretów — klucz publiczny
z `config.js` wystarcza, bo reguły RLS dają publiczny odczyt.

| Workflow | Kiedy | Co robi |
|---|---|---|
| `deploy.yml` | każdy push do `main` | buduje stronę (Vite) i publikuje `dist/` na GitHub Pages. **Wymaga jednorazowo:** Settings → Pages → Source: „GitHub Actions" |
| `snapshot.yml` | co noc 03:15 UTC + ręcznie | eksportuje bazę do `public/data.json` i commituje, jeśli coś się zmieniło. Samo zapytanie utrzymuje projekt Supabase przy życiu (darmowy próg pauzuje po 7 dniach bezczynności). **Bezpiecznik:** gdy baza zwraca mniej danych niż jest w `data.json`, job kończy się błędem i nic nie nadpisuje |
| `healthcheck.yml` | co 6 h | sprawdza stronę i bazę; przy awarii zakłada jedno issue z etykietą `awaria` (zamyka je samo, gdy wszystko wróci). Mapa publiczna działa ze snapshotu także wtedy, gdy baza leży |
| `ci.yml` | każdy push i PR | składnia skryptów, walidacja `data.json` (`tools/snapshot/validate.mjs`) |

Lokalnie: `npm run export` (eksport), `npm run validate` (walidacja).

**Kolejność przy pierwszym wdrożeniu:**

1. Pliki workflowów leżą w `tools/github-workflows/` (folder `.github/` jest chroniony
   przed zapisem przez narzędzia zdalne) — przenieś je raz:
   `mkdir -p .github/workflows && git mv tools/github-workflows/*.yml .github/workflows/`
2. W repozytorium na GitHubie: Settings → Pages → Build and deployment → Source:
   **GitHub Actions** (zamiast „Deploy from a branch").
3. Uruchom `db/migrate-2026-09-20-bdot10k.sql` w SQL Editor Supabase.
4. `npm install` (tworzy `node_modules/`, ignorowany przez git), `npm run build` — sprawdź, że buduje się bez błędów.
5. Push.
Jeśli zrobisz odwrotnie, nic się nie zepsuje — nocny snapshot zatrzyma się na
bezpieczniku (baza ma starą geometrię, `data.json` nową) i będzie tak zgłaszał
błąd w zakładce Actions, dopóki migracja nie zostanie uruchomiona.

## Jak pomóc

Zgłoś błąd lub poprawkę przez [Issues](https://github.com/korntech/mapa-wod-pzw-rzeszow/issues)
albo wyślij PR — dane łowisk są w jednym pliku [`data.json`](data.json) (jeden rekord = jedna linia).

Znane braki — dobre na pierwszy wkład:

1. **27 zbiorników z `a:1`** ma nadal lokalizację przybliżoną (było 39: 10 poprawiono
   automatycznie z BDOT10k, 2 poprawił operator w panelu). Dla każdego przygotowane są
   propozycje akwenów w [`public/data/kandydaci-zbiorniki.json`](public/data/kandydaci-zbiorniki.json)
   — wybór wymaga wiedzy lokalnej. Szczegóły w [raporcie](docs/raport-zbiorniki.md).
2. **Trzebośnica** — BDOT10k nazywa ciek dopiero 1,2 km poniżej punktu „od źródeł"
   z wykazu; odcinek źródłowy do uzupełnienia.
3. **Granica obwodów Wisłok 3/4** (most kolejowy w Rzeszowie) jest przybliżona — do doprecyzowania.
4. **Rozbieżność nazewnicza**: wykaz PZW mówi „Stobnica", BDOT10k „Stopnica";
   tożsamość cieku potwierdzona geometrycznie, ale warto zgłosić rozbieżność.
5. Pomysły: tryb offline (PWA), eksport GPX, warstwa pogody, zdjęcia łowisk.

**Zasada:** nie zmieniamy danych merytorycznych (zasady, powierzchnie, granice) bez weryfikacji
z oficjalnym wykazem PZW. Lokalizacje przybliżone oznaczamy `a:1`.

## Licencja i źródła

- Kod: [MIT](LICENSE)
- Dane o łowiskach: opracowane na podstawie oficjalnego wykazu wód
  [Okręgu PZW w Rzeszowie](https://rzeszow.pzw.pl/) (2026)
- Dane przestrzenne (podkłady, przebiegi rzek, kontury zbiorników):
  [Główny Urząd Geodezji i Kartografii](https://www.geoportal.gov.pl/) — państwowy
  zasób geodezyjny i kartograficzny. Dane bezpłatne i dostępne do ponownego
  wykorzystania na mocy nowelizacji Prawa geodezyjnego i kartograficznego z 2020 r.;
  wymagane podanie źródła. Brak klauzuli share-alike i zobowiązań wobec podmiotów
  zewnętrznych.

Projekt niezależny, niezwiązany formalnie z PZW.
