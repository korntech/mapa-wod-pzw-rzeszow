# Instrukcja operatora — panel edycji mapy wód

Panel służy do poprawiania danych na mapie łowisk: położenia zbiorników i punktów granic, przebiegu rzek
oraz opisów (powierzchnia, typ, zasady, granice obwodów). Wszystko, co zapiszesz, jest od razu publiczne —
widać to na mapie i w wykazie do druku po odświeżeniu strony.

Adres panelu: `…/admin.html` (na mapie publicznej link „🔑 Operator” w prawym górnym rogu).

## 1. Logowanie

1. Otwórz panel i wpisz e-mail oraz hasło swojego konta operatora.
2. Po zalogowaniu zobaczysz listę po lewej, mapę pośrodku i swój e-mail w nagłówku.
3. Po pracy kliknij **Wyloguj** — zwłaszcza na wspólnym komputerze; przeglądarka pamięta sesję.

Konta zakłada osoba techniczna opiekująca się bazą. Nie ma przycisku „nie pamiętam hasła” — nowe hasło
ustawia ta sama osoba.

Komunikaty przy logowaniu:

| Komunikat | Co znaczy |
|---|---|
| nieprawidłowy e-mail lub hasło | sprawdź dane; jeśli nadal nie działa, poproś o zmianę hasła |
| zbyt wiele prób — odczekaj chwilę | odczekaj kilka minut |
| brak połączenia z bazą | baza nie odpowiada (patrz punkt 8) |

## 2. Jak wygląda panel

- **Zakładki** nad listą: **Zbiorniki**, **Rzeki**, **Granice** — wybierasz, co edytujesz.
- **Szukaj…** — filtruje listę (po nazwie, typie, obwodzie).
- Na liście zbiorników znak **⚠** oznacza lokalizację przybliżoną (pinezka stoi w środku miejscowości,
  nie na akwenie). Na mapie takie zbiorniki są pomarańczowe, pozostałe niebieskie.
- Przełącznik podkładu (prawy górny róg mapy): **Mapa**, **Mapa topograficzna**, **Ortofotomapa**.
  W panelu domyślnie włączona jest ortofotomapa — na niej najłatwiej rozpoznać akwen.
- Kliknięcie obiektu (na liście albo na mapie) otwiera **formularz edycji** po prawej stronie.
- **✕** w formularzu zamyka edycję **bez zapisywania**.

## 3. Poprawianie położenia zbiornika (pinezki)

1. Zakładka **Zbiorniki**, kliknij zbiornik na liście (mapa przybliży się do niego).
2. Na mapie pojawi się pinezka, którą można **przeciągnąć** w właściwe miejsce (środek akwenu).
   Współrzędne w formularzu (Szerokość / Długość) uzupełnią się same, a znacznik
   „Lokalizacja przybliżona (⚠)” zostanie odznaczony.
3. Sprawdź na ortofotomapie, że pinezka leży na wodzie.
4. Kliknij **💾 Zapisz**. Pojawi się komunikat „Zapisano”.

Jeśli nie masz pewności, gdzie leży akwen, zostaw pinezkę i znacznik ⚠ bez zmian — pinezka w złym miejscu
jest gorsza niż pinezka przybliżona.

## 4. Kandydujące akweny (podpowiedzi)

Przy zbiornikach oznaczonych ⚠ formularz pokazuje sekcję **Kandydujące akweny (GUGiK, BDOT10k)**:
listę od 1 do 4 akwenów z państwowej bazy topograficznej, w pobliżu obecnej pinezki. Przy każdym jest
powierzchnia w hektarach, liczba obiektów (jeśli to zespół stawów), odległość od obecnej pinezki i ocena
dopasowania (0–100; im wyżej, tym bardziej powierzchnia i odległość zgadzają się z wykazem).

1. Kliknij kandydata — pinezka przeskoczy na ten akwen, a mapa przybliży się do niego.
2. Obejrzyj akwen na ortofotomapie i porównaj z tym, co wiesz o łowisku (powierzchnia z wykazu jest
   w formularzu w polu „Powierzchnia”).
3. Jeżeli to właściwy akwen — **💾 Zapisz**. Jeżeli nie — kliknij innego kandydata albo przeciągnij pinezkę
   ręcznie. Jeżeli żaden nie pasuje — zamknij formularz (✕), nic nie zostanie zmienione.

