# Mapa wód PZW — Okręg Rzeszów

Interaktywna mapa łowisk Polskiego Związku Wędkarskiego Okręgu w Rzeszowie na podstawie
oficjalnego „Wykazu wód PZW Okręgu w Rzeszowie udostępnionych do wędkowania” (2026).

**Mapa: <https://korntech.github.io/mapa-wod-pzw-rzeszow/>**

## Co zawiera

- **zbiorniki** (stawy, wyrobiska pożwirowe, zbiorniki zaporowe) z powierzchnią, typem i zasadami połowu,
- **odcinki rzek** — wody nizinne oraz kraina pstrąga i lipienia, z granicami obwodów rybackich i zasadami,
- **punkty granic obwodów** i punkty orientacyjne,
- wyszukiwarkę (także bez polskich znaków), filtry warstw, listę boczną, „Najbliżej mnie”
  z sortowaniem wg odległości i link „Nawiguj” otwierający domyślną nawigację telefonu,
- trzy podkłady Głównego Urzędu Geodezji i Kartografii: mapa ogólnogeograficzna, mapa topograficzna, ortofotomapa,
- **wykaz do druku** (`wykaz.html`): tabele zbiorników, rzek i granic ze współrzędnymi, oznaczeniem lokalizacji
  przybliżonych i długością odcinków; przycisk „Pobierz PDF” zapisuje zestawienie w formacie A4.

## Zastrzeżenie

