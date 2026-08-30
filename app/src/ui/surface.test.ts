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

    /*
     * A block, not a line. §6.184: this matched `pressed` and `backgroundColor` with
     * `[^\n]*` between and after them — both words on one line — and `Button.tsx` spread
     * them across a
     * three-line ternary:
     *
     *     pressed && !disabled
     *       ? { borderWidth: PRESSED.stroke, backgroundColor: theme[PRESSED.fill] }
     *       : null,
     *
     * so the one control that disagreed was **never in the set**. The sweep matched four
     * files — `Choice`, `Key`, `PadCell`, `Row` — each of which writes
     * `pressed: { backgroundColor: theme[PRESS] }` on one line and therefore passes, and
     * the non-vacuity check below found those four and reported the sweep healthy. A
     * pattern that cannot reach the offender is worse than no pattern, because it reports
     * a number.
     *
     * Counting from `pressed` and reading forward instead, so a ternary, an object spread
     * over lines and a one-liner all land in the same net.
     */
    let phoneSeen = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      const source = withoutProse(read(file));
      for (const m of source.matchAll(/[Pp]ressed\b/g)) {
        const block = source.slice(m.index, m.index + 220);
        if (!/backgroundColor/.test(block)) continue;
        phoneSeen++;
        const fill = /backgroundColor:\s*([^,\n}]+)/.exec(block)?.[1]?.trim() ?? '';
        /*
         * Two spellings, and only two. §6.185 gave a filled control its own step —
         * `surface.ts` has the argument — so `Button`, the one tone table with a fill,
         * chooses between them. Everything else has no fill and takes the ground.
         *
         * This clause said `theme[PRESS]` and nothing else until that landed, and it went
         * red on the repair rather than on a defect: a guard that fails a correct change is
         * a guard stating the rule wrongly, which is the same lesson `design/capture.mjs`
         * learned in the same hour. The allowance is one exact expression rather than a
         * loosened regex, so `theme[fill ? PRESS : SOMETHING_ELSE]` is still an offender.
         */
        const allowed = ['theme[PRESS]', 'theme[fill ? PRESS_FILL : PRESS]'];
        if (!allowed.includes(fill)) offenders.push(`${file}: presses to ${fill}`);
      }
    }
    expect(phoneSeen, 'no phone press styles were found, so this proved nothing')
      .toBeGreaterThan(4);
    // Read a failure as: this control has its own opinion about which way a press goes,
    // and the app already had two.
    expect(offenders).toEqual([]);
  });

  it('is never a transform, which is what both platforms already said in writing', () => {
    /*
     * §6.184. Two files say this in prose and neither said it anywhere a check could read:
     * `app/src/screens/WatchingMode.tsx` records that `active:scale-[0.98]` "was here and is
     * not" because "a scale is a transform and needs a `reduced ?` branch to be honest", and
     * `mobile/src/ui/Row.tsx` says "a ground step, not a scale: press feedback that was never
     * motion is feedback Reduce Motion has nothing to substitute for".
     *
     * `PadCell` carried one on each platform anyway — `active:scale-90` and
     * `transform: [{ scale: 0.94 }]`, the only two transform scales in the build, at two
     * different magnitudes, neither with a `reduced ?` branch. `motion.test.ts` looks for
     * transitions and durations and never for a scale, so the rule existed only as an
     * explanation of a deletion somebody had already done once.
     */
    const scaled: string[] = [];
    for (const file of filesUnder('app/src')) {
      for (const m of withoutProse(read(file)).matchAll(/\b(?:active|hover|focus):scale-[\w.[\]-]+/g)) {
        scaled.push(`${file}: ${m[0]}`);
      }
    }
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      const source = withoutProse(read(file));
      for (const m of source.matchAll(/[Pp]ressed\b/g)) {
        const block = source.slice(m.index, m.index + 220);
        const scale = /transform:\s*\[[^\]]*scale/.exec(block);
        if (scale) scaled.push(`${file}: ${scale[0]}`);
      }
    }
    expect(scaled, 'a press is drawn with a transform, which Reduce Motion cannot substitute for')
      .toEqual([]);
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
     * **Three**, and these three are the rule rather than what is left of a migration.
     * Ten became seven when `Block` took the boxed section headings; seven became three
     * when the four that were *lists of things* became ruled rows — `lists.tsx` (which
     * `18-lists-in.png` showed as inset cards on a screen where every other rule reaches
     * the paper), `comments`' individual comment, `RemotePanel`'s device and
     * `MatchImports`' proposal.
     *
     * What is left is exactly what `SURFACE.card` says a card is — a summary or a form,
     * one object taken in whole:
     *
     * - `(tabs)/more.tsx`'s stats block: three figures and a sentence, read at once;
     * - `ImportFiles.tsx`'s report: what an import did, after it did it;
     * - `ContentWarnings.tsx`'s panel: a disclosure over the page, not a list in it.
     *
     * Exact, not a floor. A fourth card is a decision somebody has to write down.
     */
    expect(cards.length, 'no card fills read the table').toBe(3);
    expect(raw).toEqual([]);
  });
});
