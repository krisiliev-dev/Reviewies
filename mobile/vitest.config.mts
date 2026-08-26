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
    /**
     * Everywhere the phone's code lives, not just half of it.
     *
     * This was `src/**\/*.test.ts`, which silently excluded two whole categories: every
     * test under `app/` — where nearly all of this workspace's code is, because
     * expo-router puts screens there — and every `.tsx` test anywhere. §6.73 proved it
     * by dropping a deliberately failing test into each: `npm run test --workspace
     * mobile` reported **7 passed** with both sitting there, and `everyWorkspaceRuns`
     * agreed the workspace was covered.
     *
     * That is §6.68's silence one layer down. A workspace with a test script and test
     * files can still run none of them, and nothing was asking the runner what it had
     * actually collected.
     */
    include: ['{src,app}/**/*.test.{ts,tsx}'],
  },
});
