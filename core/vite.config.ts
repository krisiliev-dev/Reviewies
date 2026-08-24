import { defineConfig } from 'vitest/config';

export default defineConfig({
  // One .env at the workspace root: the app and the core need the same values,
  // and two copies drifting apart is a debugging session nobody enjoys.
  envDir: '..',
  test: {
    // jsdom, not node: several suites exercise browser-shaped APIs that the core
    // consumes through its own adapters (fake-indexeddb, atob, crypto).
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
