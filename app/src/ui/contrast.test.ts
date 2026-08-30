import { describe, expect, it } from 'vitest';
import { color, label } from '@reviewies/core/tokens';
import { contrast } from '@reviewies/core/ui/contrast';

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

/*
 * The arithmetic moved to `core/src/ui/contrast.ts` in §6.185, and this file kept the
 * published-value check below rather than sending it along with it.
 *
 * The reason is the reason it was written: `design/capture.mjs` needed the same formula to
 * measure a *pressed* control's label against the ground the press paints, and a second
 * copy of a contrast calculation is a pair of numbers that agree until they do not. The
 * core module is now the one owner, and the published-value check below stayed here rather
 * than travelling with it — every consumer's proof that the formula is right is one import
 * away, in the file that has always run it.
 */

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

/*
 * A describe block called "Watching Mode's dim is a palette, not an opacity" was here, and
 * the palette it measured is gone — `core/src/tokens.ts` has the reasoning. Two things it
 * did are worth keeping on the record, because both are shapes this file exists to refuse.
 *
 * It measured against `color.dark.groundWell`, on the spec's line that "Late Edition's
 * Watching Mode ground is `ground.well`". Both Watching Modes paint `ground`. So the one
 * guard in this file that named a screen was measuring the flattering ground of a screen
 * that does not exist — the exact mistake the header above says this file was written to
 * stop. It passed either way (9.31 / 4.96 / 5.59 on `ground`), which is why nothing caught
 * it.
 *
 * And it read `color.dark` only, in a file whose every other clause loops `THEMES`. The
 * light table carried the dark table's three hexes verbatim, so `dimInk` was **1.78:1** on
 * the light ground and no clause anywhere looked at it. A one-theme guard on a two-theme
 * table is a guard that has agreed to be right half the time.
 */
