import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Every workspace runs tests, and none of them passes by having none.
 *
 * `npm run test --workspaces --if-present` skips a workspace with no `test` script
 * **silently**. The extension had no `test` script and no unit tests, so `npm run
 * verify` had been reporting green over five hundred lines nothing had ever executed —
 * and the run's own output did not say so, because a skipped workspace prints nothing at
 * all. §6.68 found it by adding up which workspace produced which number and noticing
 * that the seven tests being attributed to the extension were the phone's.
 *
 * `--passWithNoTests` is the same silence spelled differently: it makes a suite green
 * when its files have been deleted, renamed out of the glob, or excluded by a config
 * change nobody noticed.
 *
 * So: every workspace either runs tests or is named below with the reason it does not.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * Workspaces that legitimately have no unit tests, and why.
 *
 * Empty. It stays empty unless something earns a place, and the stale check below means
 * an entry cannot outlive the workspace it excuses.
 */
const NO_TESTS: Record<string, string> = {};

/**
 * Workspaces allowed to pass with no test files, and why.
 *
 * Empty for the same reason. `mobile` sat here implicitly — its `test` script carried
 * `--passWithNoTests` while the workspace held exactly one test file, so deleting that
 * file would have gone unnoticed.
 */
const MAY_BE_EMPTY: Record<string, string> = {};

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, never>;

const workspaces = (): string[] =>
  ((readJson(resolve(ROOT, 'package.json')) as { workspaces?: string[] }).workspaces ?? []) as string[];

function testFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('every workspace', () => {
  const names = workspaces();

  it('finds the workspace list rather than passing on an empty one', () => {
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain('extension');
  });

  it('has a test script, so `npm test` cannot skip it in silence', () => {
    const silent = names.filter((name) => {
      if (NO_TESTS[name]) return false;
      const pkg = readJson(resolve(ROOT, name, 'package.json')) as { scripts?: Record<string, string> };
      return !pkg.scripts?.test;
    });
    expect(silent).toEqual([]);
  });

  it('actually contains tests for that script to run', () => {
    // A script with nothing to run is the same green as no script, one step later.
    const empty = names.filter((name) => {
      if (NO_TESTS[name] || MAY_BE_EMPTY[name]) return false;
      return testFiles(resolve(ROOT, name)).length === 0;
    });
    expect(empty).toEqual([]);
  });

  it('does not pass itself when its tests disappear', () => {
    const vacuous = names.filter((name) => {
      if (MAY_BE_EMPTY[name]) return false;
      const pkg = readJson(resolve(ROOT, name, 'package.json')) as { scripts?: Record<string, string> };
      return (pkg.scripts?.test ?? '').includes('--passWithNoTests');
    });
    expect(vacuous).toEqual([]);
  });

  it('keeps no reason for a workspace that no longer needs one', () => {
    // The §6.41 rule. An excuse outlives the thing it excuses unless something checks.
    const live = new Set(names);
    const stale = [...Object.keys(NO_TESTS), ...Object.keys(MAY_BE_EMPTY)].filter(
      (name) => !live.has(name),
    );
    expect(stale).toEqual([]);
  });
});
