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

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [
    preact(),
    noFixturesInBuild(),
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
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
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
