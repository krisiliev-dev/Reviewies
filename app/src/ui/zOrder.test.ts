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
  it('keeps undo above the drawer and the banner above everything', () => {
    expect(z.undo).toBeGreaterThan(z.drawer);
    expect(z.banner).toBe(Math.max(...Object.values(z)));
  });
});

describe('nobody types a stacking number', () => {
  it('has no raw zIndex literal outside the token table', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const m of source.matchAll(/\bzIndex:\s*(\d+)/g)) {
        offenders.push(`${relative(ROOT, file)}: zIndex: ${m[1]}`);
      }
      for (const m of source.matchAll(/\bz-\[(\d+)\]/g)) {
        offenders.push(`${relative(ROOT, file)}: z-[${m[1]}]`);
      }
    }
    expect(offenders, 'use the z table').toEqual([]);
  });
});
