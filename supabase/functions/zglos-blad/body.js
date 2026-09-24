/* Odczyt treści żądania z twardym limitem: strumień jest przerywany w chwili
 * przekroczenia progu, a nie po wczytaniu całości (retest bezpieczeństwa 24.09.2026). */

/**
 * @param {ReadableStream<Uint8Array> | null} stream treść żądania
 * @param {number} limit maksymalna liczba bajtów
 * @returns {Promise<{ok: true, text: string} | {ok: false, error: 'rozmiar'}>}
 */
export async function czytajBody(stream, limit) {
  if (!stream) return { ok: true, text: '' };
  const reader = stream.getReader();
  const czesci = [];
  let razem = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      razem += value.byteLength;
      if (razem > limit) {
        await reader.cancel('rozmiar').catch(() => {});
        return { ok: false, error: 'rozmiar' };
      }
      czesci.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bufor = new Uint8Array(razem);
  let pos = 0;
  for (const c of czesci) {
    bufor.set(c, pos);
    pos += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bufor) };
}
