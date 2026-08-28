import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { POSTER_PLATE, POSTER_SIZE } from '@reviewies/core/ui/poster';
import { ROW } from '@reviewies/core/ui/row';
import { radius, ratio, space } from '@reviewies/core/tokens';

/**
 * `Poster`, and the token that had no consumers.
 *
 * The component existed on both platforms and decided nothing — every call site passed its
 * own width and height. The two platforms agreed on the numbers, which is why nothing had
 * complained, and both were wrong in the same place: **the row poster was 44 x 64, and 2:3
 * of 44 is 66.**
 *
 * `ratio.poster` has said 2/3 since the token file was written and nothing had ever read it.
 * `ROW.minHeight.listing` is 66 — somebody wrote the row's height from the ratio and the
 * poster's by eye, two lines apart — so every listing row in the app has carried a two-point
 * strip of dead ground under its artwork, on six screens, for the life of the build.
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

describe('a poster', () => {
  it('is 2:3 at both sizes, because the ratio is computed rather than typed', () => {
    for (const size of ['row', 'detail'] as const) {
      const { width, height } = POSTER_SIZE[size];
      expect(width / height, `${size} is not 2:3`).toBeCloseTo(ratio.poster, 3);
    }
    // The two numbers, named, so the fix is visible rather than merely asserted.
    expect(POSTER_SIZE.row).toEqual({ width: 44, height: 66 });
    expect(POSTER_SIZE.detail).toEqual({ width: 96, height: 144 });

    /*
     * And the row it sits in agrees with it. This is the whole finding: the row's own height
     * was already the 2:3 of the poster's width, and the poster was two points shorter.
     */
    expect(ROW.minHeight.listing, 'the row and its poster disagree about 2:3 again')
      .toBe(POSTER_SIZE.row.height);

    // The source, not just the values: a literal that happens to equal a derivation is a
    // literal, and it stops equalling it the day somebody moves the width.
    const source = read('core/src/ui/poster.ts');
    expect(source).toContain('Math.round(WIDTH.row / ratio.poster)');
    expect(source).toContain('Math.round(WIDTH.detail / ratio.poster)');
  });

  it('is the only thing on either platform that sizes artwork', () => {
    /*
     * Seven web sites wrote `h-16 w-11` and one wrote `h-36 w-24`; six phone sites passed
     * `ROW.lead` and one passed `96 / 144`. A call site that hands the component a box is
     * the ninth answer to a question the table answers.
     */
    const offenders: string[] = [];
    let seen = 0;
    for (const file of [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (file.endsWith('ui/Poster.tsx')) continue;
      for (const m of read(file).matchAll(/<Poster\b[\s\S]*?\/>/g)) {
        seen++;
        if (/\b(width|height)=/.test(m[0])) offenders.push(`${file}: sizes its own poster`);
        if (/className="[^"]*\b[hw]-/.test(m[0])) offenders.push(`${file}: boxes its own poster`);
      }
    }
    expect(seen, 'no poster was scanned, so this proved nothing').toBeGreaterThan(10);
    expect(offenders).toEqual([]);

    // `ROW.lead` was the poster's box living in the row's table. It is gone, not unused.
    expect(Object.keys(ROW), 'the row is sizing posters again').not.toContain('lead');
  });

  it('is a plate with a band along its foot, in units that exist', () => {
    /*
     * The band is the direction's — a 4pt strip in the ground at the bottom edge, which is
     * what makes a poster read as mounted rather than floating.
     *
     * The obvious spelling on the web was `border-b-s4`, and it generates **nothing**: the
     * space scale goes into Tailwind's `--spacing` namespace and border widths come from
     * `--border-width-*`, which holds strokes only. The band would simply not have appeared,
     * in silence. §6.85's trap — a class with no rule behind it looks exactly like a class.
     */
    expect(POSTER_PLATE.radius).toBe(radius.plate);
    expect(Object.values(space), 'the band is off the space scale').toContain(POSTER_PLATE.band);

    const css = read('app/src/tokens.generated.css');
    expect(css, 'a border-width for the band appeared; re-check the utility')
      .not.toContain(`--border-width-s${POSTER_PLATE.band}`);
    /*
     * Code, not prose. The component's own comment names `border-b-s4` while explaining why
     * it is not used, so the clause read its own explanation as the violation — which is the
     * needle-in-a-comment problem `clauses.test.ts` has caught three sprints running, this
     * time caught by the clause itself before it was committed.
     */
    const web = read('app/src/ui/Poster.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(web, 'the band went back to a utility that does not exist')
      .not.toMatch(/border-b-s\d/);
    expect(web).toContain('borderBottomWidth: POSTER_PLATE.band');
    const phone = read('mobile/src/ui/Poster.tsx');
    expect(phone).toContain('borderBottomWidth: POSTER_PLATE.band');
  });

  it('says the title when there is no artwork, in the face that fits it', () => {
    /*
     * A missing poster is normal — imported history is full of titles that never matched a
     * provider. §6.113: at `s12` in Archivo the plate broke inside the word, and there is no
     * step below 12 to retreat to, so it is the condensed face.
     */
    const phoneFallback = /\n {2}fallbackText: \{([^{}]*)\},/.exec(read('mobile/src/ui/Poster.tsx'))?.[1] ?? '';
    expect(phoneFallback, 'no fallback style to read').toBeTruthy();
    expect(phoneFallback).toContain('type.family.title.name');
    const webFallback = /className=\{`\$\{box\} ([^`]*)`\}/.exec(read('app/src/ui/Poster.tsx'))?.[1] ?? '';
    expect(webFallback, 'no fallback class to read').toBeTruthy();
    expect(webFallback).toContain('font-title');
    // And it is decoration, not content: the row beside it already says the name.
    expect(read('app/src/ui/Poster.tsx')).toContain('aria-hidden="true"');
  });
});
