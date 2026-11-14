import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

// GitHub Pages serves the repo at /kochvei-hamivchan/. Dev runs at /.
const PAGES_BASE = '/kochvei-hamivchan/';

// Refuse to build when public/content holds dev fixtures, unless the preview build asked for it explicitly.
function noFixturesInBuild() {
  return {
    name: 'no-fixtures-in-build',
    apply: 'build',
    buildStart() {
      const mf = path.resolve('public/content/manifest.json');
      if (!fs.existsSync(mf)) this.error('public/content/manifest.json missing: run `npm run content` (npm run build does).');
      const { source } = JSON.parse(fs.readFileSync(mf, 'utf8'));
      if (source !== 'content-build' && process.env.KH_ALLOW_FIXTURES !== '1') {
        this.error('public/content holds DEV FIXTURES (NOT FOR SHIPPING). Use `npm run build` with a complete content/build, or `npm run build:preview` for an explicit preview.');
      }
    },
  };
}

// Content-Security-Policy for the built app: everything is self-hosted (fonts, art, content JSON) and nothing is
// inline, so 'self' covers it all. Build only: the dev server injects <style> tags and the HMR client, which this
// policy would block. Inline style attributes set from JS (Preact's style={…}) go through the CSSOM and are allowed.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "font-src 'self'",
  "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'", "media-src 'self'", "object-src 'none'",
  "base-uri 'self'", "form-action 'none'",
].join('; ');
// Placed right after <meta charset>, ahead of every script and stylesheet (a CSP meta covers only what follows it).
function cspMeta() {
  const CHARSET = '<meta charset="utf-8" />';
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      if (!html.includes(CHARSET)) throw new Error(`csp-meta: ${CHARSET} not found in index.html`);
      return html.replace(CHARSET, `${CHARSET}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [
    preact(),
    noFixturesInBuild(),
    cspMeta(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.jsx
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'כוכבי המבחן',
        short_name: 'כוכבי המבחן',
        lang: 'he',
        dir: 'rtl',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#fff6e8',
        theme_color: '#4fb3d9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell, fonts and every content JSON so the app works fully offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webp,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // A new deploy takes over at once (no waiting for every tab to close); src/lib/swUpdate.js then reloads the
        // page onto it at a safe moment. Without these a fullscreen PWA kept the old build for days.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: { input: 'index.html' }, // dev/ (font test) is never part of the build
  },
  server: { host: true },
  test: { include: ['src/**/*.test.js'] },
}));
