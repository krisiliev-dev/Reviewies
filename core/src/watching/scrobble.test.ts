import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { markWatched } from '../data/repo';
import { applyScrobble, isScrobble, matchLibraryTitle, type ScrobbleDeps } from './scrobble';
import type { CachedEpisode } from '../domain/types';

/**
 * The rule under all of this: a scrobble may only ever confirm something you already
 * track, and only when it is sure which. It arrives as a show name scraped off a
 * streaming page, and the cost of a confident wrong answer is a corrupted history —
 * which is the thing this product exists to protect people from.
 */

const EPISODES: CachedEpisode[] = [
  { id: 'tmdb:ep:1', seriesId: 'tmdb:tv:1', season: 1, number: 1, name: 'Pilot', runtimeMin: 48, fetchedAt: 0 },
  { id: 'tmdb:ep:2', seriesId: 'tmdb:tv:1', season: 1, number: 2, name: 'Drift', runtimeMin: 44, fetchedAt: 0 },
];

const deps: ScrobbleDeps = { episodes: async (id) => EPISODES.filter((e) => e.seriesId === id) };

async function track(id: string, name: string) {
  await db.titles.put({ id, name, kind: 'tv', fetchedAt: Date.now() } as never);
  await db.library.put({ titleId: id, kind: 'tv', status: 'watching', addedAt: Date.now() } as never);
}

beforeEach(async () => {
  await db.titles.clear();
  await db.library.clear();
  await db.watches.clear();
  await db.outbox.clear();
});

describe('recognising a scrobble', () => {
  it('needs a name and a timestamp', () => {
    expect(isScrobble({ show: 'The Long Dark', at: 1 })).toBe(true);
    expect(isScrobble({ show: 'The Long Dark' })).toBe(false);
    expect(isScrobble({ at: 1 })).toBe(false);
    expect(isScrobble(null)).toBe(false);
    expect(isScrobble('The Long Dark')).toBe(false);
  });
});

describe('matching a name against the library', () => {
  const library = [
    { id: 'a', name: 'The Long Dark' },
    { id: 'b', name: 'Severance' },
  ];

  it('matches an exact name', async () => {
    expect((await matchLibraryTitle('The Long Dark', library))?.id).toBe('a');
  });

  it('tolerates the punctuation a player puts in a title', async () => {
    expect((await matchLibraryTitle('the long dark.', library))?.id).toBe('a');
  });

  it('refuses a name it does not have', async () => {
    expect(await matchLibraryTitle('Some Other Show', library)).toBeUndefined();
  });

  it('refuses when two library entries are equally plausible', async () => {
    // The case that matters: not "did it find something" but "was there only one thing
    // to find". A franchise with a sequel is the ordinary version of this.
    const ambiguous = [
      { id: 'a', name: 'The Long Dark' },
      { id: 'b', name: 'The Long Dark ' },
    ];
    expect(await matchLibraryTitle('The Long Dark', ambiguous)).toBeUndefined();
  });

  it('refuses an empty name rather than matching the first thing', async () => {
    expect(await matchLibraryTitle('   ', library)).toBeUndefined();
  });
});

describe('applying a scrobble', () => {
  it('marks the episode watched, attributed to the extension', async () => {
    await track('tmdb:tv:1', 'The Long Dark');

    const result = await applyScrobble(
      { show: 'The Long Dark', season: 1, episode: 2, at: 1_700_000_000_000 },
      deps,
    );

    expect(result).toEqual({ outcome: 'marked', targetId: 'tmdb:ep:2' });
    const [watch] = await db.watches.toArray();
    expect(watch.targetId).toBe('tmdb:ep:2');
    expect(watch.seriesId).toBe('tmdb:tv:1');
    expect(watch.source).toBe('extension');
    // Runtime is snapshotted at write time, because stats are runtime-weighted and the
    // metadata cache is a cache.
    expect(watch.runtimeMin).toBe(44);
    // Stamped when the extension saw it, not when the app got round to it.
    expect(watch.watchedAt).toBe(1_700_000_000_000);
  });

  it('queues it for upload like any other watch', async () => {
    await track('tmdb:tv:1', 'The Long Dark');
    await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 1 }, deps);
    const [watch] = await db.watches.toArray();
    expect(await db.outbox.get(`watches:${watch.id}`)).toBeDefined();
  });

  it('does nothing for a show that is not in the library', async () => {
    await track('tmdb:tv:1', 'Severance');
    expect(await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 1 }, deps))
      .toEqual({ outcome: 'no-match' });
    expect(await db.watches.count()).toBe(0);
  });

  it('does not add the show, however confident the name is', async () => {
    // An empty library and a perfect name is still nothing to confirm. A page title
    // must never be able to start tracking something on your behalf.
    expect(await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 1 }, deps))
      .toEqual({ outcome: 'no-match' });
    expect(await db.library.count()).toBe(0);
  });

  it('says when it could not tell two library entries apart', async () => {
    await track('tmdb:tv:1', 'The Long Dark');
    await track('tmdb:tv:2', 'The Long Dark');
    expect(await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 1 }, deps))
      .toEqual({ outcome: 'ambiguous' });
    expect(await db.watches.count()).toBe(0);
  });

  it('does nothing when the episode is not in the cached listing', async () => {
    await track('tmdb:tv:1', 'The Long Dark');
    expect(await applyScrobble({ show: 'The Long Dark', season: 9, episode: 1, at: 1 }, deps))
      .toEqual({ outcome: 'unknown-episode' });
    expect(await db.watches.count()).toBe(0);
  });

  it('does not fabricate a rewatch when the heartbeat repeats', async () => {
    await track('tmdb:tv:1', 'The Long Dark');
    await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 1 }, deps);
    const second = await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 2 }, deps);

    expect(second.outcome).toBe('already-watched');
    expect(await db.watches.count()).toBe(1);
  });

  it('leaves a watch somebody logged by hand alone', async () => {
    await track('tmdb:tv:1', 'The Long Dark');
    await markWatched({ targetId: 'tmdb:ep:1', seriesId: 'tmdb:tv:1' });

    const result = await applyScrobble({ show: 'The Long Dark', season: 1, episode: 1, at: 1 }, deps);
    expect(result.outcome).toBe('already-watched');
    expect((await db.watches.toArray())[0].source).toBe('manual');
  });

  it('does nothing without a season and episode', async () => {
    await track('tmdb:tv:1', 'The Long Dark');
    // A film, or a page the adapter could not read an episode label off. Position is
    // still useful to Watching Mode; a watch is not something to guess at.
    expect(await applyScrobble({ show: 'The Long Dark', at: 1 }, deps)).toEqual({
      outcome: 'incomplete',
    });
    expect(await db.watches.count()).toBe(0);
  });
});
