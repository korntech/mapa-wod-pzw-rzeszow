# Mapa wód PZW — Okręg Rzeszów

Interaktywna mapa łowisk Polskiego Związku Wędkarskiego Okręgu w Rzeszowie, opracowana na podstawie
oficjalnego „Wykazu wód PZW Okręgu w Rzeszowie udostępnionych do wędkowania”.

**Mapa: <https://pzw-rzeszow.github.io/mapa-wod-pzw-rzeszow/>**

Na mapie są:

- **zbiorniki** (stawy, wyrobiska, zbiorniki zaporowe) z powierzchnią, typem i zasadami połowu,
- **odcinki rzek** — wody nizinne oraz kraina pstrąga i lipienia, z opisem granic obwodów i zasadami,
- **punkty granic obwodów** i punkty orientacyjne,
- wyszukiwarka (działa też bez polskich znaków), filtry warstw, a pod „Więcej filtrów” rodzaj zbiornika
  (zaporowe / wyrobiska pożwirowe / stawy / inne), „tylko NO-KILL” i obwód rybacki; lista boczna,
  „Najbliżej mnie” (sortowanie wg odległości) i „Nawiguj” (aplikacja nawigacyjna telefonu),
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
| Dane łowisk | baza Supabase (tabele `zbiorniki`, `rivers`, `granice`): publiczny odczyt, zapis tylko dla operatorów z allow-listy |
| Snapshot | `public/data.json` — nocna kopia bazy w repozytorium; mapa wczytuje snapshot, a następnie nadpisuje go danymi z bazy (każdą warstwę osobno), więc działa także przy niedostępnej bazie |
| Podkłady i geometrie | usługi WMTS Geoportalu (EPSG:2180) oraz przebiegi rzek i kontury zbiorników z BDOT10k (GUGiK) |
| Cache kafli | Cloudflare Worker + R2 (`cloudflare/kafle/`) między przeglądarką a Geoportalem: kafel raz pobrany jest oddawany z Warszawy w ~50 ms i przeżywa awarie Geoportalu; włączany polem `basemaps.kafleUrl` w `config.json` |
| Pamięć podręczna | service worker `public/sw.js`: kafle Geoportalu trzymane w przeglądarce (do 1500 kafli, 30 dni, najstarsze usuwane), `data.json` i strony „najpierw sieć, potem kopia”, skrypty Vite „najpierw kopia”; obejrzany fragment mapy wyświetla się także bez zasięgu — patrz niżej |
| Panel operatora | `admin.html` — logowanie e-mail + hasło + drugi składnik TOTP (Supabase Auth), edycja pinezek, przebiegów rzek i atrybutów; każda zmiana trafia do `historia_zmian` |
| Zgłoszenia błędów | formularz na mapie → funkcja Supabase `zglos-blad` → issue w tym repozytorium (bez konta GitHub) |

W czasie działania strona łączy się wyłącznie z Geoportalem GUGiK i własną bazą (wymusza to CSP w buildzie).

### Kafle podkładu i praca przy słabym zasięgu

Serwer WMTS Geoportalu bywa niestabilny: część żądań kończy się błędem HTTP 500, a Leaflet sam nie ponawia
nieudanego kafla — stąd szare pola na mapie. Mapa robi więc trzy rzeczy (`src/basemaps.js`, `public/sw.js`):

- **ponawia** nieudany kafel (dwie próby z rosnącym odstępem, service worker dodatkowo raz przy błędzie serwera);
  dopiero po wyczerpaniu prób liczy błąd do przełączenia na podkład zapasowy;
- **buforuje kafle** w service workerze (Cache API): kafel raz pobrany jest pokazywany z pamięci przeglądarki
  przez 30 dni bez pytania serwera, także bez zasięgu. Limit 1500 kafli (rzędu 100 MB przy pełnych kaflach
  512 px), najstarsze wpisy są usuwane. Regulamin Geoportalu pozwala na taki bufor (kafle mają nagłówek
  `Cache-Control: max-age=2592000` i CORS `*`) — w przeciwieństwie do polityki serwerów OSM, które zabraniają
  masowego pobierania;
