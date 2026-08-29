import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { episodeCode, episodeHeading, episodeName } from '@reviewies/core/ui/episode';

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
