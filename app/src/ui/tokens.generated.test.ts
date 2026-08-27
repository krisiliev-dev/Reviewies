import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { css } from '../../../scripts/tokens-to-css.mjs';

/**
 * The web's stylesheet is generated, not maintained.
 *
 * `palette.test.ts` used to compare the web's copy of the palette against the phone's,
 * and it found six of seven colours already drifted. That check was worth having and it
 * was the wrong shape: it noticed disagreement between two files that both had to be
 * edited by hand, so the best it could ever do was report the mistake after somebody
 * made it.
 *
 * This regenerates the file in memory from `core/src/tokens.ts` and byte-compares. The
 * failure it remembers is somebody opening the stylesheet and correcting a hex — a
 * reasonable thing to do, invisible in review, and the beginning of a second palette.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = resolve(ROOT, 'app/src/tokens.generated.css');

describe('the generated stylesheet', () => {
  const onDisk = readFileSync(OUT, 'utf8');

  it('generated something rather than nothing', () => {
    // A generator that emitted an empty string would otherwise make the compare below
    // pass against an empty file.
    expect(css.length).toBeGreaterThan(2000);
    expect(css).toContain('--ground:');
    expect(css).toContain('@theme');
  });

  it('matches the file on disk, byte for byte', () => {
    // Not a parse-and-compare: whitespace and comment drift is drift too, and the file
    // says "do not edit" at the top.
    expect(onDisk).toBe(css);
  });

  it('carries both themes, because the theme block cannot', () => {
    // Tailwind v4's `@theme` is a single set. The values live in plain custom properties
    // so a light override is possible at all, and `@theme` points at them — checking
    // that here stops somebody "simplifying" the indirection away and taking light
    // mode with it.
    expect(css).toContain(":root[data-theme='light']");
    expect(css).toContain('prefers-color-scheme: light');
    expect(css).toMatch(/--color-ground:\s*var\(--ground\)/);
  });

  it('answers Reduce Motion with a parallel set, not a call-site query', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
    for (const name of ['drawer', 'cross-off', 'rule']) {
      expect(css, `--duration-${name}`).toContain(`--duration-${name}:`);
    }
  });

  it('leaves no palette behind in the stylesheet it replaced', () => {
    // index.css held seven colours of its own. If a hex reappears there, the web has
    // quietly grown a second source again and this whole sprint has been undone.
    //
    // Comments stripped first. The focus-ring note in that file quotes the old
    // background — "about 1.03 against the #0b0b0f background" — and reading that as a
    // declaration is §6.72's mistake with the sign flipped: a guard treating prose as
    // code, catching something that was never there.
    const index = readFileSync(resolve(ROOT, 'app/src/index.css'), 'utf8');
    const declarations = index.replace(/\/\*[\s\S]*?\*\//g, '');
    const hexes = [...declarations.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
    expect(hexes, 'colour belongs in core/src/tokens.ts').toEqual([]);
  });
});
