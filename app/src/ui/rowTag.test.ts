import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rowTag } from '@reviewies/core/ui/row';
import { KIND_LABEL } from '@reviewies/core/calendar/upcoming';

/**
 * `Section`'s type without `Section`'s case rule.
 *
 * `core/src/ui/section.ts` states it in a table — *case: uppercase, tracking `t83`* against
 * *case: as written, tracking none* — and says why the two travel together: "a
 * single-channel difference is the one that gets flattened again by the next person tuning
 * a value".
 *
 * `Row`'s tag takes `t83` on both platforms and left the case to whoever called it. Four
 * sites typed `'SERIES'`, `'FILM'`, `'NOT YET'` by hand; the two calendars passed
 * `KIND_LABEL[kind]`, which is sentence case because the same words are a sentence in a
 * notification. So the chip read *Season finale* on the calendar and *SERIES* on Lists —
 * tracked sentence case, the pairing that table rules out.
 *
 * Nobody had seen it because the calendar had never shown a milestone: every fixture show
 * started on the same day and only one reached the future, so `KIND_LABEL` resolved to the
 * empty string on every row of every screenshot ever taken. §6.146 fixed the fixture and
 * §6.148 is what the fixed fixture showed. §6.148.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const SCREENS = [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')];

describe("a row's tag", () => {
  it('is drawn in upper case whatever the caller wrote', () => {
    expect(rowTag('Season finale')).toBe('SEASON FINALE');
    expect(rowTag('SERIES')).toBe('SERIES');
  });

  it('is nothing when there is nothing to say', () => {
    /*
     * `KIND_LABEL.regular` is the empty string — a regular episode has no milestone — and
     * both calendars pass it straight through. `Row` renders on truthiness today, so an
     * empty pill is one refactor away: `tag !== undefined` would draw eleven bordered
     * boxes containing nothing on the screen this component is most used on.
     */
    expect(KIND_LABEL.regular).toBe('');
    expect(rowTag('')).toBeUndefined();
    expect(rowTag(undefined)).toBeUndefined();
  });

  it('is applied by the component, on both platforms', () => {
    for (const [name, file] of [
      ['web', 'app/src/ui/Row.tsx'],
      ['phone', 'mobile/src/ui/Row.tsx'],
    ] as const) {
      expect(withoutProse(read(file)), `${name}'s Row draws the tag as given`).toContain(
        'rowTag(tag)',
      );
    }
  });

  it('travels with the tracking it belongs to', () => {
    /*
     * The section table's point: case and tracking are one decision. A tag that stopped
     * being tracked would want its case back, and a tag that kept the tracking without the
     * case is what this whole finding was.
     */
    expect(withoutProse(read('app/src/ui/Row.tsx'))).toMatch(/const TAG =[\s\S]{0,200}tracking-t83/);
    expect(withoutProse(read('mobile/src/ui/Row.tsx'))).toMatch(
      /tag:\s*\{[\s\S]{0,300}letterSpacing: tracking\(text\.s12, track\.t83\)/,
    );
  });

  it('is not shouted at the call sites any more', () => {
    /*
     * The four that were. A hand-typed `'NOT YET'` still *looks* right on screen, which is
     * why it survived — it is right by coincidence, and it is the reason nobody compared it
     * to the two that were not.
     */
    for (const file of SCREENS) {
      const source = withoutProse(read(file));
      for (const match of source.matchAll(/\btag=\{?['"]([^'"]+)['"]/g)) {
        expect(match[1], `${file} shouts its tag by hand: ${match[1]}`).not.toBe(
          match[1].toUpperCase(),
        );
      }
      // And the ternary form, which is how three of the four were written.
      for (const match of source.matchAll(/\btag=\{[^}]*['"]([A-Z][A-Z ]{2,})['"]/g)) {
        expect.fail(`${file} shouts its tag by hand: ${match[1]}`);
      }
    }
  });
});
