import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The palette, checked rather than asserted in a comment.
 *
 * Two things had gone unverified. The phone's theme.ts says it is "carried over from
 * the web app so the two do not drift apart", and six of its seven colours had drifted
 * anyway. And nothing had ever measured the contrast of the muted grey that carries
 * most of the secondary text in both apps — every episode subtitle, every remaining
 * count, every footnote — against the surfaces it sits on.
 *
 * Prose does not fail. This does.
 */
const ROOT = resolve(__dirname, '../../..');

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

/** The web's palette, read out of the `@theme` block Tailwind compiles from. */
function webPalette(): Record<string, string> {
  const css = readFileSync(resolve(ROOT, 'app/src/index.css'), 'utf8');
  const out: Record<string, string> = {};
  for (const [, name, hex] of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
    out[name.replace('-', '')] = hex.toLowerCase();
  }
  return out;
}

/** The phone's, read out of the object literal rather than imported: this package
 *  cannot resolve react-native, and the point is the text on disk either way. */
function phonePalette(): Record<string, string> {
  const source = readFileSync(resolve(ROOT, 'mobile/src/ui/theme.ts'), 'utf8');
  const body = source.slice(source.indexOf('export const theme = {'));
  const out: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(/(\w+):\s*'(#[0-9a-f]{6})'/gi)) {
    out[name.toLowerCase()] = hex.toLowerCase();
  }
  return out;
}

describe('the palette', () => {
  it('is the same on both platforms', () => {
    const web = webPalette();
    const phone = phonePalette();

    // Non-vacuous: a parser that found nothing would otherwise pass this happily.
    expect(Object.keys(web).sort()).toEqual([
      'accent',
      'edge',
      'ink',
      'muted',
      'surface',
      'surface2',
      'text',
    ]);
    expect(phone).toEqual(web);
  });

  it('clears WCAG AA for every text colour on every surface it sits on', () => {
    const palette = webPalette();
    const failures: string[] = [];

    for (const fg of ['text', 'muted', 'accent']) {
      for (const bg of ['ink', 'surface', 'surface2']) {
        const ratio = contrast(palette[fg], palette[bg]);
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
