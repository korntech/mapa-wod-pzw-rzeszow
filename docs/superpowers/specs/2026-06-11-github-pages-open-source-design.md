# Publikacja mapy wód PZW Rzeszów jako open source (GitHub + GitHub Pages)

Data: 2026-06-11

## Cel

Udostępnić aplikację-mapę łowisk PZW Okręgu Rzeszów publicznie pod stałym adresem
(GitHub Pages) i otworzyć projekt na wkład społeczności wędkarskiej (publiczne repo,
licencja MIT).

## Decyzje

- **Repozytorium:** publiczne `korntech/mapa-wod-pzw-rzeszow`
- **Licencja:** MIT (dotyczy kodu; dane łowisk pochodzą z oficjalnego wykazu PZW)
- **PDF wykazu:** NIE trafia do repo (prawa autorskie Okręgu PZW Rzeszów).
  Zamiast tego link do oficjalnej strony:
  https://rzeszow.pzw.pl/strefa-wedkarza/wykaz-wod-pzw-okreg-w-rzeszowie-w-2026-roku
- **Struktura:** rozbicie monolitu — `index.html` (aplikacja) + `data.json` (dane),
  ładowane przez `fetch('data.json')`. Ułatwia PR-y społeczności do samych danych.

## Pliki w repo

| Plik | Zawartość |
|---|---|
| `index.html` | aplikacja (Leaflet 1.9.4 CDN), bez inline `const DATA` |
| `data.json` | `zb` (49 zbiorników), `rivers` (27 rzek), `granice` (16 punktów) |
| `README.md` | opis, link do mapy, źródło danych, disclaimer, jak kontrybuować, uruchomienie lokalne |
| `LICENSE` | MIT |
| `.gitignore` | wyklucza PDF, `wykaz-wod-ocr.txt`, `mapa-pzw-netlify.zip` (pochodne dokumentu PZW — zostają lokalnie) |

## Zmiany w aplikacji

- Linki do lokalnego PDF (nagłówek + modal „O mapie") → link do strony PZW Rzeszów.
- Dane merytoryczne bez zmian (zasada z PROMPT.md: zmiany tylko po weryfikacji z PDF-em).

## Deploy

GitHub Pages z gałęzi `main`, katalog główny. Bez CI — strona statyczna.
Adres docelowy: https://korntech.github.io/mapa-wod-pzw-rzeszow/

## Weryfikacja

1. Lokalnie: `python3 -m http.server`, sprawdzenie ładowania mapy i danych
   (poprawny JSON, fetch zwraca 200, brak błędów konsoli możliwych do wykrycia statycznie).
2. Po deployu: strona na Pages zwraca 200, zawiera aplikację, `data.json` dostępny.

## Poza zakresem

PWA/offline, eksport GPX, poprawki lokalizacji `a:1`, dorysowanie brakujących potoków —
opisane w README/Issues jako pomysły dla społeczności.
