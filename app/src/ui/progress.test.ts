import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROGRESS_COLOUR, PROGRESS_FLOOR, PROGRESS_SIZE, progressPercent } from '@reviewies/core/ui/progress';
import { border, color, radius, space } from '@reviewies/core/tokens';

/**
 * `Progress`, and the amber that was failing in light mode.
 *
 * `docs/design/tokens.md` §3, measured: **`working.fill` on paper is 1.77:1** — it fails 3:1
 * as a non-text UI component, not merely as text. The document's rule is exact: in light,
 * the amber fill is *only ever a filled area with dark ink on it*, never a stroke, a tick, a
 * progress fill or a word.
 *
 * Two web sites were breaking it — the Stats tally bar and the busy underline under a
 * button — and ten more on the phone were a spinner drawn in the fill colour. In dark both
 * tokens resolve to the same amber, which is why it went unseen: the failure exists only
 * under `data-theme="light"`, and no screenshot in `design/screens` is taken in it.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** Two hex colours to a WCAG contrast ratio. */
function ratio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, blue] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(blue);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('a progress bar', () => {
  it('is drawn in the mark colour, because a bar has no ink on it', () => {
    /*
     * The arithmetic, not the assertion that somebody once did it. Amber on the light page
     * is the number the document measured, and the substitute clears 3:1 where it does not.
     */
    expect(ratio(color.light.workingFill, color.light.ground)).toBeCloseTo(1.77, 1);
    expect(ratio(color.light.workingMark, color.light.ground)).toBeGreaterThan(3);
    // And in dark the two are the same colour, which is exactly why this went unseen.
    expect(color.dark.workingFill).toBe(color.dark.workingMark);
    expect(color.light.workingFill).not.toBe(color.light.workingMark);

    expect(PROGRESS_COLOUR.done).toBe('workingMark');
    /*
     * The `DONE` constant, not the file: the component's own header sentence names the class
     * while explaining why it is that one, so a whole-file `toContain` was satisfied by the
     * prose. `clauses.test.ts` flagged the line — the third time this sprint that a needle
     * had a second copy in a comment.
     */
    const done = /^const DONE = '([^']*)';$/m.exec(read('app/src/ui/Progress.tsx'));
    expect(done, 'no DONE constant to read').toBeTruthy();
    expect(done?.[1]).toContain('bg-working-mark');
    expect(done?.[1], 'the bar went back to the fill').not.toContain('bg-working-fill');
  });

  it('lets the amber fill appear only where the ink that rescues it appears', () => {
    /*
     * The rule the whole component exists for, as a rule rather than a list of sites.
     * `working.fill` is legal as a *filled area with dark ink on it* — the cross-off ring is
     * one, at 9.34:1 — and illegal as anything else. So a class string or style block naming
     * the fill must also name `working.on-fill`; if it does not, the amber is carrying
     * meaning on its own and on paper it cannot.
     */
    const offenders: string[] = [];
    let seen = 0;
    for (const file of filesUnder('app/src')) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const m of source.matchAll(/'([^']*working-fill[^']*)'|"([^"]*working-fill[^"]*)"/g)) {
        const s = m[1] ?? m[2] ?? '';
        seen++;
        if (!s.includes('working-on-fill')) offenders.push(`${file}: ${s}`);
      }
    }
    expect(seen, 'nothing named the fill, so this proved nothing').toBeGreaterThan(0);
    expect(offenders).toEqual([]);

    // The phone is pinned to dark today, so this is a rule kept before it is needed rather
    // than after — the day a light theme lands, thirteen spinners would have inherited it.
    const phone: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const m of source.matchAll(/[^\n]*workingFill[^\n]*/g)) {
        if (!/workingOnFill|RING\./.test(m[0])) phone.push(`${file}: ${m[0].trim()}`);
      }
    }
    expect(phone).toEqual([]);
    expect(read('mobile/src/ui/theme.ts'), 'the phone gained a theme switch; re-check the marks')
      .toContain('export const theme = color.dark;');
  });

  it('is the only thing on either platform that draws a bar', () => {
    const offenders: string[] = [];
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Progress.tsx')) continue;
      for (const m of read(file).matchAll(/style=\{\{ width: `\$\{[^}]*\}%` \}\}/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [file, needle] of [
      ['app/src/screens/Stats.tsx', '<Progress'],
      ['mobile/app/stats.tsx', '<Progress'],
      ['mobile/src/devices/RemotePanel.tsx', '<Progress'],
    ] as const) {
      expect(read(file), `${file} draws its own bar`).toContain(needle);
    }
  });

  it('says what it is measuring, and never renders as empty', () => {
    /*
     * §6.62 put two screenshots side by side: a bar with no number beside it says one show
     * beat another and not by how much of what. The name is required in the type, so the
     * clause is about the floor — a bar at 2% that draws zero pixels reads as "none", and
     * "none" is a different fact from "barely any".
     */
    expect(progressPercent(0, 100)).toBe(0);
    expect(progressPercent(1, 1000)).toBe(PROGRESS_FLOOR);
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(200, 100), 'a bad ratio drew off the end').toBe(100);
    expect(progressPercent(5, 0), 'a zero maximum divided by zero').toBe(0);

    const offenders: string[] = [];
    let seen = 0;
    for (const file of [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of read(file).matchAll(/<Progress\b[\s\S]*?\/>/g)) {
        seen++;
        if (!/\blabel=/.test(m[0])) offenders.push(`${file}: a bar with no name`);
      }
    }
    /*
     * §6.182: the sweep collected offenders and asserted `[]`, which a run finding no bars
     * at all satisfies — a drifted regex or a wrong file list would have passed quietly.
     * Its sibling twenty lines up counts (`nothing named the fill, so this proved nothing`)
     * and this did not, which makes the omission an oversight rather than a decision.
     */
    expect(seen, 'no bar was scanned, so this proved nothing').toBeGreaterThan(2);
    expect(offenders).toEqual([]);
  });

  it('takes its heights from the space scale, since a bar is a fill', () => {
    // The remote's was 3pt — `border.tally`, a stroke width. A bar is a fill and belongs on
    // the space scale; §6.90's note about scales quietly growing the wrong kind of number.
    for (const size of ['bar', 'rule'] as const) {
      expect(Object.values(space), `${size}'s height is off the space scale`)
        .toContain(PROGRESS_SIZE[size].height);
      expect(Object.values(radius), `${size}'s radius is off the scale`)
        .toContain(PROGRESS_SIZE[size].radius);
    }
  });

  it('draws the height it states, because the fill measures against the content box', () => {
    /*
     * The clause above holds the table against the token scale and stops there — `space`
     * contains 2, so `rule: { height: space.s2 }` passes it, and the bar it describes was
     * drawing nothing at all. A number checked against the scale it came from is not
     * checked against the box anybody sees.
     *
     * Measured, both platforms, before this clause existed. `/stats` in the web build:
     * track 6.0pt outer, `border-top` and `border-bottom` 1px, **fill 4.0pt** at 100%,
     * 34% and 9%. The phone's export at `/remote` mid-scan: track 2.0pt, the same two
     * hairlines, **fill 0.0pt** while 33.8pt wide — a bar with a percentage and no body.
     *
     * The cause is one line of box model on each platform. Preflight sets
     * `box-sizing: border-box` and Yoga is border-box with no way to ask for anything
     * else, so the fill's `h-full` / `height: '100%'` resolves against the track's
     * *content* box — the stated height less whatever the track insets it by. A 1pt
     * outline top and bottom takes two of them:
     */
    expect(PROGRESS_SIZE.bar.height - 2 * border.hairline, 'the tally bar has four of its six')
      .toBe(4);
    expect(PROGRESS_SIZE.rule.height - 2 * border.hairline, 'the rule has nothing left at all')
      .toBe(0);

    const web = read('app/src/ui/Progress.tsx');
    const track = /^const TRACK = '([^']*)';$/m.exec(web);
    const done = /^const DONE = '([^']*)';$/m.exec(web);
    const sizes = /^const SIZE_CLASS = \{([\s\S]*?)^\} as const/m.exec(web);
    expect(track && done && sizes, 'the web renderer no longer states its track, fill and sizes')
      .toBeTruthy();

    /*
     * The web writes its heights as class names, so the table's number and the drawn box
     * are two spellings of one fact and nothing was comparing them. `h-s6` against 6.
     */
    for (const size of ['bar', 'rule'] as const) {
      const token = Object.entries(space).find(([, pt]) => pt === PROGRESS_SIZE[size].height)?.[0];
      const line = new RegExp(`${size}: '([^']*)'`).exec(sizes?.[1] ?? '')?.[1] ?? '';
      expect(line, `the web draws ${size} at a height the table does not state`)
        .toContain(`h-${token}`);
    }

    /*
     * Nothing between the two boxes. A border or a padding on the track is subtracted
     * from the height the table states and the fill is what loses it, so the track may
     * carry no inset at all — which is why the track's colour is a **ground** rather than
     * a stroke, and why both halves are asserted: a track with the border taken off and
     * no background is an invisible track, and that is not the fix either.
     */
    const inset = /^(?:border(?:$|-)|p-|p[trblxyse]-)/;
    /*
     * The fill says its height once, and says the whole track. `h-full max-h-px` was
     * planted against the first version of this clause and passed it: a `toContain`
     * satisfied by a class the next class overrules, drawing 1.0pt in a 6.0pt track.
     */
    const classes = (s: string | undefined) => (s ?? '').split(/\s+/);
    expect(classes(done?.[1]).filter((c) => /^(?:max-|min-)?h-/.test(c)),
      'the fill states a height other than the whole of its track').toEqual(['h-full']);
    expect(classes(track?.[1]).filter((c) => inset.test(c)),
      'the web track insets the box its fill measures against').toEqual([]);
    // `strokeHairline` -> `stroke-hairline`: the table names the colour, not this file.
    const ground = `bg-${PROGRESS_COLOUR.track.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    expect(track?.[1], 'the web track lost the colour that makes it a track').toContain(ground);

    const phone = read('mobile/src/ui/Progress.tsx');
    const style = (key: string) => new RegExp(`${key}: \\{([\\s\\S]*?)\\}`).exec(phone)?.[1] ?? '';
    expect(phone, 'the phone stopped taking its height from the table')
      .toContain('height: metrics.height');
    expect(style('done'), 'the phone fill stopped filling its track').toContain("height: '100%'");
    expect(style('done').match(/\b(?:max|min)Height\b/g) ?? [],
      'the phone fill overrules its own height').toEqual([]);
    expect(style('track').match(/\b(?:border\w*Width|padding\w*)\b/g) ?? [],
      'the phone track insets the box its fill measures against').toEqual([]);
    expect(style('track'), 'the phone track lost the colour that makes it a track')
      .toContain('backgroundColor: theme[PROGRESS_COLOUR.track]');

    /*
     * And the last way a stated height stops being the drawn one: the web takes a
     * `className`, appended after the size class, so a call site can quietly overrule it.
     * §6.62's bar-with-no-name lived at the call sites too.
     */
    const overrides: string[] = [];
    let seen = 0;
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Progress.tsx')) continue;
      for (const m of read(file).matchAll(/<Progress\b[\s\S]*?\/>/g)) {
        seen++;
        const passed = /className="([^"]*)"/.exec(m[0])?.[1] ?? '';
        if (passed.split(/\s+/).some((c) => /^h-/.test(c))) overrides.push(`${file}: ${passed}`);
      }
    }
    expect(seen, 'no bar was scanned, so this proved nothing').toBeGreaterThan(0);
    expect(overrides, 'a call site gave the bar a height the table does not state').toEqual([]);

    /*
     * What this cannot see, said out loud rather than left to be discovered: a *transform*.
     * `scale-y-50` on the track was planted last and passes every assertion above — the
     * declared height stays 6px and the drawn box measures 3.0pt — because it scales at
     * paint time and nothing in the source arithmetic is wrong. `design/measure.mjs` is
     * the instrument for that class, and a rectangle is the only thing that answers it.
     */
  });
});
