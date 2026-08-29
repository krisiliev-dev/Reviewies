import { describe, expect, it } from 'vitest';
import { splitIntoSeasons, type AniListSeason } from './anilist.ts';

const season = (episodes?: number, title = 'S'): AniListSeason => ({
  anilistId: Math.random(),
  title,
  episodes,
});

describe('splitting a flat episode run into real seasons', () => {
  const episodes = Array.from({ length: 38 }, (_, i) => i + 1);

  it('re-cuts using AniList counts', () => {
    // The Frieren case: TMDB reports 38 episodes as one season; AniList says the
    // first season is 28.
    const split = splitIntoSeasons(episodes, [season(28), season(10)]);
    expect(split.map((s) => s.length)).toEqual([28, 10]);
    expect(split[0][0]).toBe(1);
    expect(split[1][0]).toBe(29);
  });

  it('keeps leftover episodes rather than dropping them', () => {
    // Losing episodes would be far worse than an imperfect final boundary.
    const split = splitIntoSeasons(episodes, [season(28)]);
    expect(split.map((s) => s.length)).toEqual([28, 10]);
  });

  it('returns a single season when AniList knows no counts', () => {
    expect(splitIntoSeasons(episodes, [season(undefined)])).toHaveLength(1);
  });

  it('returns a single season when there is no season data at all', () => {
    expect(splitIntoSeasons(episodes, [])).toHaveLength(1);
  });

  it('handles an empty episode list', () => {
    expect(splitIntoSeasons([], [season(12)])).toEqual([]);
  });

  it('stops early when counts exceed the episodes available', () => {
    // A season that has been announced but not yet aired must not create an
    // empty trailing group.
    const split = splitIntoSeasons([1, 2, 3], [season(3), season(12)]);
    expect(split.map((s) => s.length)).toEqual([3]);
  });

  it('ignores zero and negative counts', () => {
    const split = splitIntoSeasons([1, 2, 3, 4], [season(0), season(2), season(-5)]);
    expect(split.map((s) => s.length)).toEqual([2, 2]);
  });
});
