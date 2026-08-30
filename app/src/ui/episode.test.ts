import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { episodeCode, episodeHeading, episodeName, episodeWhen } from '@reviewies/core/ui/episode';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';

/**
 * `S1E8 · Episode 8` — the number twice, on six screens.
 *
 * TMDB's name for an episode nobody has named is `Episode {n}`, so every row that printed
 * a code and then a name said the number twice for most anime, every unaired episode, and
 * every show whose contributors have not got to it — and the calendar is made *entirely*
 * of unaired episodes. The title page's spoken name said it three times: "season 1 episode
 * 8, Episode 8".
 *
 * It took a fixture that could produce a real calendar to see it (§6.146), which is why
 * this file exists: a photograph found it once, and only a sweep finds the next site.
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

describe('an episode with no name', () => {
  it('is not given its own number as one', () => {
    expect(episodeName('Episode 8', 8)).toBeUndefined();
    expect(episodeName('episode 8', 8)).toBeUndefined();
    expect(episodeName('Episode8', 8)).toBeUndefined();
    expect(episodeName('  8 ', 8)).toBeUndefined();
    expect(episodeName('08', 8)).toBeUndefined();
    expect(episodeName('', 8)).toBeUndefined();
    expect(episodeName(undefined, 8)).toBeUndefined();
  });

  it('keeps a name that is somebody\'s actual title', () => {
    // Including one that is a number, or contains the episode's own. The rule is "the name
    // is only the number", not "the name mentions a number" — `9` is the title of a film,
    // and *Episode 8 of a Bad Year* is a title somebody could write.
    expect(episodeName('The Ice Storm', 8)).toBe('The Ice Storm');
    expect(episodeName('Episode 8 of a Bad Year', 8)).toBe('Episode 8 of a Bad Year');
    expect(episodeName('Episode 9', 8)).toBe('Episode 9');
    expect(episodeName('  The Ice Storm  ', 8)).toBe('The Ice Storm');
  });

  it('still has a heading on the title page', () => {
    // `8.` on its own is a row that lost its noun, so the fallback is the words rather
    // than the bare number.
    expect(episodeHeading(8, undefined)).toBe('Episode 8');
    expect(episodeHeading(8, 'Episode 8')).toBe('Episode 8');
    expect(episodeHeading(8, 'The Ice Storm')).toBe('8. The Ice Storm');
  });

  it('is spelled the same way wherever a code appears', () => {
    expect(episodeCode(1, 8)).toBe('S1E8');
  });

  it('is decided in the core, not at each screen', () => {
    /*
     * Two sweeps, because the two halves fail differently.
     *
     * A screen that reads `episode.name` straight has skipped the rule; a screen that
     * builds `S${season}E${number}` itself has re-spelled the code, which is how the
     * comments screen's header and its body came to disagree about whether the code has
     * a separator in it.
     */
    for (const file of SCREENS) {
      // The rule's own calls are the point, so they are removed before looking.
      const source = withoutProse(read(file))
        .replaceAll(/episodeName\([^)]*\)/g, '')
        .replaceAll(/episodeHeading\([^)]*\)/g, '');
      expect(source, `${file} reads an episode's name without the rule`).not.toMatch(
        /\bepisode\??\.name\b/,
      );
      expect(source, `${file} spells the episode code itself`).not.toMatch(
        /S\$\{[^}]*season[^}]*\}E\$\{/,
      );
      expect(source, `${file} spells the episode code itself`).not.toMatch(
        /S\{[^}]*\.season\}E\{/,
      );
    }
  });
});

describe('when an episode happened', () => {
  it('is a sentence, not a field', () => {
    // Aired: the day, named. Unaired: the day, named, with the verb in front of it.
    const now = Date.parse('2026-08-26T15:00:00');
    expect(episodeWhen('2026-08-26', now)).toBe(COPY.calendar.today);
    expect(episodeWhen('2026-09-06', now)).toBe(COPY.title.airs(formatDay('2026-09-06', now)));
    // An episode the provider has not dated at all still has a row to fill.
    expect(episodeWhen(undefined, now)).toBe(COPY.title.airs(COPY.title.tba));
  });

  it('never hands a screen an ISO date', () => {
    /*
     * The defect stated as its own clause, because it is the one a reader sees.
     *
     * Today's episode, next week's, a premiere from 2005 and one with no date — none of
     * them may come back looking like the database field they came out of.
     */
    const now = Date.parse('2026-08-26T15:00:00');
    for (const day of ['2026-08-26', '2026-08-25', '2026-09-06', '2005-08-04', undefined]) {
      expect(episodeWhen(day, now), `${day} came back as a field`).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it('is decided in the core, like the name and the code above it', () => {
    /*
     * `episodeName` got this sweep because a screen that reads the field straight has
     * skipped the rule. The air date is the same shape and had no sweep at all: both
     * title screens printed `episode.airDate` into a row, identically, so a reader saw
     * `2026-09-06` on the title page and `Sun, Sep 6` on the calendar for one episode.
     *
     * Written against the *field* rather than against the two files, because the fix that
     * matters is that the next screen to list episodes cannot make this choice again —
     * and there are three trees where it could.
     */
    for (const file of SCREENS) {
      // The rule's own call is the point, so it is removed before looking.
      const source = withoutProse(read(file)).replaceAll(/episodeWhen\([^)]*\)/g, '');
      expect(source, `${file} prints an episode's air date itself`).not.toMatch(/\bairDate\b/);
    }
  });
});
