import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { CHOICE_SIZE, CHOSEN, announce } from '@reviewies/core/ui/choice';
import { border, color, size } from '@reviewies/core/tokens';

/**
 * One of several is a radio, not a button, and it is never smaller than a thumb.
 *
 * Five controls in this build are the same thing. `calendar.tsx` said `radiogroup` and
 * `radio` and put the hint in the announced name; Watching Mode's density chips said
 * `accessibilityRole="button"` with a `selected` flag, at `minWidth: 26, minHeight: 24` —
 * half the house target, on the flagship screen, written a fortnight apart by the same
 * hand. Nothing compared them, which is why both shipped.
 *
 * A button says "this does something". A radio says "this is one of several and it is the
 * one that is on", which is the entire content of the control.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const PHONE = ['mobile/app', 'mobile/src'].flatMap((t) => sources(resolve(ROOT, t)));
const read = (path: string) => stripComments(readFileSync(path, 'utf8'));
const RENDERER = read(resolve(ROOT, 'mobile/src/ui/Choice.tsx'));
/** Repo-relative, because `read` above takes an absolute path and a clause that
 *  forgets is green from the repo root and red under `npm run verify`. */
const inRepo = (path: string) => read(resolve(ROOT, path));

describe('the choice contract', () => {
  it('reads a renderer and a table rather than nothing', () => {
    expect(RENDERER.length).toBeGreaterThan(1000);
    expect(Object.keys(CHOICE_SIZE)).toEqual(['chips', 'rows']);
    expect(announce({ key: 'a', label: '24', hint: 'about six a minute' })).toBe(
      '24 — about six a minute',
    );
    expect(announce({ key: 'a', label: '24' })).toBe('24');
  });

  it('is never smaller than the house target, in either density', () => {
    // 26×24 is what the density chips were. WCAG 2.5.8's floor is 24 and the house
    // standard is 44; a chip is not the place to discover the difference.
    for (const metrics of Object.values(CHOICE_SIZE)) {
      expect(metrics.minHeight).toBe(size.target);
    }
    expect(CHOICE_SIZE.chips.minWidth).toBe(size.target);
  });

  it('says radio, and says it in the renderer too', () => {
    expect(RENDERER).toContain('accessibilityRole="radiogroup"');
    expect(RENDERER).toContain('accessibilityRole="radio"');
    // The hint belongs to the name. A second text node is a thing to arrow past.
    expect(RENDERER).toContain('announce(option)');
  });

  it('marks the chosen one with a rule and a weight, never a fill', () => {
    /*
     * §6.90 spent 822 sites turning fills into rules; a selected chip is the one control
     * that would have quietly kept one. A rule plus a weight step is two channels rather
     * than colour alone — §6.91's argument for the tab bar, one control down — so it
     * survives being read by somebody who cannot separate the two greys.
     */
    expect(CHOSEN.rule).toBe(border.tally);
    expect(CHOSEN.label.off).toBe('inkSecondary');
    expect(CHOSEN.label.on).toBe('ink');
    expect(RENDERER).not.toMatch(/backgroundColor:\s*theme\.(actionFill|workingFill)/);
  });

  it('marks it in a colour that clears 3:1 on every ground', () => {
    // A selection rule identifies a state, so WCAG 1.4.11 applies. Measured on all three
    // grounds in both themes rather than the flattering one.
    const luminance = (hex: string) => {
      const v = hex.replace('#', '');
      const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
      const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const theme of ['dark', 'light'] as const) {
      const table = color[theme];
      for (const ground of [table.ground, table.groundRaised, table.groundWell]) {
        expect(contrast(table[CHOSEN.colour], ground), `${theme} on ${ground}`).toBeGreaterThan(3);
      }
    }
  });

  it('offers one scrolling line, and both renderers actually do it', () => {
    /*
     * §6.109. A group whose length is the person's data rather than the product's:
     * Stats has one chip per year with a watch in it, so a decade of imported TV Time
     * put thirteen chips in three rows above the figures the screen exists for.
     *
     * Both halves are checked because a prop declared and honoured on one platform is
     * the shape §6.87 named — emitted is not rendered — and this contract has five call
     * sites that must not start scrolling by accident.
     */
    expect(inRepo('core/src/ui/choice.ts'), 'the contract has no scroll').toMatch(
      /^\s*scroll\?: boolean;$/m,
    );
    const web = inRepo('app/src/ui/Choice.tsx');
    expect(web, 'the web declares scroll and does nothing with it').toContain('overflow-x-auto');
    expect(web, 'thirteen chips would be squeezed rather than scrolled').toContain('shrink-0');
    const phone = inRepo('mobile/src/ui/Choice.tsx');
    expect(phone, 'the phone declares scroll and does nothing with it').toMatch(
      /const Group = scroll \? ScrollView : View;/,
    );
    // And it is off unless asked for: four of the five call sites are fixed lists.
    expect(web).toContain("scroll = false");
    expect(phone).toContain("scroll = false");
  });

  it('is two questions on Stats, on both platforms', () => {
    /*
     * The windows and the years were one radiogroup, which reads as one question with
     * thirteen answers. Measured on a ten-year library at 390px: 148px of control and the
     * first figure at y=236 of an 844px viewport, against 88 and 222 for two groups with
     * the years scrolling. The alternative that keeps the years wrapping came to 140 and
     * pushed the figures to 274 — recorded because it was built and photographed, not
     * because it was imagined.
     */
    for (const path of ['app/src/screens/Stats.tsx', 'mobile/app/stats.tsx']) {
      const source = inRepo(path);
      const groups = source.match(/<Choice\b/g) ?? [];
      expect(groups.length, `${path} does not offer two groups`).toBe(2);
      expect(source, `${path} does not name Year in review`).toContain('Year in review');
      expect(source, `${path}'s years do not scroll`).toMatch(/\bscroll\b/);
    }
  });

  it('leaves no one-of-several wearing a button’s role', () => {
    /*
     * The defect itself, on the phone: a `Pressable` that carries `selected` in its
     * accessibility state while calling itself a button. `Choice` is the only thing that
     * should be expressing "one of these is on", so nothing else may claim it.
     *
     * Deliberately not looking for `checked` as well — a checkbox legitimately carries
     * that, and `CrossOff` will be one.
     */
    const off: string[] = [];
    for (const path of PHONE) {
      if (path.endsWith('Choice.tsx')) continue;
      const text = read(path);
      // The two attributes can be lines apart, so the unit is the element.
      for (const element of text.split('<Pressable').slice(1)) {
        const head = element.slice(0, element.indexOf('>'));
        if (/accessibilityRole="button"/.test(head) && /selected:/.test(head)) {
          off.push(relative(ROOT, path));
        }
      }
    }
    expect(off, 'a control that is one of several is a radio').toEqual([]);
  });
});
