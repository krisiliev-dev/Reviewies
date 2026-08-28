import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

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

  /**
   * And the runner collects them — which is a different claim from either of the above.
   *
   * This check was named "every workspace runs tests" and proved two weaker things: a
   * `test` script exists, and files matching `*.test.ts` exist somewhere beneath. A
   * config whose `include` does not reach them satisfies both and runs nothing.
   *
   * `mobile` was exactly that. Its `include` was `src/**\/*.test.ts`, so every test under
   * `app/` — where expo-router puts the screens, which is most of the workspace — and
   * every `.tsx` test anywhere were silently excluded. §6.73 dropped a deliberately
   * failing test into each and `npm run test --workspace mobile` reported **7 passed**.
   *
   * So stop guessing from filenames and ask the runner. `vitest list --filesOnly` prints
   * exactly what a run would collect, which is the only thing that answers this.
   */
  it('and its runner collects every one of them', () => {
    const missed: string[] = [];
    for (const name of names) {
      if (NO_TESTS[name] || MAY_BE_EMPTY[name]) continue;
      const dir = resolve(ROOT, name);
      const onDisk = testFiles(dir).map((f) => relative(dir, f).replace(/\\/g, '/')).sort();
      if (onDisk.length === 0) continue;

      let listed: string[];
      try {
        listed = execFileSync('npx', ['vitest', 'list', '--filesOnly'], {
          cwd: dir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .sort();
      } catch {
        missed.push(`${name}: could not ask its runner what it collects`);
        continue;
      }

      for (const file of onDisk) {
        if (!listed.includes(file)) missed.push(`${name}: ${file} is never run`);
      }
    }
    expect(missed).toEqual([]);
  }, 120_000);

  /**
   * How many checks each workspace holds, as a floor.
   *
   * §6.109 wrote a new test file over one that already existed — `core/src/test/
   * source.test.ts`, thirteen cases about reading source as code, replaced by four about
   * one new helper — and `npm run verify` went **green**. Every file on disk was still
   * collected, every collected test still passed, and nine checks had stopped existing.
   * The only thing that noticed was reading the summary line and seeing 930 become 921.
   *
   * A ratchet: the number a suite holds today, and it only fails when a suite gets
   * *smaller*. Adding tests never touches it, which is what separates this from the pins
   * §6.94 warns about — those encode an arrangement somebody chose, and this encodes
   * nothing but "nothing was destroyed".
   *
   * It was written slack first — floors a few per cent below the real counts — and the
   * plant walked straight through it: deleting the nine cases that were actually lost
   * left core above a floor of 890. A margin here is a margin for exactly the accident
   * this exists to catch, so there is none. Removing a test on purpose means editing one
   * number with a reason beside it, which is the whole intent.
   *
   * Counted as `it(` blocks in source, not as cases reported by the runner: a loop or an
   * `it.each` turns one block into several, and the two numbers differ by forty in `app`
   * alone. What matters here is that a block stops existing.
   */
  const FLOOR: Record<string, number> = {
    core: 904, app: 518, mobile: 42, relay: 24, bridge: 24, extension: 21,
  };

  it('holds at least as many checks as it did, so a file cannot be silently overwritten', () => {
    const shrunk: string[] = [];
    for (const [name, floor] of Object.entries(FLOOR)) {
      const dir = resolve(ROOT, name);
      const cases = testFiles(dir)
        .map((f) => (readFileSync(f, 'utf8').match(/^\s*(?:it|test)(?:\.\w+)?\(/gm) ?? []).length)
        .reduce((a, b) => a + b, 0);
      if (cases < floor) shrunk.push(`${name}: ${cases} checks, below the ${floor} it had`);
    }
    expect(shrunk).toEqual([]);
  });

  /**
   * And the suites that are not `.test.ts`, which the ratchet above cannot see.
   *
   * §6.109 caught a vitest file being overwritten. The same accident in `app/smoke.mjs`
   * would be quieter still: those suites print their own total — "263/263 checks passed"
   * — and a run with nine fewer checks prints a smaller number and the same word. Nothing
   * has ever compared one run's total to the last.
   *
   * The design harness is ratcheted by its **routes** rather than its clauses, because
   * `capture.mjs` already fails when a route has no `MUST_SHOW` (§6.105). What that does
   * not cover is a route and its clause deleted together, which is a screen quietly
   * dropped out of every design review.
   *
   * `core/src/metadata/fixtures.ts` is deliberately **not** here. Its size is not what
   * matters — §6.43 swept for fixtures smaller than reality and §6.104 for one larger —
   * and the suites that depend on a particular fixture already fail by name when it stops
   * existing. A count would guard the wrong property.
   */
  const SUITE_FLOOR: Record<string, { pattern: RegExp; least: number }> = {
    'app/smoke.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 144 },
    'mobile/smoke.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 77 },
    'app/failures.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 12 },
    'extension/smoke.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 21 },
    'bridge/e2e.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 22 },
    'design/capture.mjs': { pattern: /^ {2}\['\d/gm, least: 12 },
  };

  it('keeps every check the suites that are not vitest files were holding', () => {
    const shrunk: string[] = [];
    for (const [file, { pattern, least }] of Object.entries(SUITE_FLOOR)) {
      const found = (readFileSync(resolve(ROOT, file), 'utf8').match(pattern) ?? []).length;
      if (found < least) shrunk.push(`${file}: ${found}, below the ${least} it had`);
    }
    expect(shrunk).toEqual([]);
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
