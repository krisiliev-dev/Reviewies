import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';
import { PLOT_FILL, SPINE, SPINE_COLOUR } from '@reviewies/core/ui/spine';
import { color, space } from '@reviewies/core/tokens';
import { stripComments, styleOf } from '@reviewies/core/test/source';

/**
 * `YearSpine`, on both platforms, held to the table it is drawn from.
 *
 * `core/src/stats/spine.test.ts` holds the arithmetic. This holds the two renderers, and it
 * exists because `progress.ts` is the cautionary tale one directory over: a table stating a
 * height, two components each insetting it by a border of their own, and a fill drawing four
 * points where the table said six — on **both** platforms at once, for as long as the
 * component had existed, with every clause green. Two renderers agreeing with each other and
 * disagreeing with the table is invisible to any check that compares them to each other.
 *
 * So every clause here compares a renderer to `core/src/ui/spine.ts`, never to its twin.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** Prose is not evidence: a needle quoted in a comment satisfied a `toContain` twice this
    year, which is what `clauses.test.ts` was written for. */
const source = (p: string) => stripComments(read(p));

const WEB = 'app/src/ui/YearSpine.tsx';
const PHONE = 'mobile/src/ui/YearSpine.tsx';

describe('the year spine', () => {
  it('is on both Stats screens, which is the only place it is drawn', () => {
    expect(source('app/src/screens/Stats.tsx')).toContain('<YearSpine');
    expect(source('mobile/app/stats.tsx')).toContain('<YearSpine');
  });

  it('takes its geometry from the table and does the subtraction nowhere else', () => {
    /*
     * `PLOT_FILL` is `plot - slot - gap`, and the whole open-cell design rests on it. A
     * renderer that recomputes it is a renderer that can drift from it — which is exactly
     * how `progress.ts` came to have a fill two points shorter than its own stated height.
     * So the subtraction appears once, in the table, and is imported.
     */
    for (const file of [WEB, PHONE]) {
      expect(source(file), `${file} recomputes the fill area`).not.toMatch(/SPINE\.plot\s*-/);
      expect(source(file), `${file} does not use the table's fill area`).toContain('PLOT_FILL');
    }
    expect(PLOT_FILL).toBe(SPINE.plot - SPINE.slot - SPINE.gap);
    // On the space scale, all four of them — a mark is a fill, so it is spacing rather than
    // a stroke weight (`progress.ts`'s note, in the other direction).
    const scale = new Set<number>(Object.values(space));
    for (const value of [SPINE.plot, SPINE.slot, SPINE.gap, SPINE.floor]) {
      expect(scale.has(value), `${value} is not on the space scale`).toBe(true);
    }
  });

  it('draws the pen, the paper and the outline in the colours the table names', () => {
    expect(SPINE_COLOUR).toEqual({
      mark: 'markCrossOff',
      track: 'strokeHairline',
      slot: 'strokeSignal',
    });

    /*
     * The web writes Tailwind literals, because v4 compiles from source text and a class
     * assembled at runtime is never generated; the phone resolves the names through `theme`.
     * Both are compared to the same three table entries, so neither can quietly become a
     * fourth palette.
     */
    const web = source(WEB);
    expect(web).toContain('bg-mark-cross-off');
    expect(web).toContain('bg-stroke-hairline');
    expect(web).toContain('border-stroke-signal');
    expect(web, 'the mark went to amber, which on paper is 1.77:1 with no ink on it')
      .not.toContain('working-fill');

    const phone = source(PHONE);
    for (const role of ['mark', 'track', 'slot'] as const) {
      expect(phone, `the phone spells ${role} rather than reading it`)
        .toContain(`SPINE_COLOUR.${role}`);
    }
    expect(phone, 'a hex in a component is a hex that cannot follow the table')
      .not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it('gives the outline a colour that exists as far as the standard is concerned', () => {
    /*
     * `core/src/tokens.ts` names *"the empty-slot outline"* as the first of the five
     * state-bearing marks `strokeSignal` was aliased to `inkTertiary` for. This is that
     * cell, so it is the clause that makes the alias load-bearing rather than anticipated:
     * the hairline it was originally specified in is 1.42:1 and does not clear WCAG 1.4.11's
     * 3:1 floor for a mark that identifies a state.
     */
    const ratio = (a: string, b: string) => {
      const lum = (hex: string) => {
        const [r, g, blue] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(blue);
      };
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const theme of [color.dark, color.light]) {
      expect(ratio(theme.strokeSignal, theme.ground)).toBeGreaterThan(3);
      expect(ratio(theme.markCrossOff, theme.ground)).toBeGreaterThan(3);
      // And the hairline, which is what the direction asked for, does not — kept as the
      // arithmetic rather than as the claim that somebody once ran it.
      expect(ratio(theme.strokeHairline, theme.ground)).toBeLessThan(3);
    }
  });

  it('rides the open cell on the fill rather than parking it at the top', () => {
    /*
     * `bottom` is the month's own fill plus the gap, so the cell sits on the mark and moves
     * with it — which is what makes marking an episode read as striking *into* it. A cell
     * pinned to the top of the column is a box that happens to be nearby.
     */
    for (const file of [WEB, PHONE]) {
      expect(source(file), `${file} parks the open cell`)
        .toMatch(/bottom:\s*\w+\.height\s*\+\s*SPINE\.gap/);
    }
  });

  it('reads one clock, and neither renderer reads a second', () => {
    /*
     * `spineYears` decides which row is the current year and stamps the open month onto it.
     * Two lines of `new Date().getMonth()` in a component would be a second clock, and on
     * one night a year — the one where the two readings land either side of midnight on 31
     * December — the renderer would look for the open cell in a year the data has no row
     * for and draw nothing at all.
     */
    for (const file of [WEB, PHONE]) {
      expect(source(file), `${file} reads its own clock`).not.toMatch(/new Date\(|Date\.now\(/);
      // The shape rather than the spelling: whatever the row is called, the month the open
      // cell belongs to is the one the row arrived carrying.
      expect(source(file), `${file} does not pass the row's own open month`)
        .toMatch(/spineColumns\(\s*\w+\.months,\s*\w+,\s*\w+\.open\s*\)/);
    }
  });

  it('is one image with one sentence, rather than twelve announced blocks', () => {
    const web = source(WEB);
    expect(web).toContain('role="img"');
    expect(web).toContain('aria-label=');

    const phone = source(PHONE);
    // `accessible` as well as the role: without it, `accessibilityLabel` on a `View` with
    // children names a node VoiceOver walks into anyway, so the row is read twice — once as
    // its name and once as its contents. The web gets the collapse free from the role.
    expect(phone).toContain('accessible');
    expect(phone).toContain('accessibilityRole="image"');
    expect(phone).toContain('accessibilityLabel=');
  });

  it('says nothing it did not get from copy.ts', () => {
    for (const file of [WEB, PHONE]) {
      const text = source(file);
      for (const key of ['yourYears', 'spineYear', 'spineYearNothing', 'openSlot'] as const) {
        expect(text, `${file} does not use COPY.stats.${key}`).toContain(`COPY.stats.${key}`);
      }
    }
    // And the caption is a fact, not an offer. The difference between "the next episode you
    // mark goes here" and "mark an episode to fill it" is `docs/design/calm.md`'s whole
    // argument in one clause, and it is a sentence somebody could soften without noticing.
    expect(COPY.stats.openSlot).toContain('goes here');
    expect(COPY.stats.openSlot).not.toMatch(/\bto (fill|keep|earn|unlock)\b/i);
  });

  it('draws the track as a ground rather than as an outline', () => {
    /*
     * `progress.ts` measured what the other answer costs: a 1pt border on a border-box
     * layout takes two points out of the height the fill measures against, and the phone's
     * `rule` size drew a fill zero points tall for as long as it existed. The track here is
     * a painted rectangle; the only stroke in the component is the open cell.
     */
    const track = styleOf(read(PHONE), 'track');
    expect(track, 'no track style to read').toBeTruthy();
    expect(track).toContain('backgroundColor');
    expect(track, 'the track went back to being an outline').not.toContain('borderWidth');

    const slot = styleOf(read(PHONE), 'slot');
    expect(slot).toContain('borderWidth: SPINE.stroke');
  });

  it('is mounted where a person can be surprised by it and not where they are marking', () => {
    /*
     * The one placement clause, and it is the argument rather than a preference.
     * `docs/design/calm.md` refuses a reward that arrives at the moment of the action: a
     * cell that grows under your thumb every time you mark an episode is a response to
     * behaviour, which is the controlling half of Deci and Ryan's split however pretty it
     * is. This object lives on the screen you go to when you want it — which is also what
     * the phone's own Stats header already says about stats generally, quoting doc 08.
     */
    for (const file of ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx']) {
      expect(source(file), `${file} draws the spine at the point of marking`)
        .not.toContain('YearSpine');
    }
    // The phone's Stats header already carries doc 08's sentence about this, and the
    // placement above is the same argument one screen out. If that quotation goes, the
    // reason for this clause has gone with it and somebody should say so.
    expect(read('mobile/app/stats.tsx')).toContain('stresses me out');
  });

  it('keeps the row’s figures out of the component’s own vocabulary', () => {
    // The visible figure beside a year is `N episodes · 5.4 days`, and the duration half of
    // it comes from `formatDuration` on both platforms — so the row and the sentence a
    // screen reader hears cannot disagree about how long a year was.
    for (const file of [WEB, PHONE]) {
      expect(source(file)).toMatch(/formatDuration\(\w+\.minutes\)/);
    }
  });

  it('heads itself with a section rather than a masthead', () => {
    // A masthead is what a *screen* is called; this is a part of one, and Stats already has
    // its own. `section.ts` owns the depth, so the two cannot end up siblings.
    expect(source(WEB)).toContain('<Section');
    expect(source(PHONE)).toContain('<Section');
  });
});
