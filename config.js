// Klucz publishable jest jawny (przeznaczony do kodu w przeglądarce); zapisu
// pilnują reguły RLS w db/schema.sql, dlatego ten plik jest bezpieczny w repo.
// Przy pustych polach mapa działa wyłącznie na danych z data.json, a panel
// operatora pokazuje komunikat o braku konfiguracji.
//
// Uwaga: tools/snapshot/export.mjs i healthcheck czytają ten plik wyrażeniem
// regularnym po nazwach kluczy — nie zmieniaj ich nazw ani cudzysłowów.
export const PZW_CONFIG = {
  SUPABASE_URL: 'https://cnmuvkymtacspfrqnhma.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_TuEx7l7NZYtA0umL0KmWUA_pZ7waFM4'
};
