/* Logika obsługi zgłoszenia — bez Deno i bez sieci, z wstrzykniętymi zależnościami,
 * żeby dało się ją przetestować w Node (obsluga.test.mjs). index.ts tylko ją spina.
 *
 * Kolejność jest istotna (F01 przeglądu bezpieczeństwa 23.09.2026):
 *   1. walidacja ścisłego schematu,
 *   2. ATOMOWA rezerwacja limitu w bazie (funkcja SQL z blokadą) — wpis powstaje PRZED issue,
 *   3. dopiero potem issue na GitHubie; niepowodzenie zapisu przerywa obsługę,
 *   4. wpis dostaje numer issue (status „wyslane”) albo status „blad” (outbox do ponowienia).
 * Żądanie, które nie zwiększyło licznika, nigdy nie tworzy issue. */
import { validateReport, issueContent } from './zgloszenie.js';

/** Współrzędne są null dla typu „inne” (brakujące łowisko / uwaga ogólna — bez rekordu na mapie).
 * @typedef {{ ip: string, typ: string, nazwa: string, lat: number|null, lon: number|null, opis: string, kontakt: string }} Rezerwacja */

/**
 * @param {object} deps
 * @param {unknown} deps.input          zdekodowane JSON żądania
 * @param {string}  deps.ip             adres nadawcy (z bramy)
 * @param {string}  deps.mapUrl         publiczny adres mapy
 * @param {(rezerwacja: Rezerwacja) => Promise<{ok: boolean, id?: number, error?: string}>} deps.rezerwuj
 *        atomowa rezerwacja limitu i wpis w bazie; rzuca przy błędzie bazy
 * @param {(title: string, body: string) => Promise<{numer: number, url: string}>} deps.utworzIssue
 * @param {(id: number, zmiany: object) => Promise<void>} deps.oznacz  aktualizacja wpisu; rzuca przy błędzie
 * @param {(msg: unknown) => void} [deps.log]
 * @returns {Promise<{status: number, body: object}>}
 */
export async function obsluzZgloszenie({ input, ip, mapUrl, rezerwuj, utworzIssue, oznacz, log = () => {} }) {
  const wynik = validateReport(input);
  if (!wynik.ok) return { status: 400, body: { ok: false, error: wynik.error } };
  const { report } = wynik;

  let rezerwacja;
  try {
    rezerwacja = await rezerwuj({ ip, ...report });
  } catch (err) {
    log(err);
    return { status: 500, body: { ok: false, error: 'baza' } };
  }
  if (!rezerwacja || typeof rezerwacja !== 'object')
    return { status: 500, body: { ok: false, error: 'baza' } };
  if (!rezerwacja.ok) {
    const kod = rezerwacja.error === 'powtorka' ? 409 : 429;
    return {
      status: kod,
      body: { ok: false, error: rezerwacja.error === 'powtorka' ? 'powtorka' : 'limit' },
    };
  }
  const id = rezerwacja.id;

  const { title, body } = issueContent(report, mapUrl, id);
  let issue;
  try {
    issue = await utworzIssue(title, body);
  } catch (err) {
    log(err);
    try {
      await oznacz(id, { status: 'blad' });
    } catch (e2) {
      log(e2);
    }
    return { status: 502, body: { ok: false, error: 'github' } };
  }

  try {
    await oznacz(id, { status: 'wyslane', issue_numer: issue.numer, issue_url: issue.url });
  } catch (err) {
    // Issue już istnieje i rezerwacja została policzona — zgłaszający dostaje numer, błąd idzie do logu.
    log(err);
  }
  return { status: 200, body: { ok: true, numer: issue.numer, url: issue.url } };
}
