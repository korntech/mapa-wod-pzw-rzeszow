/* Funkcja Supabase: przyjmuje zgłoszenie błędu z formularza na mapie, ogranicza liczbę
 * zgłoszeń z jednego adresu, zakłada issue w repozytorium i zapisuje wpis w tabeli zgloszenia.
 * Sekrety: GITHUB_TOKEN (fine-grained, Issues: read/write), GITHUB_REPO (owner/repo),
 * MAP_URL (publiczny adres mapy), opcjonalnie ALLOWED_ORIGINS (lista adresów po przecinku). */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateReport, issueContent, LIMITY } from './zgloszenie.js';

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

async function createIssue(title: string, body: string) {
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
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const issue = await res.json();
  return { numer: issue.number as number, url: issue.html_url as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { ok: false, error: 'metoda' });

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: 'json' });
  }
  const wynik = validateReport(input);
  if (!wynik.ok) return json(req, 400, { ok: false, error: wynik.error });
  const { report } = wynik;

  const ip = (req.headers.get('x-forwarded-for') || 'nieznany').split(',')[0].trim();
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const odKiedy = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count, error: countError } = await db
    .from('zgloszenia')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', odKiedy);
  if (countError) return json(req, 500, { ok: false, error: 'baza' });
  if ((count ?? 0) >= LIMITY.naGodzine) return json(req, 429, { ok: false, error: 'limit' });

  const { title, body } = issueContent(report, Deno.env.get('MAP_URL') || '');
  let issue;
  try {
    issue = await createIssue(title, body);
  } catch (err) {
    console.error(err);
    return json(req, 502, { ok: false, error: 'github' });
  }

  const { error: insertError } = await db.from('zgloszenia').insert({
    ip,
    typ: report.typ,
    nazwa: report.nazwa,
    lat: report.lat,
    lon: report.lon,
    opis: report.opis,
    kontakt: report.kontakt || null,
    issue_numer: issue.numer,
    issue_url: issue.url,
  });
  if (insertError) console.error(insertError);

  return json(req, 200, { ok: true, numer: issue.numer, url: issue.url });
});
