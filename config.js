// Konfiguracja Supabase — uzupełnij dwoma wartościami z panelu Supabase:
// Project Settings → API → "Project URL" oraz "anon public" key.
//
// UWAGA: klucz "anon" jest JAWNY z założenia (przeznaczony do kodu w przeglądarce).
// Bezpieczeństwo zapisu zapewniają reguły Row Level Security w db/schema.sql,
// dlatego ten plik można bez obaw commitować do publicznego repo.
//
// Dopóki te pola są puste, publiczna mapa działa offline na danych z data.json,
// a panel admin.html poprosi o konfigurację.

window.PZW_CONFIG = {
  SUPABASE_URL: '',      // np. 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: ''  // długi klucz zaczynający się od 'eyJ...'
};
