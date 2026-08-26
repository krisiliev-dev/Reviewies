import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db.ts';
import { clearMappingCache } from './animeMapping.ts';
import { getEpisodesCached, setProvider } from './index.ts';
import type { MetadataProvider } from './provider.ts';
import type { CachedEpisode } from '../domain/types.ts';

/**
 * Re-cutting a merged anime run into its real seasons.
 *
 * `splitIntoSeasons` — the arithmetic underneath — has had tests since it was written.
 * The decision *above* it had none: whether to correct at all, which needs a single
 * season of at least twenty-six episodes and a chain of at least two AniList entries,
 * and the renumbering that follows. §6.76 mutated every one of those and the suite
 * stayed green, because reaching this function means answering AniList.
 *
 * It matters because anime is a core audience for this product and because the failure
 * is quiet: a show re-cut on a bad signal shows somebody's history under the wrong
 * season numbers, and a show not re-cut when it should have been leaves them scrolling
 * a hundred-episode season looking for where they were.
 *
 * The mapping is seeded through its own cache rather than stubbed, so `resolveFromTmdb`
 * runs for real; only AniList's GraphQL is answered by hand.
 */
const SERIES = 'tmdb:tv:1';
const ANILIST_FIRST = 999;
const ANILIST_SECOND = 1000;

const episode = (number: number, season = 1): CachedEpisode => ({
  id: `tmdb:ep:1-${season}-${number}`,
  seriesId: SERIES,
  season,
  number,
  name: `Episode ${number}`,
  fetchedAt: Date.now(),
});

/** A provider that answers with exactly the run under test and nothing else. */
function providerReturning(episodes: CachedEpisode[]): MetadataProvider {
  return {
    name: 'fake',
    search: async () => [],
    getTitle: async () => ({ id: SERIES, kind: 'show', name: 'Frieren', fetchedAt: Date.now() }),
    getEpisodes: async () => episodes,
    getWatchProviders: async () => undefined,
    getRecommendations: async () => [],
    getTrending: async () => [],
  };
}

/**
 * AniList, answered from a table rather than the network.
 *
 * One node per id, with the relation edges that make them a chain. `format: 'TV'` on
 * both, because `getSeasonChain` deliberately ignores movies and specials.
 */
function anilistAnswering(nodes: Record<number, unknown>) {
  return vi.fn(async (_url: string, init?: { body?: string }) => {
    const { variables } = JSON.parse(String(init?.body ?? '{}')) as {
      variables?: { id?: number };
    };
    const media = variables?.id === undefined ? null : (nodes[variables.id] ?? null);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { Media: media } }),
    } as unknown as Response;
  });
}

const TWO_SEASON_CHAIN = {
  [ANILIST_FIRST]: {
    id: ANILIST_FIRST,
    episodes: 28,
    format: 'TV',
    title: { english: 'Frieren' },
    relations: {
      edges: [
        {
          relationType: 'SEQUEL',
          node: { id: ANILIST_SECOND, episodes: 10, format: 'TV', title: { english: 'Frieren II' } },
        },
      ],
    },
  },
  [ANILIST_SECOND]: {
    id: ANILIST_SECOND,
    episodes: 10,
    format: 'TV',
    title: { english: 'Frieren II' },
    relations: { edges: [] },
  },
};

const realFetch = globalThis.fetch;

