import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOTE, NOTE_INK } from '@reviewies/core/ui/note';
import { color, leading, text } from '@reviewies/core/tokens';

/**
 * `Note`, and the fifth fact nothing owned.
 *
 * Twenty-eight styles on the phone and about seventy class strings on the web were the same
 * role under eight names — `blurb`, `muted`, `note`, `hint`, `footnote`, `toggleHint`,
 * `deliveryNote`, `startBlurb`. What the census found is what a role with no owner looks
 * like: **six line-heights on the phone** (15, 16, 17, 19, 20, 22 and absent) against **none
 * at all on the web**, and **eleven web sites with no size either**, inheriting 16 where the
 * phone drew 14.
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

describe('the note', () => {
  it('is two levels apart in size and nothing else', () => {
    /*
     * Unlike `Section`, one channel — and that is the decision, not an oversight. These two
     * are the same voice at two volumes rather than container and contents, and a footnote
     * that also stepped down in ink would be a third step in a palette whose tertiary is
     * already at the system's 4.51 floor. `docs/design/tokens.md` §3 has the number.
     */
    expect(NOTE.note.size).toBe(text.s14);
    expect(NOTE.footnote.size).toBe(text.s12);
    expect(NOTE.note.leading).toBe(NOTE.footnote.leading);
    expect(NOTE_INK).toBe('inkSecondary');
    // Named, so a future step down cannot be made without reading this.
    expect(color.dark.inkTertiary, 'the floor moved; re-derive before using it for prose')
      .toBe('#8A8079');
  });

  it('takes its line height from the token, as a ratio', () => {
    /*
     * `l143` is extracted rather than invented: 1.43 is the mode, fifteen sites at `s14`
     * writing `lineHeight: 20`. It reproduces 20 at 14 and 17 at 12 — the commonest value at
     * each size — so the layer arrives without moving anything that had been decided.
     *
     * A ratio, because a ratio is derivable: change `text.s14` and every line height that
     * reads it follows. This said "a stored 20 stays 20 while the glyphs double at 200%
     * Dynamic Type and the lines collide", which §6.183 refuted (both arguments are
     * constants, so the derived value *is* the stored one) and this sprint refuted again in the
     * other direction — React Native scales the stored line height on both shipping
     * platforms, so there is nothing here for a ratio to rescue. `core/src/tokens.ts` under
     * `leading` has the citations, and `phoneTextScaling.test.ts` holds the consequence:
     * multiplying one of these by `fontScale` scales it twice.
     */
    expect(NOTE.note.leading).toBe(leading.l143);
    expect(Math.round(text.s14 * leading.l143)).toBe(20);
    expect(Math.round(text.s12 * leading.l143)).toBe(17);
    expect(read('mobile/src/ui/theme.ts')).toContain('Math.round(size * ratio)');
    // And the web gets the same ratio as a utility rather than a second number.
    const css = read('app/src/tokens.generated.css');
    for (const [name, ratio] of Object.entries(leading)) {
      expect(css, `--leading-${name} is missing`).toContain(`--leading-${name}: ${ratio};`);
    }
  });

  it('leaves no line height on either platform written by hand', () => {
    /*
     * The phone had nineteen; the web had four of Tailwind's own — `leading-none`,
     * `leading-tight`, `leading-snug`, `leading-relaxed` — none from the table, and two of
     * them ended up *on a `Note`*, which is two answers to one question.
     *
     * `l100` exists because of five of those: a tick, a play mark, a chevron. A single glyph
     * has no line box worth the name and giving it one pushes it off centre. It is a token
     * so the next one cannot be `leading-tight` instead, which is what three of the four
     * others were.
     */
    const phone: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of read(file).matchAll(/lineHeight: [^,}\n]+/g)) {
        /*
         * `leadingOf(...)` at the site, or a constant derived from it — the tab bar measures
         * its own height from the label's line box, so naming that once and using it twice
         * is better than the call written out in both places.
         */
        if (!/leadingOf\(|_LINE\b/.test(m[0])) phone.push(`${file}: ${m[0]}`);
      }
    }
    expect(phone).toEqual([]);

    const web: string[] = [];
    let scanned = 0;
    for (const file of filesUnder('app/src')) {
      scanned++;
      for (const m of read(file).matchAll(/\bleading-[a-z0-9]+/g)) {
        if (!Object.keys(leading).some((name) => m[0] === `leading-${name}`)) {
          web.push(`${file}: ${m[0]}`);
        }
      }
    }
    expect(scanned, 'no web files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(web).toEqual([]);
  });

  it('is what a note is drawn with, and a note never sets its own type', () => {
    /*
     * The component owns size, leading, ink and face; a call site owns margins and layout.
     * A `leading-*` or a `text-s*` on a `<Note>` is the call site answering a question the
     * table has already answered, which is how six line-heights happened in the first place.
     */
    const offenders: string[] = [];
    let notes = 0;
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Note.tsx')) continue;
      for (const m of read(file).matchAll(/<Note[^>]*className="([^"]*)"/g)) {
        notes++;
        for (const w of m[1].split(/\s+/)) {
          if (/^(leading-|text-s\d|text-ink-)/.test(w)) offenders.push(`${file}: ${w}`);
        }
      }
    }
    expect(notes, 'no Note carried a className, so this proved nothing').toBeGreaterThan(15);
    expect(offenders).toEqual([]);
  });

  it('is the only muted paragraph left on either platform', () => {
    /*
     * A `<p>` in secondary ink that is not a `Note` is the twenty-ninth copy. Links, inputs,
     * chips and status pills are excluded by *shape* rather than by name — each has a
     * decoration a paragraph does not: an underline, a placeholder, a border, a fill.
     */
    const DECORATED = /placeholder:|underline|\bitalic\b|\bfont-|rounded|\bborder|\bbg-|\btap\b/;
    const web: string[] = [];
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Note.tsx')) continue;
      for (const m of read(file).matchAll(/<p[^>]*className="([^"]*)"/g)) {
        if (!m[1].includes('text-ink-secondary') || DECORATED.test(m[1])) continue;
        web.push(`${file}: ${m[1]}`);
      }
    }
    expect(web).toEqual([]);

    /*
     * And on the phone, a style that is secondary ink at a note's size with a body face and
     * no box around it. `Row`'s meta and `Poster`'s fallback are the same ink and are not
     * notes — they are a row's second line and a plate's label, both inside something.
     */
    const phone: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (file.endsWith('ui/Note.tsx')) continue;
      for (const m of read(file).matchAll(/\n {2}(\w+): \{([^{}]*)\},/g)) {
        const body = m[2];
        if (!/theme\.inkSecondary/.test(body)) continue;
        if (!/lineHeight/.test(body)) continue;
        /*
         * The body face is what makes it a note. `title/[id].tsx`'s overview is secondary
         * ink with a reading measure and is *not* one — it is the synopsis, set in
         * Newsreader, which is the Letterboxd half of this product rather than an aside.
         */
        if (!/type\.family\.body\.name/.test(body)) continue;
        phone.push(`${file}: ${m[1]}`);
      }
    }
    // A note is the thing with a reading measure on it. Anything else in secondary ink is a
    // label or a row's second line, and neither of those sets a line height.
    expect(phone).toEqual([]);
  });
});
