import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Ścieżka bazowa: na GitHub Pages projekt żyje pod /mapa-wod-pzw-rzeszow/.
// Po przejściu na własną subdomenę (np. mapa.rzeszow.pzw.pl) ustaw PZW_BASE=/ przy budowaniu.
const base = process.env.PZW_BASE || '/mapa-wod-pzw-rzeszow/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // dwie strony: mapa publiczna i panel operatora
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
