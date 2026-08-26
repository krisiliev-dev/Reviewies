import { defineConfig } from 'vitest/config';

/**
 * Every workspace's tests, in one process, so coverage can be believed.
 *
 * Run per workspace, a coverage report is wrong in both directions and says nothing
 * about it. `--coverage.include='../core/src/**'` is silently ignored — the reporter
 * only ever emits files under the project root — so `core/src/devices/relayUrl.ts` came
 * back as *entirely dead* when `relay/src/pairing.test.ts` executes it on every run. And
 * `core/src/data/adapters/sqlite.ts` came back three-quarters dead because the Dexie
 * config was the one being measured; the SQLite config is a separate run.
 *
 * Both directions matter and the first is the dangerous one: a report that names live
 * code as dead sends somebody to delete it. §6.68.
 *
 * This config is for reading, not for gating. There is no threshold: the standard here
 * is a named guard that fails for a stated reason, not a percentage that drifts.
 */
export default defineConfig({
  test: {
    /**
     * Generous, because instrumentation is the reason and not the code.
     *
     * V8 coverage roughly doubles how long a suite takes, and six projects run at once
     * here. Three tests with five-second budgets — the scale import, two fingerprint
     * cases — time out under it and pass in `npm run verify`. A timeout is not a finding
     * and should not be reported as one.
     *
     * Passed on the command line by the `coverage` script rather than set here: a
     * project's own config wins over this one, and every project here has its own.
     */
    // Named explicitly: the core's two configs both inherit the package name, and
    // vitest refuses to run two projects that call themselves the same thing.
    // Named explicitly: the core's two configs both inherit the package name, and
    // vitest refuses to run two projects that call themselves the same thing. `root` is
    // explicit for the same reason — `extends` does not carry it, so a workspace's
    // `setupFiles: ['./src/test/setup.ts']` would be looked for at the repo root.
    projects: [
      { extends: 'core/vite.config.ts', root: 'core', test: { name: 'core-dexie' } },
      { extends: 'core/vitest.sqlite.config.ts', root: 'core', test: { name: 'core-sqlite' } },
      { extends: 'app/vite.config.ts', root: 'app', test: { name: 'app' } },
      { extends: 'mobile/vitest.config.mts', root: 'mobile', test: { name: 'mobile' } },
      { root: 'relay', test: { name: 'relay' } },
      { root: 'bridge', test: { name: 'bridge' } },
      { extends: 'extension/vitest.config.ts', root: 'extension', test: { name: 'extension' } },
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      all: true,
      reporter: ['json', 'text-summary'],
      reportOnFailure: true,
      include: [
        'core/src/**/*.ts',
        'app/src/**/*.{ts,tsx}',
        'mobile/src/**/*.{ts,tsx}',
        'mobile/app/**/*.{ts,tsx}',
        'relay/src/**/*.ts',
        'bridge/src/**/*.ts',
        'extension/src/**/*.ts',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/node_modules/**', '**/dist/**'],
      reportsDirectory: 'coverage',
    },
  },
});