- wczytuje kafle dopiero po zakończeniu zoomu i (na telefonie) po zakończeniu przesuwania — mniej porzuconych
  żądań na 3G — oraz trzyma większy bufor kafli wokół widoku; mapa ma tło w kolorze podkładu i zasięg
  przesuwania ograniczony do Okręgu z marginesem (`config.json` → `map.bounds`), więc brzeg treści Geoportalu
  nie wygląda jak błąd.

To nie jest jeszcze pełny tryb offline (nic nie jest pobierane z wyprzedzeniem) — kolejny etap to PWA
z pobraniem wybranego obszaru. Wyczyszczenie bufora: w przeglądarce **usuń dane witryny** (Chrome: kłódka
w pasku adresu → Ustawienia witryny → Usuń dane; Safari: Ustawienia → Safari → Zaawansowane → Dane witryn),
a w kodzie — podniesienie `WERSJA` w `public/sw.js`, które przy najbliższej wizycie usuwa stare wpisy.
Service worker nie dotyka żądań do bazy (Supabase) ani formularza zgłoszeń. Testy jego reguł: `src/sw.test.mjs`.

## Uruchomienie lokalne

Wymagany Node 20+.

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # wersja produkcyjna do dist/
npm run preview    # podgląd dist/ pod ścieżką z config.json
npm test           # testy: walidacja i obsługa zgłoszeń, limit body, rodzaje zbiorników, filtry, formularz, reguły service workera
npm run check      # składnia skryptów, walidacja snapshotu, testy (CI robi to samo, plus build i próbę migracji)
npm run e2e:przegladarki  # jednorazowo: Chromium, Firefox, WebKit dla Playwrighta
npm run e2e        # testy E2E na żywej stronie w 8 urządzeniach (inny adres: E2E_URL=https://… npm run e2e)
npm run e2e:raport # raport HTML ostatniego przebiegu (z CI: artefakt „raport-e2e”)
```

**Testy E2E** (`tests/e2e/`, Playwright) otwierają stronę tak jak wędkarze: komputer (Chrome, Firefox,
Safari), iPhone 15 i SE, iPad (WebKit — silnik każdej przeglądarki na iOS), Pixel 7 i Galaxy S9+ (Chrome).
Sprawdzają: dane z bazy i zapas ze snapshotu, podkład przez cache kafli, zoom i przesuwanie, układ
na małym ekranie, wyszukiwarkę (bez polskich znaków), filtry i „Wyczyść”, popup z nawigacją
(Android → `geo:`, reszta → Apple Maps), „Najbliżej mnie” (pozycja symulowana), formularz zgłoszeń
(funkcja **podmieniona** — testy nic nie wysyłają; service worker wyłączony, bo w WebKit omija podmianę),
awarię podkładu i cache kafli, wolne łącze 3G i powrót bez sieci (dwa ostatnie tylko w Chromium —
ograniczenie Playwrighta). Ręcznie trzeba sprawdzić przeglądarki w aplikacjach (Facebook, Messenger),
Samsung Internet i tryb offline na iPhonie.

Migracje bazy można sprawdzić lokalnie na czystym Postgresie tak jak robi to CI:
`psql -f db/ci-supabase-stub.sql`, potem każdy plik z `supabase/migrations/` w kolejności
(`--single-transaction`), na końcu `npm run seed-sql | psql`.

Po przejściu na własną domenę ustaw `site.basePath` i `site.url` w `config.json`
(alternatywnie `PZW_BASE=/` przy budowaniu).

## Struktura repozytorium

| Ścieżka | Zawartość |
|---|---|
| `index.html`, `admin.html`, `wykaz.html` | strony: mapa publiczna, panel operatora, wykaz do druku |
| `src/` | logika stron (`main.js`, `admin.js`, `wykaz.js`), warstwa danych (`data.js`), układ współrzędnych i podkłady (`crs.js`, `basemaps.js`), obliczenia (`geo.js`), dostęp do konfiguracji (`config.js`) |
| `public/data.json` | snapshot bazy (odświeżany co noc) |
| `public/sw.js` | service worker: pamięć podręczna kafli Geoportalu i plików strony (kopiowany do `dist/` bez hasha) |
| `public/kandydaci-zbiorniki.json` | propozycje akwenów z BDOT10k dla zbiorników o lokalizacji przybliżonej (używane w panelu) |
| `config.json` | cała konfiguracja (patrz niżej) |
| `supabase/migrations/` | schemat bazy i wszystkie zmiany, w kolejności znaczników czasu; wykonywane na produkcji przez integrację Supabase z GitHubem po scaleniu do `main` |
| `supabase/functions/` | funkcja `zglos-blad` (zgłoszenia błędów → GitHub Issues) |
| `supabase/config.toml` | identyfikator projektu i ustawienia funkcji |
| `cloudflare/kafle/` | Worker cache kafli Geoportalu (`worker.js`, testy, `wrangler.toml`) — [opis niżej](#cache-kafli-geoportalu) |
| `db/` | narzędzia pomocnicze: test macierzy uprawnień, atrapa środowiska Supabase dla CI |
| `SECURITY.md` | prywatna ścieżka zgłaszania luk bezpieczeństwa |
| `tools/snapshot/` | eksport bazy do snapshotu, walidacja snapshotu, generator SQL zasilającego bazę |
| `tools/bdot/` | pipeline geometrii z BDOT10k — [opis](tools/bdot/README.md) |
| `tools/qa/` | porównanie danych z oficjalnym wykazem PZW (PDF, OCR) — [opis](tools/qa/README.md) |
| `tools/triage/` | klasyfikacja zgłoszeń z formularza (prompt, etykiety, komentarz) |
| `docs/instrukcja-operatora.md` | instrukcja obsługi panelu dla operatora Okręgu |
| `.github/workflows/` | CI, publikacja, snapshot, healthcheck |

Format snapshotu (`public/data.json`):

| Klucz | Zawartość | Pola rekordu |
|---|---|---|
| `zb` | zbiorniki | `n` nazwa, `p` [lat, lon], `ha` powierzchnia, `t` typ (opis z wykazu), `k` rodzaj `"zaporowy"` / `"pozwirowy"` / `"staw"` / `"inny"`, `nk` 1 = NO-KILL, `o` obwód rybacki (może być pusty), `r` zasady, `a` 1 = lokalizacja przybliżona |
| `rivers` | odcinki rzek | `n` nazwa, `c` `"niz"` / `"gor"`, `o` obwód, `d` opis granic, `r` zasady, `pts` [[lat, lon], …] |
| `granice` | granice obwodów / punkty orientacyjne | `n` nazwa, `p` [lat, lon], `d` opis |
| `meta` | źródła danych, uwaga licencyjna, `snapshot` — data eksportu (pokazywana na stronie jako „Stan danych”) |

Słownik rodzajów zbiornika i reguła wyprowadzania `k`/`nk` z opisu `t` (dla rekordów bez tych pól) są
w `src/zbiorniki-typ.js`; korzysta z niego mapa, panel, wykaz do druku i skrypty snapshotu.

## Konfiguracja (`config.json`)

| Sekcja | Zawartość |
|---|---|
| `site` | ścieżka bazowa i adres publiczny strony |
| `supabase` | adres projektu, klucz publiczny (`anonKey`), nazwy tabel |
| `snapshot` | nazwy plików snapshotu i kandydatów, obrys i progi walidacji, metadane źródeł |
| `map` | środek i poziomy zoomu, zasięg przesuwania (`bounds`: margines wokół obrysu danych i „lepkość” krawędzi), układ współrzędnych i siatka kafli |
| `basemaps` | adres usługi WMTS, warstwy podkładów, podkład domyślny mapy i panelu, komunikat awaryjny |
| `links` | linki zewnętrzne: wykaz PZW, repozytorium, instrukcja, szablony nawigacji, nazwa funkcji zgłoszeń `report.function` i zapasowy formularz `report.issues` |

Klucz `anonKey` jest z założenia jawny (trafia do przeglądarki); o bezpieczeństwie zapisu decydują reguły RLS
w bazie (`supabase/migrations/`). Przy pustej sekcji `supabase` mapa działa wyłącznie na snapshocie, a panel
operatora pokazuje komunikat o braku konfiguracji.

## Baza danych i panel operatora

Pierwsze uruchomienie:

1. Załóż projekt na <https://supabase.com>; z **Project Settings → API** skopiuj adres projektu i klucz
   publiczny do sekcji `supabase` w `config.json`.
2. Wykonaj migracje z `supabase/migrations/` — albo przez CLI (`npx supabase link --project-ref <ref>`,
   `npx supabase db push`), albo wklejając pliki po kolei w **SQL Editor**. Tworzą tabele, allow-listę
   `operators`, RLS, funkcję rezerwacji zgłoszeń i zadanie retencji.
3. Zasil bazę danymi ze snapshotu: `npm run seed-sql > seed.sql`, wynik uruchom w SQL Editor.
4. W **Authentication** wyłącz publiczną rejestrację; konta operatorów (e-mail + hasło) zakładaj w **Authentication → Users**.
   W **Authentication → Multi-Factor** upewnij się, że **TOTP** jest włączone (domyślnie jest).
5. Każdego operatora dopisz do allow-listy — samo konto nie wystarcza:
   ```sql
   insert into public.operators (email) values ('operator@przyklad.pl');
   ```
6. Operator przy pierwszym logowaniu konfiguruje w panelu **drugi składnik** (aplikacja uwierzytelniająca,
   TOTP). Reguły RLS wymagają sesji na poziomie `aal2` — samo hasło pozwala oglądać, ale nie zapisywać.
   Utrata telefonu: w **Authentication → Users → konto → Factors** usuń składnik, operator skonfiguruje nowy.

`db/test-uprawnienia.sql` sprawdza macierz uprawnień (anon, zalogowany spoza listy, operator bez i z MFA,
operator zablokowany × odczyt, tabele wewnętrzne, zapis) — uruchom w SQL Editor na bazie testowej po podmianie
dwóch adresów e-mail; kończy się `rollback`, więc niczego nie zmienia. Oczekiwane: same „✓”.

### Zmiany w bazie (migracje)

Każda zmiana schematu, reguł RLS czy funkcji SQL to nowy plik `supabase/migrations/<RRRRMMDDGGMMSS>_nazwa.sql`
(idempotentny — `if not exists`, `create or replace`, `drop … if exists` — bez własnych `begin`/`commit`,
bo CLI wykonuje każdy plik w jednej transakcji). Droga na produkcję:

1. pull request → CI (`ci.yml`, job `migracje`) wykonuje **wszystkie** migracje na czystym Postgresie,
   drugi raz dla sprawdzenia idempotencji, i zasila bazę snapshotem;
2. scalenie do `main` → **integracja Supabase z GitHubem** (Project Settings → Integrations → GitHub,
   „Deploy to production”, gałąź `main`) wykonuje na produkcji tylko migracje, których nie ma jeszcze
   w `supabase_migrations.schema_migrations`.

Migracje z historii projektu (sprzed integracji) są w tej tabeli oznaczone jako wykonane, więc nie
uruchomią się ponownie. Ręczne wklejanie SQL do edytora produkcji nie jest już potrzebne.

Zabezpieczenia w bazie (`supabase/migrations/`): publiczny odczyt przez RLS, zapis wyłącznie dla potwierdzonych
kont z allow-listy `operators` po drugim składniku (MFA), ograniczenia CHECK na długości pól, współrzędne i kształt geometrii oraz
tabela `historia_zmian` (kto, kiedy, stan przed i po), niedostępna z API — do odtwarzania danych po pomyłce.

Panel: `…/admin.html`. Obsługę panelu opisuje [instrukcja operatora](docs/instrukcja-operatora.md).
Zmiany zapisane w panelu są widoczne na mapie po odświeżeniu strony.

### Kopia zapasowa i odtwarzanie

Nocny snapshot (`public/data.json`, historia w git) jest kopią treści łowisk. Odtworzenie po pomyłce:
`npm run seed-sql > seed.sql` (z wybranej wersji snapshotu, np. `git show <commit>:public/data.json > kopia.json`
i `node tools/snapshot/seed-sql.mjs kopia.json`), wynik uruchom w SQL Editor — **czyści i nadpisuje wszystkie
trzy tabele** łowisk. Pojedynczy rekord można cofnąć z `historia_zmian` (stan przed i po każdej zmianie).
Kont operatorów i tabeli `zgloszenia` snapshot nie obejmuje — są tylko w Supabase.

## Cache kafli Geoportalu

Geoportal GUGiK oddaje kafle w 0,4–2 s i miewa „złe minuty”, w których losowe żądania kończą się
HTTP 500 (wtedy pola mapy zostają szare mimo ponowień). `cloudflare/kafle/worker.js` to własna
warstwa pośrednia na Cloudflare (plan bezpłatny: 100 tys. żądań/dobę, R2 10 GB — kilkukrotnie
powyżej ruchu Okręgu): przeglądarka pyta Workera **tym samym adresem WMTS** co Geoportal
(zmienia się tylko host), Worker oddaje kafel z pamięci brzegowej albo z R2, a przy braku pobiera
go z Geoportalu (z ponowieniami), zapisuje i oddaje. Cache buduje się sam z ruchu; kafel żyje
30 dni. Worker przyjmuje tylko `GetTile` dla trzech usług z listy i tylko ze stron z
`ALLOWED_ORIGINS`, więc nie jest otwartym proxy. Buforowanie danych PZGiK jest dozwolone
(w odróżnieniu od kafli OSM); źródło pozostaje w atrybucji mapy.

Wdrożenie (raz; Wrangler — CLI Cloudflare — jest w `devDependencies`, skrypty wskazują
`cloudflare/kafle/wrangler.toml`, więc uruchamia się je z katalogu głównego):

```bash
npm run kafle:login    # logowanie w przeglądarce (token trafia do ~/.wrangler, nie do repo)
npm run kafle:bucket   # tworzy bucket R2 `pzw-kafle`
npm run kafle:deploy   # wgrywa Workera; wypisze adres, np. https://pzw-kafle.<konto>.workers.dev
npm run kafle:tail     # (opcjonalnie) podgląd logów Workera na żywo
```

Potem w `config.json` → `basemaps.kafleUrl` = `https://pzw-kafle.<konto>.workers.dev/wss/service/`
(z ukośnikiem), build i publikacja. Puste pole = kafle prosto z Geoportalu (stan awaryjny, bez cache).
Healthcheck sprawdza `<worker>/zdrowie`; nagłówek `X-Kafle: edge|r2|origin` w odpowiedzi mówi,
skąd przyszedł kafel. Testy: `node --test cloudflare/kafle/` (w `npm test`).

