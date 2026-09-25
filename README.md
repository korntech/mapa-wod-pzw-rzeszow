# Mapa wód PZW — Okręg Rzeszów

Interaktywna mapa łowisk Polskiego Związku Wędkarskiego Okręgu w Rzeszowie, opracowana na podstawie
oficjalnego „Wykazu wód PZW Okręgu w Rzeszowie udostępnionych do wędkowania”.

**Mapa: <https://pzw-rzeszow.github.io/mapa-wod-pzw-rzeszow/>**

Na mapie są:

- **zbiorniki** (stawy, wyrobiska, zbiorniki zaporowe) z powierzchnią, typem i zasadami połowu,
- **odcinki rzek** — wody nizinne oraz kraina pstrąga i lipienia, z opisem granic obwodów i zasadami,
- **punkty granic obwodów** i punkty orientacyjne,
- wyszukiwarka (działa też bez polskich znaków), filtry warstw, a pod „Więcej filtrów” rodzaj zbiornika
  (zaporowe / wyrobiska pożwirowe / stawy / inne), „tylko NO-KILL” i obwód rybacki; lista boczna
  (na telefonie wysuwany panel nad mapą na cały ekran), legenda symboli,
  „Najbliżej mnie” (bieżące położenie, sortowanie wg odległości), „Nawiguj” (Google Maps / Apple Maps /
  Waze, wybór zapamiętany) i „Udostępnij” (link do łowiska: `…/#w=<id>`),
- trzy podkłady GUGiK: mapa ogólna, mapa topograficzna, ortofotomapa,
- **wykaz do druku** (`wykaz.html`) — tabele zbiorników, rzek i granic ze współrzędnymi; „Pobierz PDF” zapisuje A4.

## Zastrzeżenie

