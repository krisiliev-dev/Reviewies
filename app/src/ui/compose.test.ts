import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COMPOSE, COMPOSE_OPEN, SETTINGS_OPEN } from '@reviewies/core/ui/compose';
import { RATING_OPEN, ratingAction, ratingLabel } from '@reviewies/core/ui/rating';

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

  it('reveals a settings panel too, on both platforms and by the same rule', () => {
    /*
     * §6.129 wrote "composing is revealed, not resident" and nothing applied it for four
     * sprints. §6.134 found the second screen it describes: the calendar is called
     * *Upcoming* and opened on "Tell me about" — three options with a sub-line each, a
     * delivery block and up to four conditional notes, 470 points of a 900-point screen,
     * above the thing you came for. On both platforms, identically, which is what made it
     * a decision rather than drift.
     *
     * The collapsed state is a `Row` that *states the current choice*, not a bare control:
     * most of what the open panel told you, in one line. That is the clause below —
     * a screen that hid the panel behind a button saying nothing would satisfy a check
     * that only looked for the reveal.
     */
    expect(SETTINGS_OPEN).toBe(false);
    for (const [name, file] of [
      ['web', 'app/src/screens/Calendar.tsx'],
      ['phone', 'mobile/app/calendar.tsx'],
    ] as const) {
      const source = withoutProse(read(file));
      expect(source, `${name} does not seed the panel from the rule`)
        .toMatch(/useState\(SETTINGS_OPEN\)/);
      expect(source, `${name} has no collapsed state`).toMatch(/\{!tuning \? \(/);
      // The row says what the setting is, rather than only that there is one.
      expect(source, `${name}'s collapsed row does not name the current choice`)
        .toMatch(/meta=\{NOTIFY_OPTIONS\.find\(\(o\) => o\.key === preference\)\?\.label\}/);
      /*
       * The word beside the thing that closes it. §6.182: `COPY.controls.done` appears as
       * both `label=` and inside `name=`, so replacing the Done handler with a no-op left
       * the panel open for ever with this clause green — a message promising a state
       * transition and a body checking that a copy key is spelled.
       */
      expect(source, `${name} cannot be closed again`).toMatch(
        /COPY\.controls\.done[\s\S]{0,300}setTuning\(false\)|setTuning\(false\)[\s\S]{0,300}COPY\.controls\.done/,
      );
    }
  });

  it('does not mark a chosen option a third way', () => {
    /*
     * `CHOSEN` is a rule and a step in the ink — two channels, and the constant exists so
     * selection is spelled once. `Choice`'s `rows` density drew an amber ✓ at the far end
     * of the row as well, `aria-hidden` and decorative, on both platforms: the same state
     * announced at both ends of a 390pt row, seven hundred points apart in the photograph.
     *
     * A signal at one density and not the other is the drift this component was built to
     * end — §6.95's own finding was that "the density chips and the calendar's options
     * ended up disagreeing", and the tick was the last way they still did.
     */
    for (const [name, file] of [
      ['web', 'app/src/ui/Choice.tsx'],
      ['phone', 'mobile/src/ui/Choice.tsx'],
    ] as const) {
      expect(withoutProse(read(file)), `${name}'s Choice still draws a tick`).not.toContain('✓');
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

  it('reveals a rating on a list row too, by the same rule and the same default', () => {
    /*
     * §6.129 wrote the rule and `compose.ts`'s own header says why it exists: "so the third
     * and fourth screens do not each decide it again". It had been applied to the comments
     * composer (§6.129) and the calendar's notification panel (§6.134), and to nothing else
     * in four sprints.
     *
     * The title page is the case it was written for, and the numbers there are worse than
     * either. `StarRating` is 240 points wide — ten targets at WCAG 2.5.8's 24 — and its
     * own doc says "its callers give it a line of its own rather than putting it beside
     * something". One of its two call sites honoured that and one put it beside *React* and
     * *Talk* in a row about 350 wide, once per **watched** episode: §6.141's first foot shot
     * of `15-title` is sixty empty star outlines down one screen.
     */
    expect(RATING_OPEN, 'a row opens on the five stars').toBe(false);
    expect(RATING_OPEN, 'the two reveals disagree about their default').toBe(COMPOSE_OPEN);

    /*
     * A rating you have shows the number; a rating you have not shows the offer. One
     * control either way, which is why the contract is a function rather than two
     * constants — the two states differ in what they say, not in what they do.
     */
    expect(ratingLabel(undefined)).toBe('Rate');
    expect(ratingLabel(3.5)).toBe('3.5');
    expect(ratingAction(undefined)).toBe('Rate');
    expect(ratingAction(4), 'a rating already given still says Rate').not.toBe('Rate');

    for (const path of ['app/src/screens/TitleDetail.tsx', 'mobile/app/title/[id].tsx']) {
      const source = read(path);
      expect(source, `${path} seeds its reveal from a literal`).toContain('useState(RATING_OPEN)');
      expect(source, `${path} spells the offer's words by hand`).toContain('ratingLabel(');
      /*
       * And the five are still behind it. A screen that revealed the offer and left the
       * stars resident would pass every clause above.
       */
      expect(source, `${path} leaves the stars resident`).toMatch(
        /ratingOpen[\s\S]{0,200}<StarRating/,
      );
    }
  });
});
