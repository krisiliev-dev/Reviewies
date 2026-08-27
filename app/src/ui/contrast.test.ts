import { describe, expect, it } from 'vitest';
import { color, label } from '@reviewies/core/tokens';

/**
 * Every ratio, against every ground the role can actually land on.
 *
 * `palette.test.ts` measures the muted grey against the surfaces it sits on, which was
 * the right question for seven colours. The token layer has roles that appear on three
 * grounds each in two themes, and the failure this remembers is measuring the flattering
 * one: dark `ink.tertiary` at `#7F7670` is 4.13 on `ground` and **3.83 on `raised`** —
 * and `raised` is the ground a listing row sits on, so a guard that only tested `ground`
 * would pass text that fails where it is printed.
 *
 * The floor of the system is 4.51 and there is deliberately no headroom there. That is a
 * fact to hold, not a number to nudge.
 */

/** WCAG 2.1 relative luminance. Same arithmetic as `palette.test.ts`, checked below. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = ['dark', 'light'] as const;
const GROUNDS = ['ground', 'groundRaised', 'groundWell'] as const;

/** The ground each theme is tightest on, which is where a 3:1 role gets tested. */
const TIGHTEST = { dark: 'groundRaised', light: 'groundWell' } as const;

describe('the arithmetic itself', () => {
  /**
   * Kept verbatim from `palette.test.ts`. A contrast guard is only worth having if its
   * maths is right, and the published value for this pair is 4.48.
   */
  it('agrees with the published value for #777777 on white', () => {
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric and bottoms out at 1', () => {
    expect(contrast('#131114', '#F4EFE7')).toBeCloseTo(contrast('#F4EFE7', '#131114'), 6);
    expect(contrast('#131114', '#131114')).toBeCloseTo(1, 6);
  });
});

describe('text, on every ground it can land on', () => {
  for (const theme of THEMES) {
    const c = color[theme];

    it(`reads the ${theme} palette rather than an empty object`, () => {
      expect(Object.keys(c).length).toBeGreaterThan(18);
      expect(c.ink).toMatch(/^#[0-9A-F]{6}$/i);
    });

    for (const role of ['ink', 'inkSecondary', 'inkTertiary'] as const) {
      it(`${theme}: ${role} clears 4.5 on all three grounds`, () => {
        for (const ground of GROUNDS) {
          expect(contrast(c[role], c[ground]), `${role} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }

    it(`${theme}: a label on its own fill clears 4.5`, () => {
      expect(contrast(c.actionLabel, c.actionFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.workingOnFill, c.workingFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.troubleOn, c.trouble)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: the cross-off pen is legible on the ground a row sits on`, () => {
      expect(contrast(c.markCrossOff, c.groundRaised)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('marks and strokes, on the tightest ground rather than the flattering one', () => {
  for (const theme of THEMES) {
    const c = color[theme];
    const tight = c[TIGHTEST[theme]];

    it(`${theme}: a stroke that means something clears 3.0`, () => {
      // Separators are exempt because they carry no meaning; these are not separators.
      expect(contrast(c.strokeSignal, tight)).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: the working mark clears 3.0`, () => {
      expect(contrast(c.workingMark, tight)).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: every one of the eight labels clears 3.0`, () => {
      label[theme].forEach((hex, i) => {
        expect(contrast(hex, tight), `label ${i} (${hex})`).toBeGreaterThanOrEqual(3);
      });
    });

    /**
     * The focus indicator is two rings, and the property is that ONE of them separates
     * from whatever it is drawn around — not that both do.
     *
     * Written the strict way first, and it failed: in light, the inset is the near-white
     * ground and the fill is amber, which is 1.77:1 — the same pair that forced the
     * `workingMark` split. The tokens were right and the assertion was wrong. In light
     * the outer ring is the near-black ink and clears amber at 9.04, so the inset is not
     * doing that job there; against the near-black action pill it is the inset that does
     * it, at 16.02. Each of the four cases is carried by one ring or the other.
     *
     * The spec computed these for dark only. Light was never checked by anybody.
     */
    it(`${theme}: one of the two rings separates from every fill it rings`, () => {
      for (const fill of [c.actionFill, c.workingFill, c.trouble] as const) {
        const best = Math.max(contrast(c.focusRing, fill), contrast(c.focusInset, fill));
        expect(best, `neither ring separates from ${fill}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${theme}: the outer ring is visible on the page it is drawn on`, () => {
      expect(contrast(c.focusRing, c.ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.focusRing, c.groundRaised)).toBeGreaterThanOrEqual(3);
    });
  }

  it('separators are honestly labelled as decoration', () => {
    // If either of these ever clears 3.0 someone has quietly promoted a separator into a
    // state-bearing mark without saying so, and `strokeSignal` has lost its job.
    for (const theme of THEMES) {
      const c = color[theme];
      expect(contrast(c.strokeHairline, c.ground)).toBeLessThan(3);
      expect(contrast(c.strokeEmphasis, c.ground)).toBeLessThan(3);
    }
  });
});

describe('amber in light mode', () => {
  /**
   * The split exists because #F0A93B on #F5F0E8 is 1.77:1 — amber holds as a fill in
   * light and fails as a mark. Checking the *reason* as well as the fact means the two
   * cannot be quietly collapsed once somebody forgets why they differ.
   */
  it('keeps a separate mark colour, and proves it is needed', () => {
    expect(color.light.workingMark).not.toBe(color.light.workingFill);
    expect(contrast(color.light.workingFill, color.light.ground)).toBeLessThan(3);
    expect(contrast(color.light.workingMark, color.light.ground)).toBeGreaterThanOrEqual(3);
  });

  it('needs no such split in dark, and says so', () => {
    expect(color.dark.workingMark).toBe(color.dark.workingFill);
  });
});

describe("Watching Mode's dim is a palette, not an opacity", () => {
  const well = color.dark.groundWell;

  it('every dimmed role still clears 4.5 on the well', () => {
    for (const role of ['dimInk', 'dimInkSecondary', 'dimWorking'] as const) {
      expect(contrast(color.dark[role], well), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has no dim for the two roles that cannot survive one', () => {
    // At 75% the tertiary ink is 3.34 and trouble is 3.75, and 80% does not rescue
    // either. They hold at full strength or they are not on that screen.
    expect(color.dark).not.toHaveProperty('dimTertiary');
    expect(color.dark).not.toHaveProperty('dimTrouble');
  });
});
