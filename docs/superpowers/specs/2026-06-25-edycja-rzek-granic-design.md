# Edycja rzek (geometria) i granic w panelu operatora

Data: 2026-06-25

## Cel

Rozszerzyć panel operatora o edycję rzek (polilinie — przesuwanie/dodawanie/usuwanie
wierzchołków, przedłużanie, rysowanie nowych) oraz granic obwodów (punkty). Wszystkie
trzy warstwy (zbiorniki, rzeki, granice) przenosimy do Supabase jako jedno źródło prawdy.

## Decyzje (zatwierdzone)

- Rzeki: pełny edytor geometrii (Leaflet-Geoman) + atrybuty (nazwa, kraina, obwód, opis, zasady).
- Granice: edycja jako punkty (przeciąganie + atrybuty), jak zbiorniki.
- Publiczna mapa czyta wszystkie 3 warstwy z Supabase; fallback do data.json per warstwa.

## Model danych (nowe tabele)

`rivers`:
| Kolumna | Typ | Uwaga |
|---|---|---|
| id | bigint identity PK | |
| n | text not null | nazwa |
| c | text | 'niz' (nizinna) / 'gor' (kraina pstrąga) |
| o | text | obwód |
| d | text | opis granic |
| r | text | zasady |
| pts | jsonb not null | tablica [[lat,lon],…] |
| updated_at | timestamptz | trigger |

`granice`:
| Kolumna | Typ | Uwaga |
|---|---|---|
| id | bigint identity PK | |
| n | text not null | nazwa |
| lat, lon | double precision not null | |
| d | text | opis |
| updated_at | timestamptz | trigger |

RLS jak dla `zbiorniki`: publiczny SELECT; INSERT/UPDATE/DELETE tylko gdy `is_operator()`.
Wyzwalacz `updated_at` na obu tabelach.

## Seed

Osobny plik `db/seed-rivers-granice.sql` (truncate + insert tylko tych dwóch tabel),
żeby ponowne uruchomienie nie nadpisało ręcznych zmian w `zbiorniki`.

## Publiczna mapa (`index.html`)

`loadFromSupabase()` pobiera 3 tabele równolegle i mapuje na kształt z data.json:
- zbiorniki → `{n, p:[lat,lon], ha, t, r, a}`
- rivers → `{n, c, o, d, r, pts}`
- granice → `{n, p:[lat,lon], d}`
Brak/awaria Supabase → dana warstwa z data.json (fallback per warstwa).

## Panel (`admin.html`)

- Przełącznik typu w panelu bocznym: Zbiorniki / Rzeki / Granice (filtruje listę i kontekst „Dodaj").
- Wszystkie 3 warstwy widoczne na mapie; klik w obiekt otwiera jego edytor.
- Punkty (zbiorniki, granice): przeciągany marker + formularz pól.
- Rzeki: formularz atrybutów + „Edytuj kształt" (Geoman `pm.enable` na wybranej linii:
  drag/insert/delete wierzchołków, przedłużanie) oraz „Narysuj nową rzekę"
  (`map.pm.enableDraw('Line')`, po `pm:create` formularz atrybutów).
- Zapis: punkty → `{…, lat, lon}`; rzeki → `{…, pts:[[lat,lon],…]}`.
- Escapowanie pól w liście (`esc()`), zapis przez supabase-js (parametryzowany).

## Zależności

Leaflet-Geoman free (CDN, przypięte `@2.18.3`): `leaflet-geoman.css` + `leaflet-geoman.min.js`.

## Weryfikacja

- `node --check` skryptów, struktura SQL, dostępność CDN Geoman.
- Publiczna mapa działa bez Supabase (fallback) i z Supabase (3 warstwy).
- Po migracji: edycja wierzchołka rzeki, narysowanie nowej linii, przeciągnięcie granicy.

## Poza zakresem

Wersjonowanie/historia geometrii, snap do innych warstw, import/eksport GeoJSON.
