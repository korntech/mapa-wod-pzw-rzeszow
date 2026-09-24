# Mapa wód PZW — Okręg Rzeszów

Interaktywna mapa łowisk Polskiego Związku Wędkarskiego Okręgu w Rzeszowie, opracowana na podstawie
oficjalnego „Wykazu wód PZW Okręgu w Rzeszowie udostępnionych do wędkowania”.

**Mapa: <https://korntech.github.io/mapa-wod-pzw-rzeszow/>**

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
Projekt jest niezależny i nie jest formalnie związany z PZW.

## Jak to działa

| Element | Rozwiązanie |
|---|---|
| Strona | statyczna (Vite + Leaflet) na GitHub Pages |
| Dane łowisk | baza Supabase (tabele `zbiorniki`, `rivers`, `granice`): publiczny odczyt, zapis tylko dla operatorów z allow-listy |
| Snapshot | `public/data.json` — nocna kopia bazy w repozytorium; mapa wczytuje snapshot, a następnie nadpisuje go danymi z bazy (każdą warstwę osobno), więc działa także przy niedostępnej bazie |
| Podkłady i geometrie | usługi WMTS Geoportalu (EPSG:2180) oraz przebiegi rzek i kontury zbiorników z BDOT10k (GUGiK) |
| Panel operatora | `admin.html` — logowanie e-mail + hasło (Supabase Auth), edycja pinezek, przebiegów rzek i atrybutów |
| Zgłoszenia błędów | formularz na mapie → funkcja Supabase `zglos-blad` → issue w tym repozytorium (bez konta GitHub) |

W czasie działania strona łączy się wyłącznie z Geoportalem GUGiK i własną bazą (wymusza to CSP w buildzie).

## Uruchomienie lokalne

Wymagany Node 20+.

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # wersja produkcyjna do dist/
npm run preview    # podgląd dist/ pod ścieżką z config.json
npm test           # testy (walidacja zgłoszeń, formularz)
npm run check      # składnia skryptów, walidacja snapshotu, testy (CI robi to samo, plus build)
```

Po przejściu na własną domenę ustaw `site.basePath` i `site.url` w `config.json`
(alternatywnie `PZW_BASE=/` przy budowaniu).

## Struktura repozytorium

| Ścieżka | Zawartość |
|---|---|
| `index.html`, `admin.html`, `wykaz.html` | strony: mapa publiczna, panel operatora, wykaz do druku |
| `src/` | logika stron (`main.js`, `admin.js`, `wykaz.js`), warstwa danych (`data.js`), układ współrzędnych i podkłady (`crs.js`, `basemaps.js`), obliczenia (`geo.js`), dostęp do konfiguracji (`config.js`) |
| `public/data.json` | snapshot bazy (odświeżany co noc) |
| `public/kandydaci-zbiorniki.json` | propozycje akwenów z BDOT10k dla zbiorników o lokalizacji przybliżonej (używane w panelu) |
| `config.json` | cała konfiguracja (patrz niżej) |
| `db/` | schemat bazy i migracje |
| `supabase/functions/` | funkcja `zglos-blad` (zgłoszenia błędów → GitHub Issues) |
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
| `map` | środek i poziomy zoomu, układ współrzędnych i siatka kafli |
| `basemaps` | adres usługi WMTS, warstwy podkładów, podkład domyślny mapy i panelu, komunikat awaryjny |
| `links` | linki zewnętrzne: wykaz PZW, repozytorium, instrukcja, szablony nawigacji, nazwa funkcji zgłoszeń `report.function` i zapasowy formularz `report.issues` |

Klucz `anonKey` jest z założenia jawny (trafia do przeglądarki); o bezpieczeństwie zapisu decydują reguły RLS
w bazie (`db/schema.sql`). Przy pustej sekcji `supabase` mapa działa wyłącznie na snapshocie, a panel
operatora pokazuje komunikat o braku konfiguracji.

## Baza danych i panel operatora

Pierwsze uruchomienie:

1. Załóż projekt na <https://supabase.com>; z **Project Settings → API** skopiuj adres projektu i klucz
   publiczny do sekcji `supabase` w `config.json`.
2. W **SQL Editor** uruchom [`db/schema.sql`](db/schema.sql) (tabele, allow-lista `operators`, RLS, uprawnienia).
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

Pliki `db/migrate-*.sql` to jednorazowe zmiany dla **istniejącej** bazy (na świeżej bazie wystarczy
`schema.sql` + seed). Uruchamia się je raz, w kolejności dat, w SQL Editor; po uruchomieniu na bazie
produkcyjnej plik migracji usuwa się z repozytorium (historia zostaje w git).

Zabezpieczenia w bazie (`db/schema.sql`): publiczny odczyt przez RLS, zapis wyłącznie dla potwierdzonych
kont z allow-listy `operators` po drugim składniku (MFA), ograniczenia CHECK na długości pól, współrzędne i kształt geometrii oraz
tabela `historia_zmian` (kto, kiedy, stan przed i po), niedostępna z API — do odtwarzania danych po pomyłce.

Panel: `…/admin.html`. Obsługę panelu opisuje [instrukcja operatora](docs/instrukcja-operatora.md).
Zmiany zapisane w panelu są widoczne na mapie po odświeżeniu strony.

## Zgłoszenia błędów z mapy

„Zgłoś błąd” w popupie łowiska i w oknie „O mapie” otwiera formularz (zbiornik lub rzeka, opis,
opcjonalny kontakt). Stronę obsługuje funkcja Supabase [`supabase/functions/zglos-blad`](supabase/functions/zglos-blad/index.ts):
sprawdza treść (ścisły schemat pól), **atomowo rezerwuje limit** w bazie (funkcja SQL
`zgloszenie_rezerwuj` pod blokadą — wpis w tabeli `zgloszenia` powstaje przed issue), a dopiero potem
zakłada issue z etykietą `zgłoszenie` i uzupełnia wpis numerem issue. Żądanie, które nie zwiększyło
licznika, nigdy nie tworzy issue; nieudane założenie issue zostawia wpis ze statusem `blad`. Gdy funkcja
nie odpowiada, formularz pokazuje zapasowy link do issue na GitHubie z gotową treścią. Walidacja i treść
issue są w module [`zgloszenie.js`](supabase/functions/zglos-blad/zgloszenie.js) współdzielonym ze stroną,
logika obsługi w [`obsluga.js`](supabase/functions/zglos-blad/obsluga.js) (testy: `npm test`).
Opis zgłaszającego trafia do issue jako blok kodu (bez Markdown, linków i wzmianek); **kontakt nie jest
publikowany** — zostaje w tabeli `zgloszenia`, dostępnej operatorom w panelu Supabase.

Wdrożenie funkcji (raz): token GitHub *fine-grained* ograniczony do tego repozytorium
z uprawnieniem **Issues: Read and write**, sekrety i deploy przez CLI Supabase:

```bash
npx supabase login
npx supabase secrets set --project-ref <ref> GITHUB_TOKEN=github_pat_… \
  GITHUB_REPO=korntech/mapa-wod-pzw-rzeszow \
  MAP_URL=https://korntech.github.io/mapa-wod-pzw-rzeszow/ \
  ALLOWED_ORIGINS=https://korntech.github.io
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