## Zgłoszenia błędów z mapy

„Zgłoś uwagę” w popupie łowiska i w oknie „O mapie” otwiera formularz „Zgłoś uwagę do mapy”: woda
z listy (zbiornik lub rzeka — nazwa i współrzędne z danych mapy) **albo pozycja „Inne — brakujące łowisko
lub uwaga ogólna”** (typ `inne`: zgłaszający wpisuje sam, czego dotyczy zgłoszenie, 2–200 znaków; współrzędne
są `null`), opis (10–2000 znaków), opcjonalny kontakt. Teksty formularza są pisane dla wędkarza, nie
dla dewelopera — bez „issue” czy „repozytorium”; zgłoszenie jest opisane jako „publiczne, widoczne na stronie
projektu”. Stronę obsługuje funkcja Supabase [`supabase/functions/zglos-blad`](supabase/functions/zglos-blad/index.ts):
sprawdza treść (ścisły schemat pól — te same klucze dla każdego typu), **atomowo rezerwuje limit** w bazie (funkcja SQL
`zgloszenie_rezerwuj` pod blokadą — wpis w tabeli `zgloszenia` powstaje przed issue), a dopiero potem
zakłada issue z etykietą `zgłoszenie` i uzupełnia wpis numerem issue. Żądanie, które nie zwiększyło
licznika, nigdy nie tworzy issue; nieudane założenie issue zostawia wpis ze statusem `blad`. Gdy funkcja
nie odpowiada, formularz pokazuje zapasowy link do formularza issue na GitHubie z gotową treścią (nazwany
„Dodaj zgłoszenie bezpośrednio na stronie projektu”, wymaga konta). Walidacja i treść
issue są w module [`zgloszenie.js`](supabase/functions/zglos-blad/zgloszenie.js) współdzielonym ze stroną,
logika obsługi w [`obsluga.js`](supabase/functions/zglos-blad/obsluga.js) (testy: `npm test`).
Opis zgłaszającego trafia do issue jako blok kodu (bez Markdown, linków i wzmianek), a nazwa — w kodzie
liniowym z usuniętymi znakami Markdown, `#` i `@` (przy typie `inne` to również tekst użytkownika); linia
„Współrzędne” pojawia się tylko, gdy są. **Kontakt nie jest publikowany** — zostaje w tabeli `zgloszenia`,
dostępnej operatorom w panelu Supabase. Triage (`tools/triage`) rozpoznaje typ `inne` i nie szuka dla niego
rekordu na mapie.

