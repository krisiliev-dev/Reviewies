import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { duration, reduced, stagger, reducedStagger, linger } from '@reviewies/core/tokens';

/**
 * Reduce Motion is answered by a table, not by a ternary at every call site.
 *
 * `RemoteDrawer.tsx` wrote `duration: reduced ? 0 : 200`. That is correct and it is the
 * wrong shape: it puts the accessibility decision in every component that animates, so a
 * component that forgets it is invisible until somebody with the setting turned on opens
 * that screen. It is the identical failure `phoneTextScaling.test.ts` exists for, one
 * property along.
 *
 * A parallel table with the same keys makes forgetting impossible: a new duration with no
 * reduced counterpart fails here rather than on a stranger's phone.
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

const TREES = ['mobile/app', 'mobile/src', 'app/src'];
const files = TREES.flatMap((t) => sources(resolve(ROOT, t)));

describe('the motion tables', () => {
  it('reads real tables rather than empty objects', () => {
    expect(Object.keys(duration).length).toBeGreaterThanOrEqual(5);
    expect(files.length, 'found no sources to check').toBeGreaterThan(60);
  });

  it('answers every duration with a reduced one', () => {
    const missing = Object.keys(duration).filter((k) => !(k in reduced));
    expect(missing, 'durations with no Reduce Motion answer').toEqual([]);
  });

  it('answers every stagger with a reduced one', () => {
    const missing = Object.keys(stagger).filter((k) => !(k in reducedStagger));
    expect(missing).toEqual([]);
  });

  it('never makes the reduced value longer than the full one', () => {
    for (const [key, ms] of Object.entries(reduced)) {
      expect(ms, key).toBeLessThanOrEqual(duration[key as keyof typeof duration]);
    }
  });

  /**
   * Reduced motion removes travel, never information. A cross-fade is not travel, which
   * is why the spine keeps 100ms rather than dropping to 0 — checked so that "simplify
   * it to zero" cannot quietly take the cross-fade with it.
   */
  it('keeps the cross-fades that carry meaning', () => {
    expect(reduced.spine).toBeGreaterThan(0);
    expect(reduced.tick).toBe(duration.tick);
  });

  /**
   * Timing is WCAG 2.2.1; animation is 2.3.3. Shortening the six-second undo window
   * under Reduce Motion would take the safety net away from the people most likely to
   * need it, so `linger` deliberately has no counterpart and that is asserted.
   */
  it('never gives a timing window a reduced value', () => {
    const wrong = Object.keys(linger).filter((k) => k in reduced);
    expect(wrong, 'timing is not animation').toEqual([]);
    expect(linger.undo).toBeGreaterThanOrEqual(5000);
  });
});

describe('nobody decides Reduce Motion at a call site', () => {
  it('has no ternary picking a duration by the reduced flag', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      // `reduced ? 0 : 200` and its spellings — the shape, not one variable name.
      if (/\b(reduced|reduceMotion|prefersReduced\w*)\s*\?\s*\d+\s*:\s*\d+/.test(source)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders, 'pick from the reduced table instead').toEqual([]);
  });
});

describe('a value that must agree with one held elsewhere', () => {
  /**
   * `tokens.ts` imports nothing, so this is checked rather than shared — the same shape
   * as the copy guard checking `UPCOMING_DAYS` against the words "two months".
   */
  it('keeps linger.reaction equal to REACTION_VISIBLE_MS', () => {
    const source = readFileSync(resolve(ROOT, 'core/src/watching/reactions.ts'), 'utf8');
    const match = /REACTION_VISIBLE_MS\s*=\s*(\d+)/.exec(stripComments(source));
    expect(match, 'REACTION_VISIBLE_MS has moved or been renamed').not.toBeNull();
    expect(linger.reaction).toBe(Number(match![1]));
  });
});