Poza triage żaden workflow nie wymaga sekretów — odczyt bazy używa klucza publicznego z `config.json`;
`triage.yml` używa sekretu `COPILOT_PAT` tylko w kroku klasyfikacji. Akcje są przypięte do SHA, a globalny
Copilot CLI do konkretnej wersji. Publikacja (`deploy.yml`) buduje dokładnie ten commit, który przeszedł
`npm run check` w tym samym przebiegu — nieudane testy blokują wdrożenie.

| Workflow | Kiedy | Co robi |
|---|---|---|
| `ci.yml` | push do `main`, pull request | składnia skryptów, walidacja snapshotu, testy, build |
| `deploy.yml` | push do `main`, po udanym snapshocie, ręcznie | build i publikacja `dist/` na GitHub Pages (Settings → Pages → Source: *GitHub Actions*) |
| `snapshot.yml` | co noc 03:15 UTC, ręcznie | eksport bazy do `public/data.json` i commit przy zmianie; utrzymuje projekt Supabase aktywny. Gdy baza zwraca mniej danych niż snapshot albo dane spoza limitów, job kończy się błędem i niczego nie nadpisuje |
| `healthcheck.yml` | co 6 h, ręcznie | sprawdza stronę i bazę; przy awarii zakłada issue z etykietą `awaria` i zamyka je, gdy kontrola przejdzie |
| `triage.yml` | nowe issue `zgłoszenie`, ręcznie | klasyfikacja zgłoszenia przez model, etykiety i komentarz dla operatora |

`dependabot.yml` co tydzień proponuje aktualizacje zależności npm i akcji.

## Jak pomóc

Błędy i propozycje: [Issues](https://github.com/korntech/mapa-wod-pzw-rzeszow/issues) albo pull request.
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