Typ `inne` wymaga migracji `20260924104542_zgloszenia_inne.sql` (CHECK `typ` rozszerzony o `'inne'`,
kolumny `lat`/`lon` bez `not null`, CHECK `zgloszenia_pola_check`: obie współrzędne `null` tylko przy `inne`,
inaczej obie w zakresie; funkcja `zgloszenie_rezerwuj` bez zmiany podpisu). Kolejność wdrożenia: **najpierw
migracja** (scalenie do `main` → integracja Supabase), **potem deploy funkcji** — stara funkcja z nową bazą
działa, nowa funkcja ze starą bazą odrzuci zgłoszenia `inne` błędem bazy.

Wdrożenie funkcji (raz): token GitHub *fine-grained* ograniczony do tego repozytorium
z uprawnieniem **Issues: Read and write**, sekrety i deploy przez CLI Supabase:

```bash
npx supabase login
npx supabase secrets set --project-ref <ref> GITHUB_TOKEN=github_pat_… \
  GITHUB_REPO=pzw-rzeszow/mapa-wod-pzw-rzeszow \
  MAP_URL=https://pzw-rzeszow.github.io/mapa-wod-pzw-rzeszow/ \
  ALLOWED_ORIGINS=https://pzw-rzeszow.github.io
npx supabase functions deploy zglos-blad --project-ref <ref>
```

