import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        // Standalone matters on iOS beyond cosmetics: an installed home-screen web app
        // is exempt from Safari's 7-day eviction of script-writable storage, which is
        // what makes a local-first design viable at all.
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
