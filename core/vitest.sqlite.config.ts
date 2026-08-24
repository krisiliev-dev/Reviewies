import { defineConfig } from 'vitest/config';

/**
 * The core's suite, run against the SQLite implementation instead of Dexie.
 *
 * A separate config rather than a flag, so both can run in CI and a regression in
 * either implementation is visible on its own.
 */
export default defineConfig({
  envDir: '..',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.sqlite.ts'],
    globals: true,
  },
});
