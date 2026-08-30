import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { color } from '@reviewies/core/tokens';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Reviewies',
        short_name: 'Reviewies',
        description: 'Track TV and film, and react to moments together.',
        /*
         * From the palette, not typed. These two were `#0b0b0f`, which is in neither theme —
         * `ground` is `#131114` — so the status-bar tint and the splash an installed app
         * shows were a colour this design system does not contain. §6.185, and the same
         * defect §6.111 found in `mobile/app.json`: `shipping.test.ts` was written to sweep
         * a manifest's hexes against the tokens and read only the native one.
         *
         * Dark on both, deliberately. `tokens.ts` says this app is dark by decision rather
         * than by preference, and a manifest has no media query to answer with anyway.
         */
        theme_color: color.dark.ground,
        background_color: color.dark.ground,
        // Standalone matters on iOS beyond cosmetics: an installed home-screen web app
        // is exempt from Safari's 7-day eviction of script-writable storage, which is
        // what makes a local-first design viable at all.
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        /*
         * These three named files that **had never existed**, in source or in any build, so
         * an installed app fell back to whatever the platform invents. `scripts/make-icons.mjs`
         * draws them now, from `POSTER_PLATE` and `posterInitials` — the product's own rule
         * for artwork it does not have, applied to the product. §6.185.
         */
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // injectManifest would mean hand-writing the whole worker; importScripts
      // keeps Workbox's generated precache and adds our push handlers on top.
      workbox: {
        importScripts: ['sw-push.js'],
        // App shell only. Posters are streamed from the provider CDN — iOS caps the
        // Cache API at roughly 50 MB per partition, so bulk-caching artwork would
        // evict the things that actually need to persist.
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  // One .env at the workspace root: the app and the core need the same values,
  // and two copies drifting apart is a debugging session nobody enjoys.
  envDir: '..',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    alias: {
      // Vite's `?url` import gives a browser path that Node cannot open. Tests get a
      // real filesystem path instead, so the SQLite importer can be exercised against
      // actual DioCache.db files rather than mocked.
      './sqlWasm': new URL('./src/test/sqlWasm.node.ts', import.meta.url).pathname,
    },
  },
});
