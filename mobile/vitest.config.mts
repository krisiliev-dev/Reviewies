import { defineConfig } from 'vitest/config';

/**
 * The phone's unit tests.
 *
 * There are few of them and there should be: almost everything in `mobile/` is a
 * screen, and screens are covered by smoke.mjs, which drives the real react-native-web
 * export rather than a simulation of it. What belongs here is the platform glue that
 * has logic in it and cannot be reached from a browser — the picker shim being the
 * first, because the branch that matters is the one the web export never takes.
 */
export default defineConfig({
  // One .env at the workspace root, as everywhere else in this repository.
  envDir: '..',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
