import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COMPOSE, COMPOSE_OPEN } from '@reviewies/core/ui/compose';

/**
 * Composing is revealed, not resident — the rule `core/src/ui/compose.ts` states, held on
 * the source side.
 *
 * The design harness holds the other side, and holds the stronger half: `20-comments-in`
 * fails if the screen a person arrives at has a text box on it. This file exists for what
 * a photograph cannot see — the *next* screen to grow a composer, which no shot will cover
 * until somebody remembers to add one.
 *
 * What the photograph found, for the record: an effort filter, a 350-point empty box,
 * "Attach a screenshot", "Post", and only then, 880 points down an 844-point viewport, the
 * first word anybody wrote. Both platforms, in the same order, because they were ported
 * from one another and neither ever asked what the screen is for. §6.129.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const SCREENS = [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')];

/** The two screens whose whole purpose is reading what other people wrote. */
const COMPOSERS = ['app/src/screens/EpisodeComments.tsx', 'mobile/app/comments/[targetId].tsx'];

describe('a composer on a reading screen', () => {
  it('is the stated default, and false', () => {
    // Stated rather than asserted twice: a screen that should open composed has to say so
    // against this, not quietly pass `true` where nobody compares it to anything.
    expect(COMPOSE_OPEN).toBe(false);
  });

  it('seeds its open state from the rule rather than from a literal', () => {
    for (const file of COMPOSERS) {
      const source = withoutProse(read(file));
      expect(source, `${file} does not import the rule`).toContain('COMPOSE_OPEN');
      expect(source, `${file} seeds the composer from a literal`).toMatch(
        /useState\(COMPOSE_OPEN\)/,
      );
      expect(source, `${file} seeds a "writing" state from a literal`).not.toMatch(
        /const \[writing[^\]]*\] = useState\((?:true|false)\)/,
      );
    }
  });

  it('is the only kind of screen with a multiline field, and reveals it', () => {
    /*
     * A `multiline` field is the shape of a composer: it is a box you write paragraphs in,
     * and it is the thing that takes 350 points of a screen whether or not anybody wanted
     * to write. Every one of them in the product has to be behind a reveal.
     *
     * This clause found the fourth. `mobile/app/(tabs)/watchlist.tsx` had a `multiline`
     * note field where the web's watchlist and both search screens are single-line — and
     * the `onSubmitEditing={save}` beside it could not fire, because React Native gives a
     * multiline input the Return key for a newline. The outlier was the one carrying a
     * dead prop.
     */
    const withMultiline = SCREENS.filter(
      (f) => /<Field\b[^>]*\bmultiline\b/s.test(withoutProse(read(f))) && !f.endsWith('Field.tsx'),
    );
    expect(withMultiline.sort()).toEqual(COMPOSERS.slice().sort());

    for (const file of withMultiline) {
      const source = withoutProse(read(file));
      const reveal = source.indexOf('writing ?');
      const field = source.search(/<Field\b[^>]*\bmultiline\b/s);
      expect(reveal, `${file} renders a multiline field with no reveal`).toBeGreaterThan(-1);
      expect(field, `${file} renders its composer before the reveal that guards it`)
        .toBeGreaterThan(reveal);
    }
  });

  it('says the two words the rule owns, and nowhere else says them', () => {
    // Same reason `COPY` exists: two screens writing "Say something" separately is how the
    // fourth one ends up writing "Add a comment".
    for (const file of SCREENS) {
      const source = withoutProse(read(file));
      for (const word of [COMPOSE.open, COMPOSE.cancel]) {
        expect(source, `${file} hand-writes "${word}"`).not.toContain(`"${word}"`);
        expect(source, `${file} hand-writes '${word}'`).not.toContain(`'${word}'`);
      }
    }
  });
});
