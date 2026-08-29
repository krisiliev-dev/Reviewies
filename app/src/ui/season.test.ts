import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bySeason, SPECIALS, seasonLabel } from '@reviewies/core/ui/season';
import { COPY } from '@reviewies/core/copy';
import { mergeSuggestions } from '@reviewies/core/discover/recommend';

/**
 * The two things a real show put on screen that no fixture could.
 *
 * §6.151's snapshot pass ran once and both were in its first five screenshots: a title page
 * opening on `SEASON 0`, and every Discover row reading *"Because you watched Trending
 * now"*. Neither is reachable from the fixture — no fixture has a season 0, and the
 * trending fallback needs a library with nothing **watched** in it. §6.152.
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
const TITLES = ['app/src/screens/TitleDetail.tsx', 'mobile/app/title/[id].tsx'];

describe('specials', () => {
  it('come last, not first', () => {
    /*
     * `repo.ts` says it three times — Up Next, the catch-up sheet and `airedSeasonSizes`
     * all exclude season 0 — and one of those comments names the case: "including them
     * would make Up Next for One Piece a recap special rather than episode 1". A list that
     * *opens* on them contradicts all three.
     */
    expect(SPECIALS).toBe(0);
    expect([3, 0, 1, 2].sort(bySeason)).toEqual([1, 2, 3, 0]);
    // And nothing else moves: a show with no specials sorts exactly as it did.
    expect([3, 1, 2].sort(bySeason)).toEqual([1, 2, 3]);
    expect(bySeason(0, 0)).toBe(0);
  });

  it('are called something a person says out loud', () => {
    expect(seasonLabel(SPECIALS)).toBe('Specials');
    expect(seasonLabel(3)).toBe('Season 3');
  });

  it('are ordered and named by the rule on both title pages', () => {
    for (const file of TITLES) {
      const source = withoutProse(read(file));
      expect(source, `${file} sorts seasons by number`).not.toMatch(/a\.season - b\.season/);
      expect(source, `${file} orders seasons itself`).toContain('seasonOrder(');
      expect(source, `${file} writes the heading itself`).toContain('seasonLabel(');
    }
  });

  it('are not headed by a number anywhere', () => {
    // `Season {n}` interpolated at a call site is the shape both pages had, and the shape
    // that has no answer for zero.
    for (const file of SCREENS) {
      expect(withoutProse(read(file)), `${file} writes a season heading by hand`).not.toMatch(
        /Season \{[a-z]/i,
      );
    }
  });
});

describe('a suggestion nothing in your library led to', () => {
  it('does not claim you watched it', () => {
    /*
     * The fallback passed the literal `'Trending now'` as a seed name, so it arrived in
     * `because` and both screens rendered "Because you watched Trending now" — on the one
     * line of the card whose whole job is separating a recommendation from an advert.
     */
    const [row] = mergeSuggestions(
      [
        {
          seedName: '',
          trending: true,
          results: [{ id: 'tmdb:tv:1', kind: 'show', name: 'Silo', year: 2023 }],
        },
      ],
      new Set(),
    );
    expect(row.trending).toBe(true);
    expect(row.because).toEqual([]);
    expect(COPY.discover.because(row.because)).not.toBe(COPY.discover.trending);
    expect(COPY.discover.trending).not.toMatch(/because you watched/i);
  });

  it('still says why when there is a why', () => {
    // Non-vacuity: a change that made everything trending would satisfy the clause above.
    const [row] = mergeSuggestions(
      [
        {
          seedName: 'Severance',
          results: [{ id: 'tmdb:tv:1', kind: 'show', name: 'Silo', year: 2023 }],
        },
      ],
      new Set(),
    );
    expect(row.trending).toBeUndefined();
    expect(row.because).toEqual(['Severance']);
  });

  it('is asked which sentence it wants, on both platforms', () => {
    for (const file of ['app/src/screens/Discover.tsx', 'mobile/app/(tabs)/discover.tsx']) {
      expect(withoutProse(read(file)), `${file} says "because" whatever the row is`).toContain(
        'COPY.discover.trending',
      );
    }
  });

  it('never passes a label where a title belongs', () => {
    // The literal that caused it. A seed name is a title or it is nothing.
    expect(withoutProse(read('core/src/discover/recommend.ts'))).not.toContain("'Trending now'");
  });
});
