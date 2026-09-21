/* Dostęp do config.json i ścieżek repozytorium dla skryptów Node. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadConfig() {
  return JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
}

/** Ścieżka snapshotu w katalogu publikowanym razem ze stroną. */
export function snapshotPath(config) {
  return resolve(ROOT, 'public', config.snapshot.file);
}
