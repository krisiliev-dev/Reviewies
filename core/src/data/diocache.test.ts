import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { importDioLibrary } from './diocache.ts';
import type { DioLibrary } from './diocacheParse.ts';

const empty = (over: Partial<DioLibrary> = {}): DioLibrary => ({
  movies: [],
  series: [],
  episodes: [],
  unrecognised: 0,
  ...over,
});

beforeEach(async () => {
  await Promise.all([
    db.watches.clear(),
    db.watchlist.clear(),
    db.ratings.clear(),
    db.library.clear(),
  ]);
});

describe('films', () => {
  const film = {
    title: 'Quiet Harbour',
    watched: true,
    watchLater: false,
    rewatchCount: 0,
    runtimeMin: 118,
    watchedAt: '2026-02-01T20:00:00Z',
  };

  it('records a watch with its runtime', async () => {
    const report = await importDioLibrary(empty({ movies: [film] }));

    expect(report.watches).toBe(1);
    expect((await db.watches.toArray())[0].runtimeMin).toBe(118);
  });

  it('turns a rewatch count into repeat viewings', async () => {
    const report = await importDioLibrary(empty({ movies: [{ ...film, rewatchCount: 2 }] }));
    // Two rewatches means three viewings in total.
    expect(report.watches).toBe(3);
    expect(report.rewatches).toBe(2);
  });

  it('is idempotent, so importing twice does not double a history', async () => {
    await importDioLibrary(empty({ movies: [{ ...film, rewatchCount: 1 }] }));
    await importDioLibrary(empty({ movies: [{ ...film, rewatchCount: 1 }] }));
    expect(await db.watches.count()).toBe(2);
  });

  it('agrees with the CSV importer on IDs, so the two do not double up', async () => {
    // Someone may recover both the rescue tool's CSVs and the raw cache.
    const { importRescueCsv } = await import('./tvtimeRescue.ts');
    await importDioLibrary(empty({ movies: [film] }));
    await importRescueCsv(
      'title,year,genres,watched,watch_later,watched_at,rewatch_count,rating,runtime_min,imdb_id,overview\n' +
        'Quiet Harbour,2024,Drama,True,False,2026-02-01,0,0,118,tt1,x',
    );
    expect(await db.watches.count()).toBe(1);
  });

  it('converts a ten-point rating onto our five-point scale', async () => {
    await importDioLibrary(empty({ movies: [{ ...film, rating: 9 }] }));
    expect((await db.ratings.toArray())[0].value).toBe(4.5);
  });

  it('records watch_later without inventing a watch', async () => {
    const report = await importDioLibrary(
      empty({ movies: [{ ...film, watched: false, watchLater: true }] }),
    );
    expect(report.watchlist).toBe(1);
    expect(report.watches).toBe(0);
  });
});

describe('series and episodes', () => {
  const show = {
    id: 12345,
    title: 'The Long Dark',
    watchedEpisodes: 2,
    airedEpisodes: 10,
    archived: false,
    forLater: false,
    upToDate: false,
    favorite: false,
  };
  const episode = {
    episodeId: 5001,
    showId: 12345,
    show: 'The Long Dark',
    season: 1,
    number: 1,
    name: 'Pilot',
    seen: true,
    seenDate: '2026-01-02 20:00:00',
    timesWatched: 1,
  };

  it('adds a show as being watched', async () => {
    await importDioLibrary(empty({ series: [show] }));
    expect((await db.library.toArray())[0].status).toBe('watching');
  });

  it('treats an archived show as dropped', async () => {
    await importDioLibrary(empty({ series: [{ ...show, archived: true }] }));
    expect((await db.library.toArray())[0].status).toBe('dropped');
  });

  it('treats an up-to-date show as completed', async () => {
    await importDioLibrary(empty({ series: [{ ...show, upToDate: true }] }));
    expect((await db.library.toArray())[0].status).toBe('completed');
  });

  it('records a watched episode against its series', async () => {
    await importDioLibrary(empty({ episodes: [episode] }));
    const [watch] = await db.watches.toArray();
    expect(watch.seriesId).toContain('tvtime-12345');
  });

  it('skips unseen episodes rather than inventing history', async () => {
    const report = await importDioLibrary(empty({ episodes: [{ ...episode, seen: false }] }));
    expect(report.watches).toBe(0);
  });

  it('preserves episode rewatches', async () => {
    const report = await importDioLibrary(empty({ episodes: [{ ...episode, timesWatched: 3 }] }));
    expect(report.watches).toBe(3);
    expect(await db.watches.count()).toBe(3);
  });

  it('parses TV Time\'s space-separated timestamps', async () => {
    // "2026-01-02 20:00:00" is not ISO; Date.parse is inconsistent about it, and
    // falling back to "now" would date years of history to the import.
    await importDioLibrary(empty({ episodes: [episode] }));
    const [watch] = await db.watches.toArray();
    expect(new Date(watch.watchedAt).getUTCFullYear()).toBe(2026);
    expect(new Date(watch.watchedAt).getUTCMonth()).toBe(0);
  });

  it('still imports an episode whose show ID did not survive', async () => {
    const report = await importDioLibrary(
      empty({ episodes: [{ ...episode, showId: undefined }] }),
    );
    expect(report.watches).toBe(1);
  });
});