Mapa ma charakter **poglądowy**. Lokalizacje części zbiorników są przybliżone (oznaczone ⚠),
a granice obwodów na rzekach wyznaczono orientacyjnie. Przed wędkowaniem obowiązuje aktualne zezwolenie
i [oficjalny wykaz wód](https://rzeszow.pzw.pl/strefa-wedkarza/wykaz-wod-pzw-okreg-w-rzeszowie-w-2026-roku).
Projekt powstał z inicjatywy autora i jest rozwijany we współpracy z Okręgiem; wiążący pozostaje oficjalny wykaz.

## Jak to działa

| Element | Rozwiązanie |
|---|---|
| Strona | statyczna (Vite + Leaflet) na GitHub Pages |
| Dane łowisk | baza Supabase (tabele `zbiorniki`, `rivers`, `granice`): publiczny odczyt, zapis tylko dla operatorów z allow-listy po drugim składniku (MFA) |
| Snapshot | `public/data.json` — nocna kopia bazy w repozytorium; mapa wczytuje snapshot, a potem nadpisuje go danymi z bazy (każdą warstwę osobno), więc działa także przy niedostępnej bazie |
| Podkłady i geometrie | usługi WMTS Geoportalu (EPSG:2180) oraz przebiegi rzek i kontury zbiorników z BDOT10k (GUGiK) |
| Cache kafli | Cloudflare Worker + R2 (`cloudflare/kafle/`) między przeglądarką a Geoportalem; włączany polem `basemaps.kafleUrl` w `config.json` (puste = kafle prosto z Geoportalu) |
| Pamięć podręczna | service worker `public/sw.js`: obejrzane kafle i pliki strony są dostępne także przy słabym zasięgu i bez sieci |
| Panel operatora | `admin.html` — logowanie e-mail + hasło + TOTP, edycja pinezek, przebiegów rzek i atrybutów; każda zmiana trafia do `historia_zmian` |
| Zgłoszenia błędów | formularz na mapie → funkcja Supabase `zglos-blad` → issue w tym repozytorium (bez konta GitHub) |

W czasie działania strona łączy się wyłącznie z Geoportalem GUGiK, cache kafli (Cloudflare Worker) i własnym
projektem Supabase (baza i funkcja zgłoszeń) — wymusza to CSP generowane w buildzie z `config.json` (`vite.config.js`).

Szczegóły (kafle i praca offline, zgłoszenia, bezpieczeństwo, monitoring) są w
[wiki projektu](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/wiki).

## Uruchomienie lokalne

Wymagany Node 20+.

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # wersja produkcyjna do dist/
npm run preview    # podgląd dist/ pod ścieżką z config.json
npm test           # testy jednostkowe (node --test)
npm run check      # składnia skryptów, walidacja snapshotu, testy (to samo robi CI, plus build i migracje)
npm run e2e:przegladarki  # jednorazowo: Chromium, Firefox, WebKit dla Playwrighta
npm run e2e        # testy E2E na żywej stronie w 8 urządzeniach (inny adres: E2E_URL=https://… npm run e2e)
npm run e2e:raport # raport HTML ostatniego przebiegu
```

Testy E2E (`tests/e2e/`, Playwright) sprawdzają mapę na komputerach, iPhone/iPad i telefonach z Androidem;
funkcja zgłoszeń jest w nich podmieniona, więc nic nie trafia do bazy ani do Issues.

Migracje można sprawdzić lokalnie na czystym Postgresie tak jak CI: `psql -f db/ci-supabase-stub.sql`,
potem każdy plik z `supabase/migrations/` w kolejności (`--single-transaction`), na końcu `npm run seed-sql | psql`.

Po przejściu na własną domenę ustaw `site.basePath` i `site.url` w `config.json`
(alternatywnie `PZW_BASE=/` przy budowaniu).

## Struktura repozytorium

| Ścieżka | Zawartość |
|---|---|
| `index.html`, `admin.html`, `wykaz.html` | strony: mapa publiczna, panel operatora, wykaz do druku |
| `src/` | logika stron, warstwa danych, układ współrzędnych i podkłady, filtry, formularz zgłoszeń |
| `public/data.json` | snapshot bazy (odświeżany co noc); format: [wiki → Przepływ danych](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/wiki/Przeplyw-danych) |
| `public/sw.js` | service worker (kopiowany do `dist/` bez hasha) |
| `public/kandydaci-zbiorniki.json` | propozycje akwenów z BDOT10k dla zbiorników o lokalizacji przybliżonej (panel) |
| `config.json` | cała konfiguracja (patrz niżej) |
| `supabase/migrations/` | schemat bazy i wszystkie zmiany, w kolejności znaczników czasu |
| `supabase/functions/zglos-blad/` | funkcja zgłoszeń (walidacja i treść issue w `zgloszenie.js`, współdzielonym ze stroną) |
| `supabase/config.toml` | identyfikator projektu i ustawienia funkcji |
| `cloudflare/kafle/` | Worker cache kafli Geoportalu (`worker.js`, testy, `wrangler.toml`) |
| `db/` | test macierzy uprawnień, atrapa środowiska Supabase dla CI |
| `tools/snapshot/` | eksport bazy do snapshotu, walidacja, generator SQL zasilającego bazę |
| `tools/bdot/` | pipeline geometrii z BDOT10k — [opis](tools/bdot/README.md) |
| `tools/qa/` | porównanie danych z oficjalnym wykazem PZW (PDF, OCR) — [opis](tools/qa/README.md) |
| `tools/triage/` | klasyfikacja zgłoszeń przez model (prompt, etykiety, komentarz) |
| `tests/e2e/` | testy E2E (Playwright) |
| `docs/instrukcja-operatora.md` | instrukcja obsługi panelu dla operatora Okręgu |
| `SECURITY.md` | prywatna ścieżka zgłaszania luk bezpieczeństwa |

## Konfiguracja (`config.json`)

| Sekcja | Zawartość |
|---|---|
| `site` | ścieżka bazowa i adres publiczny strony |
| `supabase` | adres projektu, klucz publiczny (`anonKey`), nazwy tabel |
| `snapshot` | nazwy plików snapshotu i kandydatów, obrys i progi walidacji, metadane źródeł |
| `map` | środek i poziomy zoomu, zasięg przesuwania, układ współrzędnych i siatka kafli |
| `basemaps` | adres usługi WMTS, adres cache kafli (`kafleUrl`), warstwy podkładów, podkład domyślny, komunikat awaryjny |
| `links` | linki zewnętrzne, szablony nawigacji, nazwa funkcji zgłoszeń i zapasowy formularz issue |
| `healthcheck` | częstotliwość kontroli, próg alarmu, osoby przypisywane do alarmu |

Klucz `anonKey` jest z założenia jawny (trafia do przeglądarki); o bezpieczeństwie zapisu decydują reguły RLS
w bazie. Przy pustej sekcji `supabase` mapa działa wyłącznie na snapshocie.

## Baza danych i panel operatora

Pierwsze uruchomienie:

1. Załóż projekt Supabase; adres projektu i klucz publiczny wpisz do sekcji `supabase` w `config.json`.
2. Wykonaj migracje z `supabase/migrations/` (`npx supabase link --project-ref <ref>`, `npx supabase db push`).
3. Zasil bazę danymi ze snapshotu: `npm run seed-sql > seed.sql`, wynik uruchom w SQL Editor.
4. W **Authentication** wyłącz publiczną rejestrację, załóż konta operatorów i upewnij się, że TOTP jest włączone.
5. Każdego operatora dopisz do allow-listy — samo konto nie wystarcza:
   ```sql
   insert into public.operators (email) values ('operator@przyklad.pl');
   ```
6. Operator przy pierwszym logowaniu konfiguruje w panelu drugi składnik (TOTP); bez niego może tylko oglądać.

`db/test-uprawnienia.sql` sprawdza macierz uprawnień na bazie testowej (kończy się `rollback`).
Obsługę panelu opisuje [instrukcja operatora](docs/instrukcja-operatora.md).

### Zmiany w bazie (migracje)

Każda zmiana schematu, reguł RLS czy funkcji SQL to nowy plik `supabase/migrations/<RRRRMMDDGGMMSS>_nazwa.sql`,
idempotentny (`if not exists`, `create or replace`, `drop … if exists`) i bez własnych `begin`/`commit`.
Pull request → CI wykonuje wszystkie migracje dwa razy na czystym Postgresie; scalenie do `main` →
integracja Supabase z GitHubem wykonuje na produkcji migracje, których jeszcze nie było.

**Kolejność wdrożenia: najpierw migracja bazy, potem deploy funkcji `zglos-blad`** — chyba że opis migracji
mówi inaczej.

### Kopia zapasowa i odtwarzanie

Nocny snapshot (`public/data.json`, historia w git) jest kopią treści łowisk. Odtworzenie:
`git show <commit>:public/data.json > kopia.json`, `node tools/snapshot/seed-sql.mjs kopia.json > seed.sql`,
wynik uruchom w SQL Editor — **czyści i nadpisuje wszystkie trzy tabele** łowisk. Pojedynczy rekord można cofnąć
z `historia_zmian`. Kont operatorów i tabeli `zgloszenia` snapshot nie obejmuje.

## Cache kafli (Cloudflare)

Worker przyjmuje tylko `GetTile` dla usług z listy i tylko ze stron z `ALLOWED_ORIGINS`; kafel trzyma 30 dni
w R2. Wdrożenie z katalogu głównego (Wrangler jest w `devDependencies`):

```bash
npm run kafle:login    # logowanie w przeglądarce
npm run kafle:bucket   # tworzy bucket R2 `pzw-kafle`
npm run kafle:deploy   # wgrywa Workera i wypisuje jego adres
```

Adres Workera z sufiksem `/wss/service/` wpisz do `basemaps.kafleUrl`, potem build i publikacja.
Nagłówek `X-Kafle: edge|r2|origin` mówi, skąd przyszedł kafel; `<worker>/zdrowie` sprawdza healthcheck.
Więcej: [wiki → Cache kafli](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/wiki/Cache-kafli).

## Zgłoszenia błędów z mapy

„Zgłoś uwagę” otwiera formularz: woda z listy albo „Inne” (brakujące łowisko lub uwaga ogólna) i opis.
Formularz nie zbiera danych kontaktowych. Funkcja `zglos-blad` waliduje treść, atomowo rezerwuje limit w bazie
(`zgloszenie_rezerwuj`) i dopiero potem zakłada issue z etykietą `zgłoszenie`. Limity są w `zgloszenie.js` →
`LIMITY`; wpisy w tabeli `zgloszenia` (z adresem IP) są kasowane po 30 dniach zadaniem `pg_cron`
(`zgloszenia-retencja`). Gdy funkcja nie odpowiada, formularz pokazuje zapasowy link do formularza issue.

Wdrożenie funkcji: token GitHub *fine-grained* ograniczony do tego repozytorium z uprawnieniem
**Issues: Read and write**, potem:

```bash
npx supabase login
npx supabase secrets set --project-ref <ref> GITHUB_TOKEN=<token> \
  GITHUB_REPO=pzw-rzeszow/mapa-wod-pzw-rzeszow \
  MAP_URL=https://pzw-rzeszow.github.io/mapa-wod-pzw-rzeszow/ \
  ALLOWED_ORIGINS=https://pzw-rzeszow.github.io
npx supabase functions deploy zglos-blad --project-ref <ref>
```

Wyłącznik awaryjny: sekret `ZGLOSZENIA_WSTRZYMANE=1` zatrzymuje przyjmowanie zgłoszeń bez zmiany kodu.
Token wygasa w terminie ustawionym przy tworzeniu — wtedy trzeba go odnowić i ustawić sekret ponownie.

Klasyfikacja zgłoszeń przez model (`triage.yml`, `tools/triage/`) jest uruchamiana **tylko ręcznie**:
Actions → „Triage zgłoszeń” → Run workflow → numer issue (wymaga sekretu `COPILOT_PAT`). Model tylko nadaje
etykiety i komentarz; decyzję podejmuje operator. Więcej: [wiki → Zgłoszenia (backend)](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/wiki/Zgloszenia-backend).

## Automatyzacje (GitHub Actions)

Sekrety workflowów: `SNAPSHOT_DEPLOY_KEY` (klucz SSH do wypchnięcia snapshotu) i `COPILOT_PAT` (tylko triage).
Akcje są przypięte do SHA. Gałąź `main` jest chroniona: zmiany trafiają przez pull request po zielonym CI
(checki `check` i `migracje`); jedyne obejście to klucz wdrożeniowy snapshotu. Scalenie do `main` publikuje
stronę i wykonuje migracje, więc CI jest ostatnią bramką przed produkcją.

| Workflow | Kiedy | Co robi |
|---|---|---|
| `ci.yml` | push do `main`, pull request | składnia, walidacja snapshotu, testy, build; osobny job: migracje na czystym Postgresie (dwa przebiegi) + seed |
| `deploy.yml` | push do `main`, ręcznie | build przetestowanego commitu i publikacja na GitHub Pages |
| `snapshot.yml` | co noc 03:15 UTC, ręcznie | eksport bazy do `public/data.json` i commit przy zmianie; przy spadku liczby danych lub danych spoza limitów kończy się błędem i niczego nie nadpisuje |
| `healthcheck.yml` | co 10 min, ręcznie | strona, snapshot, baza, funkcja zgłoszeń i cache kafli; po kolejnych nieudanych kontrolach issue `awaria` przypisane do opiekuna, zamykane po przywróceniu |
| `e2e.yml` | po publikacji, co noc 03:30 UTC, ręcznie | testy E2E na żywej stronie; raport HTML jako artefakt |
| `triage.yml` | tylko ręcznie (numer issue) | klasyfikacja zgłoszenia przez model, etykiety i komentarz dla operatora |

`dependabot.yml` co tydzień proponuje aktualizacje zależności npm i akcji. Więcej:
[wiki → GitHub Actions](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/wiki/GitHub-Actions), procedury awaryjne: [wiki → Runbooki](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/wiki/Runbooki).

## Jak pomóc

Błędy i propozycje: [Issues](https://github.com/pzw-rzeszow/mapa-wod-pzw-rzeszow/issues) albo pull request.
Danych merytorycznych (zasady, powierzchnie, granice) nie zmieniamy bez weryfikacji z oficjalnym wykazem PZW.

Znane ograniczenia danych (szczegóły w Issues):

- część zbiorników (`a: 1`) ma pinezkę w środku miejscowości, bo wykaz podaje tylko nazwę i gminę;
  propozycje akwenów z BDOT10k są w `public/kandydaci-zbiorniki.json`, a wybór wymaga wiedzy lokalnej;
- nazewnictwo cieków w BDOT10k bywa inne niż w wykazie (np. „Stobnica” / „Stopnica”);
- granice obwodów na rzekach są orientacyjne.

## Licencja i źródła

- Kod: [MIT](LICENSE).
- Dane o łowiskach: opracowane na podstawie oficjalnego wykazu wód [Okręgu PZW w Rzeszowie](https://rzeszow.pzw.pl/).
- Dane przestrzenne (podkłady, przebiegi rzek, kontury zbiorników): [Główny Urząd Geodezji i Kartografii](https://www.geoportal.gov.pl/),
  państwowy zasób geodezyjny i kartograficzny — bezpłatne do ponownego wykorzystania, wymagane podanie źródła.