`supabase/config.toml` wyłącza dla tej funkcji wymóg JWT (formularz jest publiczny). Token wygasa
w terminie ustawionym przy tworzeniu — wtedy trzeba go odnowić i ustawić sekret ponownie.

Ochrona przed nadużyciami (limity w `zgloszenie.js` → `LIMITY`): 5 zgłoszeń na godzinę z jednego adresu IP,
20 na godzinę i 60 na dobę łącznie, odrzucanie powtórek (to samo łowisko z tego samego adresu albo identyczny
opis w ciągu doby), pole-pułapka dla botów, limit rozmiaru żądania 16 KB. Adresy IP i kontakty są kasowane
po 30 dniach zadaniem `pg_cron` (`zgloszenia-retencja`, codziennie 03:15 UTC; przebiegi i błędy:
`select * from cron.job_run_details order by start_time desc`). Wyłącznik awaryjny: sekret
`ZGLOSZENIA_WSTRZYMANE=1` w funkcji (`npx supabase secrets set …`) zatrzymuje przyjmowanie zgłoszeń bez zmiany
kodu. Klasyfikacja AI (gdy włączona) ma osobny budżet dobowy (`tools/triage/config.json` → `budzetDobowy`);
powyżej niego zgłoszenia zostają bez oceny modelu, ale nadal trafiają do Issues.

