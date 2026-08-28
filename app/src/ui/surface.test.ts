import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRESS, SURFACE } from '@reviewies/core/ui/surface';
import { color, elevation } from '@reviewies/core/tokens';

/**
 * Which way a press goes, and what a raised fill is for.
 *
 * The app had **two** press conventions and did not know it. `Key` and Watching Mode's
 * pad sank to `groundWell`; `Row`, `Choice` and `Button` rose to `groundRaised`. Four
 * controls said a press rises and two said it sinks, in one product, and nothing had
 * compared them because each is defensible on its own screen.
 *
 * The rise is the one that breaks. `groundRaised` is also the **card fill** — `lists.tsx`,
 * `people.tsx`, `account.tsx` and `comments/[targetId].tsx` wrap rows in it, and the web
 * does the same on five screens — so a row inside a card presses to the colour it is
 * already painted and **nothing happens**, on the highest-frequency gesture in the product.
 *
 * Not an inference: wrapping Up Next's rows in that fill and re-running the harness printed
 * `-> rgb(28, 25, 30) on rgb(28, 25, 30)`. It is not photographable on today's routes only
 * because every card holding pressable rows is behind an account, which is luck.
 *
 * `design/capture.mjs` measures the press by holding the pointer down, because a style that
 * exists only while pressed is in no stylesheet a source clause can read. This file holds
 * the part a source *can* know: that there is one direction and that it cannot collide.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('a press', () => {
  it('goes one way, and that way is down', () => {
    expect(PRESS).toBe(elevation.sunken);
    expect(SURFACE).toEqual({
      page: elevation.base,
      card: elevation.raised,
      sunk: elevation.sunken,
    });
    /*
     * `elevation` had a name for each of the three grounds since the token file was
     * written and no renderer read it — the third token in this build with a name, a
     * meaning and no consumers, after `ratio.poster` and heading depth. It has one now.
     */
    expect(Object.keys(elevation)).toEqual(['sunken', 'base', 'raised']);
  });

  it('cannot land on the colour it is already sitting on', () => {
    /*
     * The arithmetic that settles the direction, rather than the assertion that somebody
     * once did it. A rise is 1.000 against a card — invisible — where a sink is 1.129.
     * The rise is *stronger* on the plain page (1.080 against 1.046) and that cost is
     * paid deliberately: the sink is the only one of the two that is never zero.
     */
    for (const scheme of ['dark', 'light'] as const) {
      const t = color[scheme];
      expect(t[PRESS], `${scheme}: a press is the card fill`).not.toBe(t[SURFACE.card]);
      expect(t[PRESS], `${scheme}: a press is the page`).not.toBe(t[SURFACE.page]);
    }
  });

  it('is the same one on every control, on both platforms', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of filesUnder('app/src')) {
      for (const m of withoutProse(read(file)).matchAll(/active:bg-ground-(\w[\w-]*)/g)) {
        seen++;
        if (m[1] !== 'well') offenders.push(`${file}: presses to ground-${m[1]}`);
      }
    }
    expect(seen, 'no web press styles were found, so this proved nothing').toBeGreaterThan(3);
    expect(offenders).toEqual([]);

    let phoneSeen = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of withoutProse(read(file)).matchAll(/[^\n]*[Pp]ressed[^\n]*backgroundColor[^\n]*/g)) {
        phoneSeen++;
        if (!/theme\[PRESS\]/.test(m[0])) offenders.push(`${file}: ${m[0].trim()}`);
      }
    }
    expect(phoneSeen, 'no phone press styles were found, so this proved nothing')
      .toBeGreaterThan(2);
    // Read a failure as: this control has its own opinion about which way a press goes,
    // and the app already had two.
    expect(offenders).toEqual([]);
  });

  it('is not what a card is painted with, on the phone, from the table', () => {
    /*
     * The card fill reads the vocabulary now rather than naming the ground directly. That
     * is not cosmetic: the next sprint takes `docs/design/direction.md`'s "rules instead of
     * card fills" through these sites, and a fill that goes through `SURFACE.card` can be
     * found, counted and argued about one site at a time. Nine files carry it today.
     */
    const cards: string[] = [];
    const raw: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      const source = withoutProse(read(file));
      for (const _ of source.matchAll(/theme\[SURFACE\.card\]/g)) cards.push(file);
      for (const _ of source.matchAll(/backgroundColor: theme\.groundRaised, borderRadius: radius\.plate/g)) {
        raw.push(`${file}: a card fill that does not go through the table`);
      }
    }
    /*
     * Seven, down from ten. Three went with the boxed section headings — `account.tsx`,
     * `people.tsx` and `comments/[targetId].tsx` were a heading over a block inside a
     * raised box, which is what `Block` draws without the box. The count is exact so the
     * next one to move has to be a decision somebody writes down.
     */
    expect(cards.length, 'no card fills read the table').toBe(7);
    expect(raw).toEqual([]);
  });
});
