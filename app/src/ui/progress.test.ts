import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROGRESS_COLOUR, PROGRESS_FLOOR, PROGRESS_SIZE, progressPercent } from '@reviewies/core/ui/progress';
import { color, radius, space } from '@reviewies/core/tokens';

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
});
