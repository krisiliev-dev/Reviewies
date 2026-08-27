import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';

/**
 * A browser suite must not find an element by a class the design system owns.
 *
 * `app/smoke.mjs` located the catch-up sheet with `div.rounded-t-3xl`. §6.89 renamed the
 * corner tokens, and the suite spent thirty seconds waiting for a class that no longer
 * existed — a suite failing because the app got a design decision *right*.
 *
 * The same file had the worse version of it two hundred lines earlier:
 * `.will-change-transform`, counted and asserted to be **zero**. A selector that matches
 * nothing satisfies that forever, so a rename there would not have failed loudly — it
 * would have quietly retired the check §6.78 wrote, and the replayed-reactions bug could
 * have come back to nothing. §6.71's shape: a stuck queue looks exactly like an empty one.
 *
 * A class is a design decision and is meant to change. A role, an accessible name and a
 * `data-` hook are promises, and the app has plenty of them — every other locator in
 * these suites already uses one. This is the rule those two were the exception to.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

const SUITES = ['app/smoke.mjs', 'app/failures.mjs', 'mobile/smoke.mjs', 'design/capture.mjs']
  .map((path) => resolve(ROOT, path))
  .filter((path) => existsSync(path));

/** The call forms that take a CSS selector, and the selector they were given. */
const SELECTOR = /\b(?:locator|waitForSelector|querySelectorAll|querySelector|\$\$?)\(\s*(['"`])([^'"`]*)\1/g;

/**
 * Classes the token layer generates. Not every Tailwind utility — `flex` and `truncate`
 * describe what an element *is* doing and no design sprint renames them. These are the
 * ones a token table decides, so these are the ones that move.
 */
const OWNED = /\.(rounded|bg|text|border|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|z)-/;

describe('what the browser suites select on', () => {
  it('reads the suites rather than an empty list', () => {
    expect(SUITES.length).toBeGreaterThanOrEqual(3);
    for (const path of SUITES) {
      expect(readFileSync(path, 'utf8').length, relative(ROOT, path)).toBeGreaterThan(1000);
    }
  });

  it('finds selectors rather than matching nothing', () => {
    // This guard reports offenders, so a regex that stopped matching would pass silently.
    const found = SUITES.flatMap((path) => [
      ...stripComments(readFileSync(path, 'utf8')).matchAll(SELECTOR),
    ]);
    expect(found.length, 'no selector call was recognised at all').toBeGreaterThan(20);
  });

  it('names no class the design system owns', () => {
    const off: string[] = [];
    for (const path of SUITES) {
      const text = stripComments(readFileSync(path, 'utf8'));
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(SELECTOR)) {
          if (OWNED.test(match[2])) {
            off.push(`${relative(ROOT, path)}:${index + 1}  ${match[2]}`);
          }
        }
      });
    }
    expect(off, 'select by role, accessible name or a data- hook').toEqual([]);
  });
});