## Wstępna klasyfikacja zgłoszeń (AI) — wyłączona, dostępna ręcznie

Na etapie rozruchu zgłoszenia klasyfikuje operator ręcznie (etykiety w Issues); automatyczny
wyzwalacz w `triage.yml` jest zakomentowany, więc treść z formularza nie uruchamia modelu i nie
zużywa limitu Copilota. Klasyfikację można wywołać dla wybranego issue: Actions → „Triage zgłoszeń”
→ Run workflow → numer issue (wymaga sekretu `COPILOT_PAT`). Po przywróceniu wyzwalacza `issues`
workflow uruchamia się przy każdym nowym issue z etykietą `zgłoszenie`: buduje prompt
z treści zgłoszenia, aktualnego rekordu z mapy i kandydatów akwenów z BDOT10k (`tools/triage/prompt.mjs`),
pyta model przez Copilot CLI (`actions/ai-inference`) i nadaje etykiety `kategoria: …` oraz `pewność: …`
wraz z komentarzem „co sprawdzić w panelu” (`tools/triage/apply.mjs`). Model niczego nie zmienia —
decyzję podejmuje operator. Dozwolone kategorie, etykiety, model i treść promptu są w
`tools/triage/config.json`; wartości spoza konfiguracji są odrzucane.

Wymaga sekretu `COPILOT_PAT`: fine-grained personal access token konta z dostępem do Copilota,
uprawnienie **Copilot Requests** (Settings → Developer settings → Personal access tokens).
Bez sekretu `COPILOT_PAT` ręczne uruchomienie kończy się błędem w kroku klasyfikacji — nic więcej się nie dzieje.

