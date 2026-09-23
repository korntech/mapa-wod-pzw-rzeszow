# Zgłaszanie luk bezpieczeństwa

Jeśli znajdziesz podatność w mapie, panelu operatora, funkcji zgłoszeń lub automatyzacjach,
**nie zakładaj publicznego issue** — treść byłaby widoczna dla wszystkich, zanim zdążymy ją naprawić.

Zgłoś ją prywatnie:

- **GitHub → zakładka „Security” → „Report a vulnerability”** (prywatne zgłoszenie do opiekunów repozytorium), albo
- e-mailem do opiekuna technicznego: **kamilkornacki@icloud.com**.

Podaj, co i gdzie zauważyłeś(-aś), jak to odtworzyć i jaki jest możliwy skutek. Odpowiadamy w ciągu
7 dni; poprawki krytyczne (np. obejście limitów zgłoszeń, zapis do bazy bez uprawnień) wdrażamy w pierwszej
kolejności i informujemy zgłaszającego.

## Zakres

- mapa publiczna i panel operatora (`index.html`, `admin.html`, `src/`),
- funkcja Supabase `zglos-blad` i reguły bazy (`db/`),
- workflowy GitHub Actions (`.github/workflows/`).

Publiczny klucz `sb_publishable_…` i adres projektu Supabase w `config.json` są konfiguracją klienta,
nie sekretem — bezpieczeństwo zapisu zależy od reguł RLS i allow-listy operatorów.

## Co już jest wdrożone

Publiczny odczyt i zapis tylko dla operatorów z allow-listy po drugim składniku (MFA), ograniczenia
CHECK i historia zmian w bazie, escapowanie treści, CSP w buildzie, atomowe limity zgłoszeń, przypięte
wersje akcji, publikacja tylko przetestowanego commitu. Przegląd bezpieczeństwa jest powtarzany przed
każdym większym wdrożeniem.
