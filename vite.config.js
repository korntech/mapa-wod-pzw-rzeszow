import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = JSON.parse(readFileSync(resolve(__dirname, 'config.json'), 'utf8'));

/** Content-Security-Policy ograniczona do hostów z config.json. */
function contentSecurityPolicy() {
  const origin = (url) => new URL(url).origin;
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', origin(config.basemaps.serviceUrl)],
    'connect-src': ["'self'", origin(config.supabase.url)],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/** Wstawia politykę CSP jako <meta> do każdej strony w buildzie produkcyjnym. */
function cspPlugin() {
  return {
    name: 'pzw-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy() },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  base: process.env.PZW_BASE || config.site.basePath,
  plugins: [cspPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        wykaz: resolve(__dirname, 'wykaz.html'),
      },
    },
  },
});
