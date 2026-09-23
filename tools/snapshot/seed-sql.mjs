#!/usr/bin/env node
/**
 * Generuje SQL zasilający pustą bazę danymi ze snapshotu (na standardowe wyjście).
 *
 * Użycie: node tools/snapshot/seed-sql.mjs [ścieżka-do-snapshotu] > seed.sql
 */
import { readFileSync } from 'node:fs';
import { loadConfig, snapshotPath } from './config.mjs';

const config = loadConfig();
const FILE = process.argv[2] || snapshotPath(config);
const { tables } = config.supabase;
const data = JSON.parse(readFileSync(FILE, 'utf8'));

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;
const row = (values) => `  (${values.join(', ')})`;

const lines = ['begin;', ''];
for (const table of Object.values(tables)) {
  lines.push(`truncate table public.${table} restart identity;`);
}
lines.push('');

lines.push(`insert into public.${tables.zbiorniki} (n, lat, lon, ha, t, k, nk, o, r, a) values`);
lines.push(
  data.zb
    .map((z) =>
      row([
        literal(z.n),
        z.p[0],
        z.p[1],
        literal(z.ha),
        literal(z.t),
        literal(z.k),
        z.nk ? 1 : 0,
        literal(z.o || ''),
        literal(z.r),
        z.a ? 1 : 0,
      ])
    )
    .join(',\n') + ';',
  ''
);

lines.push(`insert into public.${tables.rivers} (n, c, o, d, r, pts) values`);
lines.push(
  data.rivers
    .map((r) =>
      row([
        literal(r.n),
        literal(r.c),
        literal(r.o),
        literal(r.d),
        literal(r.r),
        literal(JSON.stringify(r.pts)) + '::jsonb',
      ])
    )
    .join(',\n') + ';',
  ''
);

lines.push(`insert into public.${tables.granice} (n, lat, lon, d) values`);
lines.push(data.granice.map((g) => row([literal(g.n), g.p[0], g.p[1], literal(g.d)])).join(',\n') + ';', '');

lines.push('commit;');
process.stdout.write(lines.join('\n') + '\n');
