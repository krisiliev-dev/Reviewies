import { describe, expect, it } from 'vitest';
import { legacy } from '@reviewies/core/tokens';

/**
 * The palette every screen is still drawn from, held to its measured ratios until it is
 * gone.
 *
 * This file used to do two jobs. It compared the web's copy of the palette against the
 * phone's — which found six of seven colours already drifted — and it measured the muted
 * grey against the surfaces it sits on, which nothing had ever done.
 *
 * **The comparison is deleted, and its deletion is the point.** There is one copy now:
 * `core/src/tokens.ts` owns these seven and `scripts/tokens-to-css.mjs` emits the web's
 * from them. A test that notices two files disagreeing is a weaker contract than not
 * having two files, and keeping it would have meant maintaining the very second copy it
 * was written to police. Its `name.replace('-', '')` trick — which turned
 * `--color-surface-2` into `surface2` and would have silently mangled `--color-ink-secondary`
 * into `inksecondary` — dies with it. `tokens.generated.test.ts` byte-compares instead.
 *
 * The measurement stays, because these colours are still on screen. This whole file goes
 * when the last of them does.
 */

/** WCAG 2.1 relative luminance. */
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

describe('the palette still on screen', () => {
  it('is the seven it has always been, and no more', () => {
    // Non-vacuous, and a fence: `legacy` shrinks as the migration lands and must never
    // grow. An eighth colour added here is somebody extending the thing being replaced.
    expect(Object.keys(legacy).sort()).toEqual([
      'accent',
      'edge',
      'ink',
      'muted',
      'surface',
      'surface2',
      'text',
    ]);
  });

  it('clears WCAG AA for every text colour on every surface it sits on', () => {
    const failures: string[] = [];

    for (const fg of ['text', 'muted', 'accent'] as const) {
      for (const bg of ['ink', 'surface', 'surface2'] as const) {
        const ratio = contrast(legacy[fg], legacy[bg]);
        // 4.5:1, the threshold for body text. Not 3:1 — almost none of this is large:
        // the muted grey is 9–12px in most of the places it appears.
        if (ratio < 4.5) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('measures contrast the way WCAG does', () => {
    // The check above is only worth having if this arithmetic is right, and the easy
    // way to write it wrong — sRGB values straight in, no linearisation — gives
    // noticeably different numbers.
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