## Automatyzacje (GitHub Actions)

Sekrety workflowów: `SNAPSHOT_DEPLOY_KEY` (klucz SSH do wypchnięcia snapshotu) i — tylko przy ręcznym
triage — `COPILOT_PAT`. Odczyt bazy używa klucza publicznego z `config.json`; żaden workflow nie ma prawa
zapisu tokenem Actions. Akcje są przypięte do SHA, a globalny
Copilot CLI do konkretnej wersji. Publikacja (`deploy.yml`) buduje dokładnie ten commit, który przeszedł
`npm run check` w tym samym przebiegu — nieudane testy blokują wdrożenie.

| Workflow | Kiedy | Co robi |
|---|---|---|
| `ci.yml` | push do `main`, pull request | składnia skryptów, walidacja snapshotu, testy, build; osobny job: wszystkie migracje na czystym Postgresie (dwa przebiegi) + seed |
| `deploy.yml` | push do `main` (także commit snapshotu), ręcznie | build i publikacja `dist/` na GitHub Pages (Settings → Pages → Source: *GitHub Actions*) |
| `snapshot.yml` | co noc 03:15 UTC, ręcznie | eksport bazy do `public/data.json` i commit przy zmianie, wypychany kluczem wdrożeniowym (sekret `SNAPSHOT_DEPLOY_KEY`, klucz publiczny w Deploy keys z prawem zapisu; „Deploy keys” w liście obejść reguły `main`); utrzymuje projekt Supabase aktywny. Gdy baza zwraca mniej danych niż snapshot albo dane spoza limitów, job kończy się błędem i niczego nie nadpisuje |
| `healthcheck.yml` | co 10 min, ręcznie | sprawdza stronę, snapshot, bazę i funkcję zgłoszeń (2 próby); **alarm** = issue `awaria` przypisane do opiekuna (e-mail/push z GitHuba) po 3 kolejnych nieudanych kontrolach (≈30 min), zamykane po przywróceniu z czasem trwania awarii; progi w `config.json` → `healthcheck` |
| `e2e.yml` | po każdej publikacji, co noc 03:30 UTC, ręcznie | testy E2E (Playwright) na żywej stronie w 8 urządzeniach; raport HTML jako artefakt |
| `triage.yml` | nowe issue `zgłoszenie`, ręcznie | klasyfikacja zgłoszenia przez model, etykiety i komentarz dla operatora |

`dependabot.yml` co tydzień proponuje aktualizacje zależności npm i akcji.

### Monitoring dostępności

Healthcheck w Actions wykrywa awarię strony, snapshotu, bazy i funkcji zgłoszeń, ale nie awarię samego
GitHuba (Pages i Actions padają razem). Jako niezależną drugą warstwę zaleca się zewnętrzny monitor
(np. UptimeRobot w planie bezpłatnym: kontrola co 5 min, powiadomienie e-mail/aplikacja) ustawiony na
adres mapy i na `…/data.json`. Opiekun otrzymuje powiadomienia GitHuba o przypisanych issue — w profilu
GitHub (Settings → Notifications) warto mieć włączone „Assigned” dla e-maila i aplikacji mobilnej.
Czas reakcji z oferty (3 dni robocze) liczy się od alarmu.

Gałąź `main` jest chroniona regułą (ruleset): zmiany trafiają przez pull request po zielonym CI
(checki `check` i `migracje`), bez force-push i bez usuwania gałęzi; jedyne obejście to klucz wdrożeniowy
snapshotu. Scalenie do `main` uruchamia publikację strony i — przez integrację
Supabase — migracje bazy, dlatego CI jest ostatnią bramką przed produkcją.

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
