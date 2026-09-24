/* Funkcja Supabase: przyjmuje zgłoszenie błędu z formularza na mapie, atomowo rezerwuje limit
 * w bazie (funkcja SQL zgloszenie_rezerwuj), zakłada issue w repozytorium i uzupełnia wpis.
 * Logika obsługi jest w obsluga.js (testowana w Node); tu tylko HTTP, CORS i zależności.
 * Sekrety: GITHUB_TOKEN (fine-grained, Issues: read/write), GITHUB_REPO (owner/repo),
 * MAP_URL (publiczny adres mapy), opcjonalnie ALLOWED_ORIGINS (lista adresów po przecinku),
 * ZGLOSZENIA_WSTRZYMANE=1 — wyłącznik awaryjny. */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { LIMITY } from './zgloszenie.js';
import { obsluzZgloszenie } from './obsluga.js';
import { czytajBody } from './body.js';

const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ORIGINS.length === 0 ? '*' : ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });

async function utworzIssue(title: string, body: string) {
  const res = await fetch(`https://api.github.com/repos/${Deno.env.get('GITHUB_REPO')}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'mapa-wod-pzw-rzeszow',
    },
    body: JSON.stringify({ title, body, labels: ['zgłoszenie'] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const issue = await res.json();
  return { numer: issue.number as number, url: issue.html_url as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { ok: false, error: 'metoda' });
  // Wyłącznik awaryjny: sekret ZGLOSZENIA_WSTRZYMANE=1 zatrzymuje przyjmowanie zgłoszeń bez zmiany kodu.
  if (Deno.env.get('ZGLOSZENIA_WSTRZYMANE') === '1') return json(req, 503, { ok: false, error: 'wstrzymane' });

  // Rozmiar treści: nagłówek, a potem odczyt strumieniowy przerywany w chwili przekroczenia progu
  // (nadmiarowe bajty nie są wczytywane do pamięci).
  const zadeklarowane = Number(req.headers.get('content-length') || 0);
  if (zadeklarowane > LIMITY.bodyBajty) return json(req, 413, { ok: false, error: 'rozmiar' });
  const body = await czytajBody(req.body, LIMITY.bodyBajty);
  if (!body.ok) return json(req, 413, { ok: false, error: 'rozmiar' });
  let input: unknown;
  try {
    input = JSON.parse(body.text);
  } catch {
    return json(req, 400, { ok: false, error: 'json' });
  }

  // Ostatni wpis x-forwarded-for pochodzi od bramy Supabase; wcześniejsze może dopisać klient.
  const ip = (req.headers.get('x-forwarded-for') || 'nieznany').split(',').pop()!.trim() || 'nieznany';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const wynik = await obsluzZgloszenie({
    input,
    ip,
    mapUrl: Deno.env.get('MAP_URL') || '',
    rezerwuj: async (r) => {
      const { data, error } = await db.rpc('zgloszenie_rezerwuj', {
        p_ip: r.ip,
        p_typ: r.typ,
        p_nazwa: r.nazwa,
        p_lat: r.lat, // null dla typu „inne” (kolumny lat/lon dopuszczają null od migracji 2026-09-24)
        p_lon: r.lon,
        p_opis: r.opis,
        p_kontakt: r.kontakt || null,
        p_na_godzine: LIMITY.naGodzine,
        p_lacznie_na_godzine: LIMITY.lacznieNaGodzine,
        p_lacznie_na_dobe: LIMITY.lacznieNaDobe,
      });
      if (error) throw new Error(`rezerwacja: ${error.message}`);
      return data;
    },
    utworzIssue,
    oznacz: async (id, zmiany) => {
      const { error } = await db.from('zgloszenia').update(zmiany).eq('id', id);
      if (error) throw new Error(`oznacz: ${error.message}`);
    },
    log: (m) => console.error(m),
  });
  return json(req, wynik.status, wynik.body);
});
