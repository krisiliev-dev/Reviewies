import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { z } from '@reviewies/core/tokens';

/**
 * Stacking order is a table, because a collision is invisible until it is not.
 *
 * The three numbers this token set was extracted from — handle 40, scrim 45, drawer 50 —
 * were already correct and already anonymous, sitting as bare literals in one file. The
 * failure that shape allows is typing a plausible number somewhere else: `zIndex: 45` on
 * Watching Mode's reaction band collides with the scrim, and the remote drawer then opens
 * *behind* the reactions in the flagship feature, on a device, for one person.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const files = ['mobile/app', 'mobile/src', 'app/src'].flatMap((t) => sources(resolve(ROOT, t)));

describe('the z-order table', () => {
  it('reads a table and a tree rather than nothing', () => {
    expect(Object.keys(z).length).toBeGreaterThanOrEqual(8);
    expect(files.length).toBeGreaterThan(60);
  });

  it('gives every layer its own number', () => {
    const values = Object.values(z);
    expect(new Set(values).size, 'two layers share a number').toBe(values.length);
  });

  it('is ordered the way it is written', () => {
    // Declaration order is the reading order, so a table that climbs is a table anybody
    // can reason about without running it.
    const values = Object.values(z);
    for (let i = 1; i < values.length; i++) {
      expect(values[i], `${Object.keys(z)[i]} is out of order`).toBeGreaterThan(values[i - 1]);
    }
  });

  /**
   * The six-second undo chip has to be reachable from inside Watching Mode with the
   * drawer open, and the failure banner is the thing that says the app could not do what
   * you asked. Both are asserted rather than left to the order happening to be right.
   */
  it('keeps undo above the drawer, and the two things that must never be covered on top', () => {
    expect(z.undo).toBeGreaterThan(z.drawer);

    // The banner is above every surface, because it is the thing that says the app
    // could not do what you asked. The skip link is above even that, and only while
    // focused: a keyboard user who cannot see where focus went has lost the one thing
    // it exists for. This assertion said "banner above everything" until the skip link
    // was named, and the guard caught the change rather than the change caught it.
    expect(z.skipLink).toBe(Math.max(...Object.values(z)));
    expect(z.banner).toBeGreaterThan(z.dialog);
    expect(z.skipLink).toBeGreaterThan(z.banner);
  });
});

/**
 * Stacking that is local to one component, and correctly not in the table.
 *
 * The `z` table names the layers of the *app* — what covers what across screens. Two
 * halves of a single star, inside their own positioned parent, are not competing with
 * the remote drawer and giving them an app-level name would be worse than the literal:
 * it would imply a relationship that does not exist.
 *
 * The distinction is real, so it is written down rather than smuggled through a
 * threshold like "10 and below is local", which would be a rule nobody could apply.
 */
const LOCAL: Record<string, string> = {
  'app/src/ui/StarRating.tsx':
    'Two halves of one star, stacked inside their own relative parent for the half-star hit areas.',
};

describe('nobody types a stacking number', () => {
  it('keeps no excuse for a file that has stopped stacking locally', () => {
    // The same self-cleaning shape as the other exemption lists here: a file that no
    // longer contains a local stack has no business being on this list.
    const stale = Object.keys(LOCAL).filter((path) => {
      const full = files.find((f) => relative(ROOT, f) === path);
      return !full || !/\bz-\d|zIndex:\s*\d/.test(readFileSync(full, 'utf8'));
    });
    expect(stale, 'these are exempted but no longer stack').toEqual([]);
  });

  it('has no raw zIndex literal outside the token table', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (relative(ROOT, file) in LOCAL) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const m of source.matchAll(/\bzIndex:\s*(\d+)/g)) {
        offenders.push(`${relative(ROOT, file)}: zIndex: ${m[1]}`);
      }
      // Both spellings. `z-[45]` is the obvious one; a bare `z-40` is Tailwind's own
      // scale and was the shape actually in this codebase — it looks like a utility
      // rather than a number, which is exactly why it slipped past the first version of
      // this check. `var(--z-*)` is what replaces them.
      for (const m of source.matchAll(/\bz-(?:\[(\d+)\]|(\d+))(?![\w-])/g)) {
        offenders.push(`${relative(ROOT, file)}: z-${m[1] ?? m[2]}`);
      }
    }
    expect(offenders, 'use the z table').toEqual([]);
  });
});
