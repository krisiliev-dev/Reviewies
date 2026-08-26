import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * A calendar date and an instant are different things, and only one file may convert
 * between them.
 *
 * `2026-08-26` is a square on somebody's wall. `1756166400000` is a moment. Turning one
 * into the other requires knowing whose calendar is meant, and JavaScript answers that
 * question silently and wrongly: `Date.parse('2026-08-26')` is UTC midnight, and
 * `new Date(ms).toISOString().slice(0, 10)` is UTC's day. Both are right in Greenwich
 * and wrong for most of the people who will ever use this.
 *
 * What that cost, before §6.66: Up Next offered an episode airing tomorrow from teatime
 * today in Los Angeles, and hid one airing today until 2pm in Kiritimati. The calendar
 * dropped today's episodes the evening before. An export made at 9pm was stamped
 * tomorrow. Nothing caught any of it, because the runner's clock is UTC — where the two
 * readings agree — and because every air-date fixture is *days* from now, so an error of
 * a few hours never crossed a boundary.
 *
 * So the conversion lives in `core/src/time.ts` and nowhere else, and the spellings that
 * do it by hand are banned here. Every exception is listed below with the reason it is
 * one; an entry that no longer matches anything fails too, so this list cannot outlive
 * the code it excuses (§6.41).
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/** Where the product's own source lives. Not tests: a test may say what it likes. */
const TREES = ['core/src', 'app/src', 'mobile/app', 'mobile/src', 'extension/src'];

/**
 * The spellings that convert without saying whose calendar they mean.
 *
 * Each is the exact shape of a bug that was in this repository, not a hypothetical.
 */
const BANNED: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /toISOString\(\)\s*\.\s*(?:slice|substring)\(\s*0\s*,\s*10\s*\)/,
    why: "UTC's calendar day, not the viewer's — use dayKey/todayKey from core/src/time.ts",
  },
  {
    pattern: /toISOString\(\)\s*\.\s*split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/,
    why: "the same thing spelled differently — use dayKey from core/src/time.ts",
  },
  {
    pattern: /(?:Date\.parse|new Date)\s*\([^)\n]*\b(?:airDate|dayKey|\.day)\b/,
    why: 'a calendar date read as an instant — use startOfDay from core/src/time.ts',
  },
  {
    pattern: /T00:00:00/,
    why: 'local midnight by string surgery — use startOfDay from core/src/time.ts',
  },
];

/**
 * The exceptions, each with the reason it is one.
 *
 * Empty, and that is the finding rather than an oversight. `core/src/time.ts` was
 * written in expecting to need an entry here — it is the one file allowed to convert —
 * and it turns out not to: building a date from its parts and reading one back through
 * `getFullYear`/`getMonth`/`getDate` never needs the UTC spellings at all. So the ban is
 * total, including inside the converter, and this map stays empty until something earns
 * a place in it.
 *
 * Keyed by the path as this guard reports it, so a moved file would lose its excuse and
 * have to earn a new one.
 */
const EXEMPT: Record<string, string> = {};

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** Prose is not code: a comment naming the banned spelling is how it gets explained. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('converting between a calendar date and an instant', () => {
  const files = TREES.flatMap((tree) => sources(resolve(ROOT, tree)));

  it('finds the source rather than passing on an empty list', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('happens in one place, and everywhere else says whose calendar it means', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const path = relative(ROOT, file);
      if (EXEMPT[path]) continue;
      const source = withoutComments(readFileSync(file, 'utf8'));
      source.split('\n').forEach((line, i) => {
        for (const { pattern, why } of BANNED) {
          if (pattern.test(line)) offenders.push(`${path}:${i + 1} — ${why}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has no exemption left over from code that has moved on', () => {
    // The §6.41 rule: a written excuse outlives the thing it excuses unless something
    // checks. An exemption for a file that no longer converts anything is a licence
    // nobody asked for, sitting open.
    const stale: string[] = [];
    for (const [path, reason] of Object.entries(EXEMPT)) {
      let source: string;
      try {
        source = withoutComments(readFileSync(resolve(ROOT, path), 'utf8'));
      } catch {
        stale.push(`${path} — exempted, but no longer exists`);
        continue;
      }
      if (!BANNED.some(({ pattern }) => pattern.test(source))) {
        stale.push(`${path} — exempted for "${reason}", but nothing there matches`);
      }
    }
    expect(stale).toEqual([]);
  });
});
