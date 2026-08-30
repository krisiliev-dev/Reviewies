import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { border, space } from '@reviewies/core/tokens';
import {
  TAB_BAR,
  TAB_ICON_BOX,
  TAB_ICON_PATHS,
  TAB_ICON_SIZE,
  TAB_MARKER,
} from '@reviewies/core/ui/tabIcon';

/**
 * The tab bar's marks, held to one table — the pass `key.ts` gave the remote fascia and
 * this control never got.
 *
 * The web stopped typing its icons four sprints before this, and the finding stayed on the
 * web because the table it produced lived in a `.tsx` file under `app/`. The phone went on
 * passing `icon('⌕')`, `icon('✦')`, `icon('☰')`, `icon('⋯')`, and §6.138 photographed the
 * result: the most-seen control in the product, drawn two different ways.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => stripComments(readFileSync(resolve(ROOT, path), 'utf8'));

const RENDERERS = {
  phone: read('mobile/src/ui/TabIcon.tsx'),
  web: read('app/src/ui/TabIcon.tsx'),
};
const BOTH = Object.entries(RENDERERS);
const BARS = {
  phone: read('mobile/app/(tabs)/_layout.tsx'),
  web: read('app/src/App.tsx'),
};

describe('the tab bar’s marks', () => {
  it('reads two renderers and one table', () => {
    for (const [platform, source] of BOTH) {
      expect(source.length, platform).toBeGreaterThan(200);
    }
    expect(Object.keys(TAB_ICON_PATHS).length).toBeGreaterThanOrEqual(TAB_BAR.length);
  });

  it('is drawn rather than typed, on both platforms', () => {
    /*
     * The defect this closes. A glyph's appearance belongs to whatever font the device
     * happens to have: measured in a browser, `▶` and `⚙` drew in full colour because they
     * have emoji presentation variants, `❏` as an empty square — indistinguishable from a
     * missing glyph — and `◔` as a sliver a couple of pixels tall.
     *
     * Every property a check can read was fine on all of them. That is why this asserts the
     * *mechanism* rather than an appearance: a path is the same drawing everywhere.
     */
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} does not read the table`).toContain('TAB_ICON_PATHS[name]');
    }
    // And no bar types one. The range is the emoji and dingbat blocks the web found, plus
    // the geometric shapes `▶ ✦ ☰ ⌕ ⋯` came from.
    for (const [platform, source] of Object.entries(BARS)) {
      expect(source, `${platform}'s bar types a glyph again`).not.toMatch(
        /icon\(['"][^a-z'"][^'"]*['"]\)/,
      );
    }
  });

  it('names its marks rather than drawing them at the call site', () => {
    // A path in a screen is the tenth answer to a question the table answers, which is the
    // shape `key.ts` records for the fascia: one table, not one per surface.
    for (const [platform, source] of Object.entries(BARS)) {
      expect(source, `${platform}'s bar carries path data`).not.toMatch(/d="M[\d.]/);
    }
    for (const tab of TAB_BAR) {
      expect(Object.keys(TAB_ICON_PATHS), `${tab.icon} has no drawing`).toContain(tab.icon);
    }
  });

  it('draws every path inside the box the table declares', () => {
    /*
     * A path drawn for a different viewBox is a mark at the wrong scale beside four right
     * ones, and nothing about the file would say so. Every coordinate has to fit the square.
     */
    for (const [name, path] of Object.entries(TAB_ICON_PATHS)) {
      const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      expect(numbers.length, `${name} has no coordinates`).toBeGreaterThan(3);
      for (const value of numbers) {
        expect(Math.abs(value), `${name} leaves the ${TAB_ICON_BOX} box`).toBeLessThanOrEqual(
          TAB_ICON_BOX + 1,
        );
      }
    }
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} writes its own viewBox`).toContain('TAB_ICON_BOX');
    }
  });

  it('keeps the drawing off the reader’s text setting, on both platforms', () => {
    /*
     * The bar carries five tabs across a phone and an icon that grows with the text setting
     * takes the room the label needs. The label is the part that has to scale — WCAG 1.4.4
     * is about the text — so the drawing stays put and gets out of the way.
     *
     * The phone's icon *was* text, at `text.s20`, so it scaled with the setting and pushed
     * the labels: the one thing the web had deliberately stopped doing.
     */
    expect(TAB_ICON_SIZE).toBeGreaterThan(16);
    /*
     * **Both** dimensions, named. `toContain('TAB_ICON_SIZE')` was the first spelling and a
     * plant walked straight through it: replacing `width` with a literal left `height`
     * still reading the token, so the file contained the string and the mark was half a
     * hand-typed number. §6.139's lesson, in a guard written the same hour it was written
     * down — a clause easier to satisfy than its name.
     */
    for (const [platform, source] of BOTH) {
      for (const side of ['width', 'height'] as const) {
        expect(source, `${platform} sizes its icon's ${side} by hand`).toContain(
          `${side}={TAB_ICON_SIZE}`,
        );
      }
      expect(source, `${platform} draws its icon as text`).not.toMatch(/fontSize|text\.s\d/);
    }
  });

  it('tints by the mechanism each platform has, not by an inherited paint the phone lacks', () => {
    /*
     * §6.183 filed it, §6.184 fixed it. The table's header said the two renderers were "both inheriting
     * `currentColor` so the active tab still tints". **React Native has no inherited
     * paint.** `mobile/src/ui/TabIcon.tsx` says so in its own header and puts
     * `fill={color}` on the `Path`; the web writes `fill="currentColor"` and takes the ink
     * from the link around it.
     *
     * Both tabs tint correctly, so this never cost a pixel. It cost a core table describing
     * a mechanism one of its two readers does not have, which is the shape that gets the
     * next decision made in the wrong place. The prose is corrected; this is the part of it
     * a check can hold. `currentColor` on the phone's `Path` is not a no-op that falls back
     * to the prop — react-native-svg has no such cascade, so the mark would go unpainted.
     */
    expect(RENDERERS.web, 'the web stopped inheriting its ink').toContain('fill="currentColor"');
    expect(RENDERERS.phone, 'the phone is handed no ink to draw with').toContain('fill={color}');
    expect(
      RENDERERS.phone,
      'the phone reaches for an inherited paint React Native does not have',
    ).not.toContain('currentColor');
  });

  it('marks the active tab from one table, not three numbers written out twice', () => {
    /*
     * §6.183 filed it, §6.184 fixed it. The rule over the active tab is the most important piece of wayfinding in the
     * product — §6.90's replacement for a hue that had become a brightness step — and it
     * was three numbers, written out on both platforms, with nothing in the core about it
     * at all. Two of the three agreed. The gap did not: `gap-0.5` (2) on the web against
     * `marginBottom: space.s4` (4) on the phone.
     *
     * Both are on the space scale, so `space.test.ts` passed both and was right to: a scale
     * can say a number is legal and cannot say two platforms picked the same one. That is
     * the distinction this clause exists for, and it is the same one `key.test.ts` makes
     * for the fascia.
     */
    expect(TAB_MARKER.thickness, 'the rule is off the border scale').toBe(border.tally);
    expect(TAB_MARKER.width, 'the rule is off the space scale').toBe(space.s24);
    expect(TAB_MARKER.gap, 'the gap is off the space scale').toBe(space.s2);

    // The phone reads the three, by name, on the rule itself.
    for (const [key, prop] of [
      ['thickness', 'height'],
      ['width', 'width'],
      ['gap', 'marginBottom'],
    ] as const)
      expect(BARS.phone, `the phone sets the rule’s ${prop} by hand`).toContain(
        `${prop}: TAB_MARKER.${key}`,
      );

    /*
     * The web writes Tailwind's generated utilities rather than inline values, by decision —
     * so the class names are derived from the table here rather than typed, the way
     * `space.test.ts` reads the same scale through `px-3`. Typing `gap-0.5` in this file
     * would make it the third copy of the number rather than the check on the second.
     */
    /*
     * The width is a **name** and the gap is still a quarter-step, and the difference is
     * not an inconsistency somebody left — it is where `space.test.ts`'s box sweep reaches.
     *
     * Tailwind's own numeric steps compile to `calc(var(--spacing) * n)` with `--spacing`
     * at `0.25rem`, so `w-6` was 1.5rem: 24 at the default text size and 48 at 200%, over a
     * glyph that `TAB_ICON_SIZE` deliberately holds still at 22 because *"the drawing stays
     * where it is and gets out of the way"*. A marker twice the width of the mark it marks.
     * `w-s24` is `var(--spacing-s24)`, which is 24px at every text size.
     *
     * `gap-0.5` is the same rem arithmetic and is left alone on purpose: it is *space
     * between* two things rather than the size of one, `space.test.ts`'s `UTILITY` clause
     * governs it and passes it, and moving it here would be one site of a hundred and
     * eighty. Recorded rather than fixed — the whole spacing scale being rem on the web is
     * a finding of its own, and this file is not where it gets settled.
     */
    const nameOf = (table: Record<string, number>, px: number) =>
      Object.entries(table).find(([, value]) => value === px)?.[0] ?? '?';
    const quarters = (px: number) => String(px / 4).replace(/^0\./, '0.');
    for (const utility of [
      `w-${nameOf(space, TAB_MARKER.width)}`,
      `gap-${quarters(TAB_MARKER.gap)}`,
      `border-t-${nameOf(border, TAB_MARKER.thickness)}`,
    ])
      expect(BARS.web, `the web’s bar does not draw the rule as ${utility}`).toContain(utility);
  });

  it('budgets the bar for the parts it actually holds', () => {
    /*
     * §6.183 filed it, §6.184 fixed it. `TAB_BAR_HEIGHT` was `space.s8 + size.tap + space.s4 + LABEL_LINE + space.s8`
     * over a comment reading "the 24pt glyph, the 4pt gap under it", and it was wrong three
     * ways at once: `size.tap` is the WCAG 2.5.8 *target floor*, not the glyph, which is
     * `TAB_ICON_SIZE` = 22; the 4 is the rule's `marginBottom`, which puts it *above* the
     * glyph rather than under it; and `border.tally` was not in the budget at all. So the
     * column drew 3 + 4 + 22 = 29 in the 28 the sum allowed.
     *
     * One point over is not academic here. The bar is a fixed height and the label went to
     * `s12` once without it: "Up Next" photographed as "Un Next", descenders gone. Measured
     * in the export at 390x844 the item is 52pt with 46 of content, so the overflow was
     * being absorbed by slack rather than clipping — which is exactly the state that ends
     * at the next change, and the reason to state the parts rather than to leave a number
     * that happens to be big enough.
     *
     * What this cannot see: a budget is not a measurement. `tabBarStyle.paddingBottom` could
     * eat the room back and React Navigation has spacing of its own inside the item; only
     * `design/measure.mjs` answers that, and it is not a guard.
     *
     * ## And one of the five parts is in a unit the reader can change
     *
     * This sprint. Four of them are device pixels; `LABEL_LINE` is a `lineHeight`, which React
     * Native scales by the font scale on both shipping platforms (iOS by
     * `effectiveFontSizeMultiplier`, Android through `toPixelFromSP`). A `height` is not a
     * unit anything scales, so the label's term has to be scaled here for the bar to hold
     * what it is budgeting for — and only that term, because scaling the padding and the
     * glyph as well would be a second defect wearing the first one's face.
     *
     * This clause read `/const TAB_BAR_HEIGHT =([^;]+);/` and went **red on that repair**,
     * because the sum became a function of the scale and stopped being a `const` of that
     * name. It was pinned to a spelling rather than to the fact it is named for — the shape
     * §6.139 wrote down, and the second time this file has made it. The rule is that the bar
     * states its height once from the parts; how it is spelled is not the rule.
     */
    const height = /const \w*[Tt]ab[Bb]ar[Hh]eight\w* =[^;]*?=?>?([^;]+);/.exec(BARS.phone)?.[1] ?? '';
    expect(height, 'the bar states no height').not.toBe('');
    expect(height, 'the bar budgets the 24pt tap floor for a 22pt glyph').not.toContain('size.tap');
    for (const part of ['TAB_MARKER.thickness', 'TAB_MARKER.gap', 'TAB_ICON_SIZE', 'LABEL_LINE'])
      expect(height, `the bar’s height does not count ${part}`).toContain(part);

    // The label's term answers the reader's setting; the four device-pixel terms do not.
    expect(height, 'the label’s line is not scaled, so the bar cannot hold it')
      .toMatch(/LABEL_LINE \* fontScale/);
    for (const fixed of ['TAB_MARKER.thickness', 'TAB_MARKER.gap', 'TAB_ICON_SIZE'])
      expect(height, `${fixed} is a device pixel and must not be scaled`)
        .not.toMatch(new RegExp(`${fixed.replace('.', '\\.')} \\* fontScale`));
  });

  it('is one mark, not a second name for the reader to arrow past', () => {
    /*
     * The label beside it says what the tab is. A drawing that announces itself is the same
     * state read twice, which is the collision `row.ts` records for a listing row.
     *
     * The phone's half of this clause used to read `accessibilityElementsHidden`, and
     * §6.173 measured that prop reaching **nothing** in the web export: react-native-web's
     * `createDOMProps` does not mention it, so this clause was green for a tab bar whose
     * icons were in the reading order. Worse than green — react-native-svg's web build
     * passed the sibling prop through onto all ten `<svg>` elements as an invalid HTML
     * attribute. So it is the flat spelling on both sides now: the web writes it as
     * `aria-hidden="true"`, the phone as a bare JSX `aria-hidden`, and `View` expands it
     * into the two React Native props on a device.
     *
     * A clause naming the wrong spelling is §6.121's shape from the other end — it *can*
     * fail, it just cannot fail for the thing its name is about.
     */
    expect(RENDERERS.web).toContain('aria-hidden="true"');
    expect(RENDERERS.phone).toMatch(/\baria-hidden\b/);
  })
});