Mapa ma charakter **poglądowy**. Lokalizacje części zbiorników są przybliżone (oznaczone ⚠),
a granice obwodów na rzekach wyznaczono orientacyjnie. Przed wędkowaniem zweryfikuj zasady
w aktualnym zezwoleniu i w [oficjalnym wykazie wód](https://rzeszow.pzw.pl/strefa-wedkarza/wykaz-wod-pzw-okreg-w-rzeszowie-w-2026-roku).

## Architektura

| Element | Rozwiązanie |
|---|---|
| Strona | statyczna (Vite + Leaflet), hostowana na GitHub Pages |
| Dane łowisk | baza Supabase (tabele `zbiorniki`, `rivers`, `granice`); publiczny odczyt, zapis tylko dla operatorów z allow-listy |
| Snapshot | `public/data.json` — nocna kopia bazy w repozytorium; strona używa go, gdy baza nie odpowiada |
| Podkłady | usługi WMTS Geoportalu w państwowym układzie EPSG:2180 (siatka, rozdzielczości i warstwy w `config.json`) |
| Geometrie | BDOT10k (GUGiK) — przebiegi rzek i kontury zbiorników; pipeline w `tools/bdot/` |
| Panel operatora | `admin.html` — logowanie e-mail + hasło (Supabase Auth), edycja punktów i przebiegów rzek |

W czasie działania strona łączy się wyłącznie z Geoportalem GUGiK i własną bazą.

## Konfiguracja

Wszystkie adresy i parametry zmienne są w jednym pliku **`config.json`**:

| Sekcja | Zawartość |
|---|---|
| `site` | ścieżka bazowa i adres publiczny strony |
| `supabase` | adres projektu, klucz publiczny (`anonKey`), nazwy tabel |
| `snapshot` | nazwy plików snapshotu i kandydatów akwenów, obrys i progi walidacji, metadane źródeł |
| `map` | środek i poziomy zoomu, definicja układu współrzędnych i siatki kafli |
| `basemaps` | adres usługi WMTS, warstwy podkładów, podkład domyślny mapy i panelu, komunikat awaryjny |
| `links` | linki zewnętrzne używane na stronie (wykaz PZW, repozytorium, szablony nawigacji i zgłoszenia błędu — `report.email` Okręgu) |

Klucz `anonKey` jest z założenia jawny (trafia do przeglądarki); o bezpieczeństwie zapisu
decydują reguły RLS w bazie (`db/schema.sql`). Przy pustej sekcji `supabase` mapa działa
wyłącznie na snapshocie, a panel operatora wyświetla komunikat o braku konfiguracji.

## Uruchomienie lokalne

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # wersja produkcyjna do dist/
npm run preview    # podgląd dist/ pod ścieżką z config.json
npm run check      # składnia skryptów + walidacja snapshotu (to samo robi CI)
```

Po przejściu na własną domenę ustaw `site.basePath` w `config.json` (albo `PZW_BASE=/` przy budowaniu).

## Struktura repozytorium

| Ścieżka | Zawartość |
|---|---|
| `index.html`, `admin.html`, `wykaz.html` | strony (HTML + style) |
| `src/main.js`, `src/admin.js`, `src/wykaz.js` | logika mapy publicznej, panelu operatora i wykazu do druku |
| `src/geo.js` | odległości, długości linii, format współrzędnych |
| `src/config.js` | dostęp do `config.json` |
| `src/crs.js`, `src/basemaps.js` | układ współrzędnych i podkłady WMTS |
| `src/data.js` | warstwa danych: baza z zapasem w postaci snapshotu |
| `public/data.json` | snapshot bazy (odświeżany co noc) |
| `tools/snapshot/` | eksport, walidacja i generator SQL zasilającego bazę |
| `tools/bdot/` | pipeline geometrii z BDOT10k |
| `tools/qa/` | QA harness: porównanie danych z oficjalnym wykazem PZW (PDF) |
| `db/` | schemat bazy i migracje |
| `docs/` | raporty jakości danych i specyfikacje |
| `.github/workflows/` | CI, publikacja, snapshot, healthcheck |

## Struktura snapshotu (`public/data.json`)

| Klucz | Zawartość | Pola rekordu |
|---|---|---|
| `zb` | zbiorniki | `n` nazwa, `p` [lat, lon], `ha` powierzchnia, `t` typ, `r` zasady, `a` 1 = lokalizacja przybliżona |
| `rivers` | odcinki rzek | `n` nazwa, `c` `"niz"` / `"gor"`, `o` obwód, `d` opis granic, `r` zasady, `pts` [[lat, lon], …] |
| `granice` | granice obwodów / punkty orientacyjne | `n` nazwa, `p` [lat, lon], `d` opis |

## Baza danych i panel operatora

### Pierwsze uruchomienie

1. Załóż projekt na <https://supabase.com> (region Frankfurt); w **Project Settings → API**
   skopiuj adres projektu i klucz publiczny do sekcji `supabase` w `config.json`.
2. W **SQL Editor** uruchom [`db/schema.sql`](db/schema.sql) (tabele, allow-lista `operators`, RLS, uprawnienia).
3. Zasil bazę danymi ze snapshotu: `npm run seed-sql > seed.sql` i uruchom wynik w SQL Editor.
4. W **Authentication → Sign In / Providers** wyłącz publiczną rejestrację; konta operatorów
   (e-mail + hasło) zakładaj w **Authentication → Users**.
5. Każdego operatora dopisz do allow-listy:
   ```sql
   insert into public.operators (email) values ('operator@przyklad.pl');
   ```
   Tylko konta z tej listy mogą zapisywać dane — samo konto nie wystarcza.

Panel: `…/admin.html`. Operator edytuje zbiorniki i granice (pinezki), przebiegi rzek
(wierzchołki, [Leaflet-Geoman](https://geoman.io/)) oraz atrybuty; zmiany są widoczne na mapie po odświeżeniu.
Przy zbiorniku o lokalizacji przybliżonej panel pokazuje kandydujące akweny z BDOT10k
(`public/kandydaci-zbiorniki.json`: powierzchnia, odległość, ocena); kliknięcie przenosi pinezkę na wybrany akwen.

### Migracje

Każdą uruchamia się raz w SQL Editor; skrypty są idempotentne.

| Migracja | Zakres | Stan |
|---|---|---|
| `db/migrate-2026-09-20-bdot10k.sql` | geometrie rzek z BDOT10k, 10 zbiorników przeniesionych na akweny | uruchomiona |
| `db/migrate-2026-09-21-uprawnienia.sql` | zawężenie uprawnień do allow-listy i funkcji pomocniczych | **do uruchomienia** |
| `db/migrate-2026-09-21-kraina-pstraga.sql` | trzy cieki krainy pstrąga z wykazu (Słotowski, Dopływ z Połomii, Czarna (Grabinka)) i doprecyzowane zasady dwóch zbiorników | **do uruchomienia** |

## Kontrola zgodności z wykazem PZW (QA harness)

`tools/qa/` porównuje dane aplikacji z oficjalnym wykazem (skan PDF): OCR tabel, dopasowanie
zbiorników, obwodów nizinnych i cieków krainy pstrąga, raport rozbieżności (powierzchnie, typy,
granice, zasady). Uruchomienie i wymagania (tesseract z językiem polskim, poppler) — w
[`tools/qa/README.md`](tools/qa/README.md). Plik PDF wykazu nie jest częścią repozytorium.

## Automatyzacje (GitHub Actions)

Żaden workflow nie wymaga sekretów — odczyt bazy używa klucza publicznego z `config.json`.

| Workflow | Kiedy | Co robi |
|---|---|---|
| `ci.yml` | push i pull request | składnia skryptów, walidacja snapshotu, build |
| `deploy.yml` | push do `main` | build i publikacja `dist/` na GitHub Pages (Settings → Pages → Source: *GitHub Actions*) |
| `snapshot.yml` | co noc 03:15 UTC, ręcznie | eksport bazy do `public/data.json` i commit przy zmianie; utrzymuje projekt Supabase aktywny. Gdy baza zwraca mniej danych niż snapshot, job kończy się błędem i niczego nie nadpisuje |
| `healthcheck.yml` | co 6 h | sprawdza stronę i bazę; przy awarii zakłada issue `awaria`, zamyka je, gdy kontrola przejdzie |

`dependabot.yml` co tydzień proponuje aktualizacje zależności npm i akcji.

## Jak pomóc

Zgłoś błąd lub poprawkę przez [Issues](https://github.com/korntech/mapa-wod-pzw-rzeszow/issues) albo pull request.

Znane braki:

1. **27 zbiorników z `a:1`** ma lokalizację przybliżoną. Propozycje akwenów z BDOT10k są w
   [`public/kandydaci-zbiorniki.json`](public/kandydaci-zbiorniki.json) (panel operatora pokazuje je przy zbiorniku), omówienie w [`docs/raport-zbiorniki.md`](docs/raport-zbiorniki.md);
   wybór wymaga wiedzy lokalnej.
2. **Trzebośnica** — BDOT10k nazywa ciek dopiero ok. 1,2 km poniżej punktu „od źródeł” z wykazu.
3. **Granica obwodów Wisłok 3/4** (most kolejowy w Rzeszowie) jest przybliżona.
4. **Nazewnictwo**: wykaz PZW „Stobnica”, BDOT10k „Stopnica” — tożsamość cieku potwierdzona geometrycznie.
5. Pomysły: tryb offline (PWA), eksport GPX, zdjęcia łowisk.

Danych merytorycznych (zasady, powierzchnie, granice) nie zmieniamy bez weryfikacji z oficjalnym wykazem PZW.

## Licencja i źródła

- Kod: [MIT](LICENSE).
- Dane o łowiskach: opracowane na podstawie oficjalnego wykazu wód [Okręgu PZW w Rzeszowie](https://rzeszow.pzw.pl/) (2026).
- Dane przestrzenne (podkłady, przebiegi rzek, kontury zbiorników): [Główny Urząd Geodezji i Kartografii](https://www.geoportal.gov.pl/),
  państwowy zasób geodezyjny i kartograficzny — bezpłatne do ponownego wykorzystania, wymagane podanie źródła.

Projekt niezależny, niezwiązany formalnie z PZW.
