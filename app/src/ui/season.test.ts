import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  bySeason,
  SPECIALS,
  openSeason,
  seasonLabel,
  summariseSeasons,
} from '@reviewies/core/ui/season';
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
      /*
       * `seasonLabel` or the summary that calls it. §6.156 moved the heading into
       * `summariseSeasons`, which returns the label alongside the progress line, because a
       * collapsed row says both and a page assembling them from two places is a page that
       * can disagree with itself. The clause below is what keeps this from being a
       * loosening: interpolating `Season {n}` is still refused everywhere.
       */
      expect(source, `${file} writes the heading itself`).toMatch(
        /\b(seasonLabel|summariseSeasons)\(/,
      );
    }
  });

  it('open on the season you are in, and say so on every collapsed row', () => {
    /*
     * §6.156, #191. The page rendered every episode of every season at once: One Piece is
     * 1,220 rows and **170,844 points of scroll**, two hundred viewports, with no
     * pagination, no collapsing and no jump. The fixture's longest show is 1,443 points, so
     * nothing in thirty sprints of design review could have shown it.
     *
     * The rule is the interesting half. Opening on season 1 is right exactly once per show;
     * opening on the last puts somebody watching season 3 of five at the end of season 5.
     * The first season you have not finished is where Up Next's episode lives, reached from
     * the other direction.
     */
    const groups = (...sizes: Array<[number, number]>) =>
      sizes.map(
        ([season, n]) =>
          [season, Array.from({ length: n }, (_, i) => ({ id: `s${season}e${i + 1}` }))] as const,
      );

    const three = groups([1, 8], [2, 10], [3, 6]);
    const seen = new Set(['s1e1', 's1e2', 's1e3', 's1e4', 's1e5', 's1e6', 's1e7', 's1e8', 's2e1']);
    const summaries = summariseSeasons(three, seen);

    expect(summaries.map((s) => s.progress)).toEqual([
      'All 8 watched',
      '1 of 10 watched',
      '6 episodes',
    ]);
    expect(openSeason(summaries), 'opens on a season already finished').toBe(2);

    // Nothing watched: the first season, by the same rule and no special case.
    expect(openSeason(summariseSeasons(three, new Set()))).toBe(1);
    // Everything watched: the last, so a finished show does not open on its first season.
    const all = new Set(summaries.flatMap((s) => three[s.season === 0 ? 0 : s.season - 1][1].map((e) => e.id)));
    expect(openSeason(summariseSeasons(three, all))).toBe(3);
    // One season, always open — collapsing must cost nothing on a show that does not need it.
    expect(openSeason(summariseSeasons(groups([1, 6]), new Set()))).toBe(1);

    /*
     * And specials never take the opening slot from a run you are part-way through, which
     * `bySeason` decides and this is the first thing to depend on it.
     */
    const withSpecials = groups([1, 8], [2, 10], [0, 4]);
    expect(openSeason(summariseSeasons(withSpecials, seen))).toBe(2);

    for (const file of TITLES) {
      const source = withoutProse(read(file));
      expect(source, `${file} decides for itself which season opens`).toContain('openSeason(');
      /*
       * The episodes are **behind** the reveal, not merely below a control that toggles —
       * positions, the way `compose.test.ts` holds the composer.
       *
       * This was `toMatch(/expanded &&|expanded \? /)` and the plant walked straight
       * through it: both pages also write `expanded ? 'showing' : 'hidden'` in the row's
       * announced name, so the alternation matched the *label* while the episode list
       * rendered unconditionally. §6.153's shape again — a needle that can match something
       * other than what it claims — and the only reason it was caught is that every guard
       * here is planted against.
       */
      const reveal = source.indexOf('expanded &&');
      const rendered = source.search(/<EpisodeRow/);
      expect(reveal, `${file} has no reveal guarding its episodes`).toBeGreaterThan(-1);
      expect(rendered, `${file} renders every season's episodes regardless`).toBeGreaterThan(
        reveal,
      );
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
    // Both verbs, because §6.170 made the sentence turn on which kind of seed it came from.
    expect(COPY.discover.because(row.because, true)).not.toBe(COPY.discover.trending);
    expect(COPY.discover.because(row.because, false)).not.toBe(COPY.discover.trending);
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

  it('draws the synopsis whole on both platforms, or clamps it on neither', () => {
    /*
     * §6.174. One field, two renderers, different halves — §6.170's shape.
     *
     * `TitleDetail.tsx` carried `line-clamp-3` with no comment and no entry behind it, and
     * it was not the narrow-window rule it looks like: measured against the real-TMDB
     * build, It's Always Sunny truncated mid-word at **both** photographed widths — the
     * 1280 shot ends *"creating a myria…"*. Severance fits at 1280 and not at 420, which
     * is what made the divergence look like a responsive decision instead of a cap.
     *
     * Nothing on either platform offers to expand it, so on the web the rest of the field
     * was simply unreachable while the phone had been showing all of it for sprints.
     *
     * Written as an absence over **both** files rather than as a presence over one: a
     * clause that only said "the web does not clamp" would go quiet the day somebody
     * clamped the phone to match, which is the wrong repair and the one this is here to
     * prevent. If a synopsis cap is ever wanted it is wanted on both, from one table.
     */
    for (const file of TITLES) {
      expect(withoutProse(read(file)), `${file} truncates the synopsis`).not.toMatch(
        /line-clamp|numberOfLines/,
      );
    }
  });

  it('still draws the synopsis at all, on both platforms', () => {
    /*
     * The absence above is satisfied by a screen with no synopsis on it, which is §6.121's
     * shape — deleting the field passes the clause it exists to protect. Each renderer has
     * to still reach for `overview`.
     */
    /*
     * Rendered, not mentioned. §6.182: `overview` also appears as a style key, a type, a
     * destructure and a `title?.overview &&` guard, so swapping `{title.overview}` for
     * `{title.tagline}` on the web and dropping the phone's `<Text>` while leaving
     * `styles.overview` behind kept this green with the synopsis gone from both screens —
     * which is the §6.121 shape this clause was written to close, inside the clause.
     */
    for (const file of TITLES) {
      expect(withoutProse(read(file)), `${file} no longer shows the synopsis`).toMatch(
        /\{title\.overview\}/,
      );
    }
  });

  it('never passes a label where a title belongs', () => {
    // The literal that caused it. A seed name is a title or it is nothing.
    expect(withoutProse(read('core/src/discover/recommend.ts'))).not.toContain("'Trending now'");
  });
});
