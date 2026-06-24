# Panel operatora PZW — edycja łowisk (Supabase + GitHub Pages)

Data: 2026-06-24

## Cel

Umożliwić wyznaczonym operatorom Okręgu PZW Rzeszów samodzielną edycję łowisk
(zbiorników) na żywo — w szczególności poprawę lokalizacji punktów oznaczonych jako
przybliżone (`a:1`, środek miejscowości zamiast akwenu) — bez płatnego serwera.

## Decyzje (zatwierdzone przez użytkownika)

- **Zakres edycji:** pełna edycja zbiorników (punkt, nazwa, powierzchnia, typ, zasady)
  + dodawanie i usuwanie. Rzeki i granice na razie poza zakresem (zostają w `data.json`).
- **Logowanie:** konta na zaproszenie, email + hasło. Rejestracja publiczna wyłączona.
- **Źródło danych publicznej mapy:** zbiorniki na żywo z Supabase; przy braku
  połączenia awaryjnie z `data.json`.

## Architektura

Wszystko statyczne na GitHub Pages (0 zł) + Supabase w darmowym progu (0 zł).
Klucz `anon` Supabase jest jawny z założenia — zapisu pilnują reguły Row Level Security.

| Plik | Rola |
|---|---|
| `index.html` | publiczna mapa — zbiorniki z Supabase (fallback `data.json`), rzeki/granice z `data.json` |
| `admin.html` | panel operatora — logowanie, mapa z przeciąganiem pinezek, formularz, dodawanie/usuwanie |
| `config.js` | `SUPABASE_URL` + klucz `anon` (jawne, commitowane) |
| `db/schema.sql` | tabela `zbiorniki` + reguły RLS |
| `db/seed.mjs` | jednorazowe załadowanie 49 zbiorników z `data.json` do bazy |

## Model danych

Tabela `zbiorniki`:

| Kolumna | Typ | Uwaga |
|---|---|---|
| `id` | bigint identity PK | |
| `n` | text not null | nazwa |
| `lat`, `lon` | double precision not null | współrzędne |
| `ha` | text | powierzchnia (jak w wykazie, np. "3,00" lub "—") |
| `t` | text | typ |
| `r` | text | zasady |
| `a` | smallint default 0 | 1 = lokalizacja przybliżona |
| `updated_at` | timestamptz default now() | aktualizowane triggerem przy UPDATE |

Mapowanie na format aplikacji: `{n, p:[lat,lon], ha, t, r, a}`.

## Bezpieczeństwo (RLS)

- `select` — rola `anon` (publiczny odczyt).
- `insert` / `update` / `delete` — rola `authenticated` (zalogowany operator).
- Rejestracja publiczna w Supabase Auth wyłączona; konta zakłada administrator.

## Panel operatora (`admin.html`)

- Logowanie email + hasło (Supabase Auth). Po wylogowaniu brak dostępu do edycji.
- Lista + mapa zbiorników; klik → wybór, przeciąganie markera ustawia nowe `lat/lon`
  i automatycznie zeruje `a` (lokalizacja przestaje być przybliżona).
- Formularz: nazwa, powierzchnia, typ, zasady, znacznik „przybliżone".
- „➕ Dodaj łowisko" (klik na mapie ustawia punkt), „🗑 Usuń".
- Zapis przez `@supabase/supabase-js` → publiczna mapa pokazuje zmianę po odświeżeniu.

## Stack

Vanilla JS + Leaflet 1.9.4 + `@supabase/supabase-js` (CDN). Bez kroku budowania —
spójnie z obecnym jednoplikowym stylem projektu.

## Konfiguracja (jednorazowo, po stronie użytkownika)

1. Założyć darmowy projekt Supabase.
2. Wkleić `Project URL` i klucz `anon` do `config.js`.
3. Uruchomić `db/schema.sql` w SQL Editor.
4. Uruchomić `node db/seed.mjs` (ładuje obecne dane).
5. W Authentication wyłączyć publiczną rejestrację i założyć konta operatorom.

## Weryfikacja

- `node --check` skryptów JS, walidacja `schema.sql` (parsowalność), poprawny JSON.
- Publiczna mapa działa bez skonfigurowanego Supabase (fallback `data.json`).
- Po konfiguracji: logowanie, edycja punktu, zapis, odczyt na publicznej mapie.

## Poza zakresem

Edycja rzek i granic przez panel, role/uprawnienia, historia zmian, własna domena —
możliwe rozszerzenia w kolejnych iteracjach.
