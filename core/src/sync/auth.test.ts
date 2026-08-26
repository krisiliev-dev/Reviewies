import { describe, expect, it } from 'vitest';
import { authStorageKey } from './auth.ts';

describe('auth storage key', () => {
  it('is namespaced per test worker', () => {
    // Live suites run in parallel against one project. Sharing a key means whichever
    // file signs in last silently signs the others out — a flake that reads as a
    // policy failure and is not.
    expect(authStorageKey()).toMatch(/-test-\d+$/);
  });

  it('is stable within a worker, so a session survives a reload', () => {
    expect(authStorageKey()).toBe(authStorageKey());
  });

  it('is plain outside a test run', () => {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    const saved = env?.VITEST_WORKER_ID;
    if (env) delete env.VITEST_WORKER_ID;
    try {
      expect(authStorageKey()).toBe('reviewies-auth');
    } finally {
      if (env && saved !== undefined) env.VITEST_WORKER_ID = saved;
    }
  });
});