beforeEach(async () => {
  clearMappingCache();
  await Promise.all([db.episodes.clear(), db.titles.clear(), db.table('animeIds').clear()]);
  // The mapping, already known. `resolveFromTmdb` reads this cache before it reaches for
  // the network, so the ARM verification round-trip is not part of what is under test.
  await db.table('animeIds').put({
    id: 'themoviedb:1',
    ids: { themoviedb: 1, anilist: ANILIST_FIRST },
    fetchedAt: Date.now(),
  });
  await db.titles.put({ id: SERIES, kind: 'show', name: 'Frieren', fetchedAt: Date.now() });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('a merged anime season', () => {
  it('is re-cut into the seasons AniList knows about', async () => {
    globalThis.fetch = anilistAnswering(TWO_SEASON_CHAIN) as unknown as typeof fetch;
    const flat = Array.from({ length: 38 }, (_, i) => episode(i + 1));
    setProvider(providerReturning(flat));

    const corrected = await getEpisodesCached(SERIES);

    const first = corrected.filter((e) => e.season === 1);
    const second = corrected.filter((e) => e.season === 2);
    expect(first).toHaveLength(28);
    expect(second).toHaveLength(10);
    // Numbered from one within each season, not continuing through.
    expect(first.map((e) => e.number)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(second.map((e) => e.number)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    // And the twenty-ninth episode of the flat run is the first of season two — the
    // whole point of the correction.
    expect(second[0].id).toBe('tmdb:ep:1-1-29');
  });

  it('keeps every episode id, so watch history survives the correction', async () => {
    globalThis.fetch = anilistAnswering(TWO_SEASON_CHAIN) as unknown as typeof fetch;
    const flat = Array.from({ length: 38 }, (_, i) => episode(i + 1));
    setProvider(providerReturning(flat));

    const corrected = await getEpisodesCached(SERIES);
    expect(corrected.map((e) => e.id).sort()).toEqual(flat.map((e) => e.id).sort());
  });

  it('carries the specials through untouched', async () => {
    globalThis.fetch = anilistAnswering(TWO_SEASON_CHAIN) as unknown as typeof fetch;
    const flat = Array.from({ length: 38 }, (_, i) => episode(i + 1));
    const special = episode(1, 0);
    setProvider(providerReturning([special, ...flat]));

    const corrected = await getEpisodesCached(SERIES);
    const specials = corrected.filter((e) => e.season === 0);
    expect(specials).toHaveLength(1);
    expect(specials[0]).toEqual(special);
  });
});

describe('a run this is not meant to touch', () => {
  it('leaves a season short of twenty-six alone', async () => {
    globalThis.fetch = anilistAnswering(TWO_SEASON_CHAIN) as unknown as typeof fetch;
    // Twenty-five is an ordinary long season. Twenty-six is where TMDB's merging starts
    // being the likelier explanation than a genuinely long run.
    const flat = Array.from({ length: 25 }, (_, i) => episode(i + 1));
    setProvider(providerReturning(flat));

    const corrected = await getEpisodesCached(SERIES);
    expect(corrected.every((e) => e.season === 1)).toBe(true);
    expect(corrected.map((e) => e.number)).toEqual(flat.map((e) => e.number));
  });

  it('re-cuts at exactly twenty-six', async () => {
    globalThis.fetch = anilistAnswering({
      [ANILIST_FIRST]: {
        ...TWO_SEASON_CHAIN[ANILIST_FIRST],
        episodes: 20,
        relations: {
          edges: [
            {
              relationType: 'SEQUEL',
              node: { id: ANILIST_SECOND, episodes: 6, format: 'TV', title: { english: 'II' } },
            },
          ],
        },
      },
      [ANILIST_SECOND]: { ...TWO_SEASON_CHAIN[ANILIST_SECOND], episodes: 6 },
    }) as unknown as typeof fetch;
    const flat = Array.from({ length: 26 }, (_, i) => episode(i + 1));
    setProvider(providerReturning(flat));

    const corrected = await getEpisodesCached(SERIES);
    expect(corrected.filter((e) => e.season === 2)).toHaveLength(6);
  });

  it('leaves a show AniList knows as one season alone', async () => {
    globalThis.fetch = anilistAnswering({
      [ANILIST_FIRST]: {
        id: ANILIST_FIRST,
        episodes: 38,
        format: 'TV',
        title: { english: 'Frieren' },
        relations: { edges: [] },
      },
    }) as unknown as typeof fetch;
    const flat = Array.from({ length: 38 }, (_, i) => episode(i + 1));
    setProvider(providerReturning(flat));

    const corrected = await getEpisodesCached(SERIES);
    expect(corrected.every((e) => e.season === 1)).toBe(true);
  });

  it('leaves a show that is already several seasons alone', async () => {
    globalThis.fetch = anilistAnswering(TWO_SEASON_CHAIN) as unknown as typeof fetch;
    const twoSeasons = [
      ...Array.from({ length: 20 }, (_, i) => episode(i + 1, 1)),
      ...Array.from({ length: 20 }, (_, i) => episode(i + 1, 2)),
    ];
    setProvider(providerReturning(twoSeasons));

    const corrected = await getEpisodesCached(SERIES);
    expect(corrected.filter((e) => e.season === 2)).toHaveLength(20);
  });

  it('leaves it alone when AniList cannot be reached at all', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const flat = Array.from({ length: 38 }, (_, i) => episode(i + 1));
    setProvider(providerReturning(flat));

    const corrected = await getEpisodesCached(SERIES);
    expect(corrected.every((e) => e.season === 1)).toBe(true);
    expect(corrected).toHaveLength(38);
  });
});