Podpowiedzi to tylko propozycje z automatu; ostatnie słowo należy do osoby znającej teren.
Przy kilku sąsiadujących wyrobiskach (np. Mrowla–Lipie) lista kandydatów jest taka sama dla każdego
łowiska i trzeba przypisać je z wiedzy lokalnej.

## 5. Edycja rzek

Zakładka **Rzeki**, kliknij rzekę na liście lub na mapie. Formularz zawiera: Nazwa, Kraina (nizinna /
kraina pstrąga), Obwód, Opis granic, Zasady oraz przycisk edycji kształtu.

Zmiana przebiegu linii:

1. Kliknij **✏️ Edytuj kształt linii**.
2. Na linii pojawią się punkty: **przeciągaj** je, **kliknij środek odcinka**, aby dodać nowy punkt,
   **prawy przycisk myszy** (albo Alt + klik) na punkcie usuwa go.
3. Kliknij **✅ Zakończ edycję kształtu**, a potem **💾 Zapisz**.

Nowa rzeka: przycisk **✏️ Narysuj nową rzekę** pod listą, klikaj kolejne punkty na mapie, **dwuklik**
kończy rysowanie; uzupełnij formularz i **💾 Zapisz**. Linia musi mieć co najmniej 2 punkty.

## 6. Granice obwodów i nowe obiekty

- **Granice** (zakładka Granice) edytuje się jak zbiorniki: przeciągnij pinezkę, popraw nazwę i opis, **Zapisz**.
- **Nowy zbiornik / nowa granica**: przycisk **➕ Dodaj zbiornik** lub **➕ Dodaj granicę**, potem
  kliknij miejsce na mapie; wypełnij formularz i **Zapisz**. Nazwa jest obowiązkowa.
- **Usuwanie**: przycisk **🗑 Usuń** w formularzu; panel poprosi o potwierdzenie. Usunięcia nie da się
  cofnąć z poziomu panelu (odtworzenie z nocnej kopii wymaga osoby technicznej).

## 7. Zasady pracy

- Nazwy, powierzchnie, typy, zasady połowu i opisy granic zmieniaj tylko zgodnie z oficjalnym wykazem
  wód i zezwoleniem. Mapa jest narzędziem poglądowym; wiążący jest wykaz.
- Powierzchnię wpisuj tak jak w wykazie (np. `3,00`); jeśli nieznana — `—`.
- Każdy zapis jest natychmiast publiczny. Co noc powstaje automatyczna kopia danych (snapshot), więc
  błędy z danego dnia da się cofnąć, ale tylko z pomocą osoby technicznej.

## 8. Gdy coś nie działa

| Objaw | Co zrobić |
|---|---|
| „brak połączenia z bazą” przy logowaniu, „Błąd wczytywania” po zalogowaniu | baza nie odpowiada. Mapa publiczna działa dalej z ostatniej kopii. Odczekaj kilkanaście minut i spróbuj ponownie; jeśli problem trwa, zgłoś osobie technicznej (możliwe, że projekt bazy został wstrzymany i trzeba go wznowić) |
| „Błąd zapisu: … row-level security …” | konto jest zalogowane, ale nie jest na liście operatorów — zgłoś osobie technicznej |
| „Niepoprawne współrzędne”, „Podaj nazwę”, „Linia musi mieć min. 2 punkty” | uzupełnij brakujące pole albo popraw pinezkę / linię |
| komunikat w rogu mapy „Podkład Geoportalu nie odpowiada…” | chwilowa awaria podkładu po stronie GUGiK; panel przełączył się na inny podkład, dane łowisk są aktualne. Można też ręcznie wybrać inny podkład w przełączniku |
| zmiana nie widać na mapie publicznej | odśwież stronę mapy (Ctrl+F5 / przeciągnij w dół na telefonie) |
| nie pamiętam hasła | poproś osobę techniczną o ustawienie nowego hasła |

## 9. Kogo pytać

- Sprawy techniczne (konta, hasła, baza, awarie): osoba techniczna opiekująca się mapą, wskazana przez Okręg.
- Błędy w danych zauważone przez wędkarzy trafiają jako zgłoszenia do repozytorium projektu
  (zakładka *Issues*) albo — jeśli Okręg poda adres — na skrzynkę Okręgu; warto je przeglądać i poprawiać w panelu.
