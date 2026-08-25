import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { detectRescueFile, importRescueCsv, parseBool, stripBom } from './tvtimeRescue';
import { getUpNext, unmatchedImportCount } from './repo';

/**
 * Fixtures use the exact headers the rescue tool emits, taken from its source
 * (tvtime_rescue/extract/parse.py), not guessed at. Getting these wrong would mean
 * silently failing to import the only surviving copy of someone's watch history.
 */
const EPISODES_HEADER =
  'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id';
const MOVIES_HEADER =
  'title,year,genres,watched,watch_later,watched_at,rewatch_count,rating,runtime_min,imdb_id,overview';
const SERIES_HEADER =
  'title,watched_eps,aired_eps,status,progress,up_to_date,favorite,archived,for_later,watchedDate';

beforeEach(async () => {
  await Promise.all([
    db.watches.clear(),
    db.watchlist.clear(),
    db.ratings.clear(),
    db.library.clear(),
    db.titles.clear(),
    db.episodes.clear(),
  ]);
});

/**
 * What the import leaves behind, from the app's point of view rather than the data's.
 *
 * The watches all landed and nothing else did: no library rows, no names. So a
 * successful rescue of somebody's entire history left the app saying "Nothing tracked
 * yet" over a set of IDs with no titles attached, which is indistinguishable from an
 * import that silently failed. Watching an episode of a show means the show belongs in
 * your library, and the name in the export is the only name anyone has until a provider
 * is asked.
 */
describe('what the app can show afterwards', () => {
  it('puts a show you have watched into your library', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    const report = await importRescueCsv(csv);

    expect(await db.library.count()).toBe(1);
    expect(report.library).toBe(1);
    const [item] = await db.library.toArray();
    // Watching, not completed: an export says what was seen, never whether the show has
    // finished. Completed would drop a live show out of Up Next for good.
    expect(item.status).toBe('watching');
  });

  it('keeps the name, so the library is not a list of identifiers', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    await importRescueCsv(csv);

    const [title] = await db.titles.toArray();
    expect(title.name).toBe('The Long Dark');
    // Stale from the moment it is written, so the first screen that asks a provider
    // about this show replaces the placeholder rather than trusting it.
    expect(title.fetchedAt).toBe(0);
  });

  it('records a film the same way', async () => {
    const csv = `${MOVIES_HEADER}\nQuiet Harbour,2024,Drama,True,False,2026-02-01,0,8,104,tt1,`;
    await importRescueCsv(csv);

    const [item] = await db.library.toArray();
    expect(item.kind).toBe('film');
    expect(item.status).toBe('completed');
    expect((await db.titles.toArray())[0].name).toBe('Quiet Harbour');
  });

  it('records the episodes themselves, not just that they were watched', async () => {
    const csv =
      `${EPISODES_HEADER}\n` +
      'The Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001\n' +
      'The Long Dark,2,3,Thaw,True,2026-01-06,1,2026-01-02,900,4002';
    await importRescueCsv(csv);

    const episodes = await db.episodes.toArray();
    expect(episodes).toHaveLength(2);
    // Season and number are the whole point. Matching these shows to a provider later
    // means mapping each watched episode onto the provider's own episode ID, and the
    // only way across is season and number — TV Time's episode_id survives in the local
    // ID and says nothing about where in the run it sits.
    expect(episodes.map((e) => `s${e.season}e${e.number} ${e.name}`).sort()).toEqual([
      's1e1 Pilot',
      's2e3 Thaw',
    ]);
    expect(episodes.every((e) => e.fetchedAt === 0)).toBe(true);
  });

  it('does not turn an imported show into an Up Next entry', async () => {
    // Only watched episodes are recorded, so these are not a catalogue. A show whose
    // every known episode is watched must not surface as "next" — and must not be
    // mistaken for a finished one either.
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    await importRescueCsv(csv);

    expect(await getUpNext()).toEqual([]);
    expect(await unmatchedImportCount()).toBe(1);
  });

  it('does not overwrite what is already known', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    await importRescueCsv(csv);

    const [item] = await db.library.toArray();
    await db.library.put({ ...item, status: 'dropped' });
    await db.titles.put({ ...(await db.titles.toArray())[0], name: 'The Long Dark (2021)', fetchedAt: 1 });

    // Re-importing the same export is a normal thing to do — twice from two devices,
    // or after adding a second file. It must not reset a status somebody has changed
    // or replace a title a provider has since filled in.
    await importRescueCsv(csv);

    expect((await db.library.toArray())[0].status).toBe('dropped');
    expect((await db.titles.toArray())[0].name).toBe('The Long Dark (2021)');
    expect(await db.library.count()).toBe(1);
  });
});

describe('file detection', () => {
  it('recognises each rescue file by its headers', () => {
    expect(detectRescueFile(EPISODES_HEADER.split(','))).toBe('episodes');
    expect(detectRescueFile(MOVIES_HEADER.split(','))).toBe('movies');
    expect(detectRescueFile(SERIES_HEADER.split(','))).toBe('series');
  });

  it('does not mistake something else for a rescue file', () => {
    expect(detectRescueFile(['foo', 'bar'])).toBe('unknown');
  });
});

describe('encoding', () => {
  it('strips the UTF-8 BOM the tool writes', () => {
    // utf-8-sig output: left in place the BOM becomes part of the first header, so
    // every column match fails and the file looks unrecognisable.
    expect(stripBom('﻿show,season')).toBe('show,season');
    expect(stripBom('show,season')).toBe('show,season');
  });

  it('imports a file that still carries its BOM', async () => {
    const csv = `﻿${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    const report = await importRescueCsv(csv);
    expect(report.file).toBe('episodes');
    expect(report.watches).toBe(1);
  });
});

describe('booleans', () => {
  it('accepts the Python capitalisation the tool emits', () => {
    expect(parseBool('True')).toBe(true);
    expect(parseBool('False')).toBe(false);
  });

  it('is liberal about other spellings', () => {
    expect(parseBool('true')).toBe(true);
    expect(parseBool('1')).toBe(true);
    expect(parseBool('yes')).toBe(true);
    expect(parseBool('')).toBe(false);
    expect(parseBool(undefined)).toBe(false);
  });
});

describe('episodes.csv', () => {
  it('imports a watched episode', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    const report = await importRescueCsv(csv);

    expect(report.watches).toBe(1);
    expect(await db.watches.count()).toBe(1);
  });

  it('skips unseen episodes rather than inventing a watch', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,2,Next,False,,0,2026-01-08,900,4002`;
    const report = await importRescueCsv(csv);

    expect(report.watches).toBe(0);
    expect(await db.watches.count()).toBe(0);
  });

  it('preserves rewatches from times_watched', async () => {
    // Recording only one would discard exactly the history rewatch counts exist for.
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,3,2026-01-01,900,4001`;
    const report = await importRescueCsv(csv);

    expect(report.watches).toBe(3);
    expect(report.rewatches).toBe(2);
    expect(await db.watches.count()).toBe(3);
  });

  it('orders repeat viewings rather than stacking them on one timestamp', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,2,2026-01-01,900,4001`;
    await importRescueCsv(csv);

    const dates = (await db.watches.toArray()).map((w) => w.watchedAt).sort();
    expect(new Set(dates).size).toBe(2);
  });

  it('is idempotent, so re-importing does not duplicate history', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,2,2026-01-01,900,4001`;
    await importRescueCsv(csv);
    await importRescueCsv(csv);

    expect(await db.watches.count()).toBe(2);
  });

  it('groups episodes under their series', async () => {
    const csv = [
      EPISODES_HEADER,
      'The Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001',
      'The Long Dark,1,2,Thaw,True,2026-01-12,1,2026-01-08,900,4002',
    ].join('\n');
    await importRescueCsv(csv);

    const series = new Set((await db.watches.toArray()).map((w) => w.seriesId));
    expect(series.size).toBe(1);
  });

  it('still imports when TV Time IDs are missing', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,,`;
    expect((await importRescueCsv(csv)).watches).toBe(1);
  });
});

describe('movies.csv', () => {
  it('imports a watched film with its runtime', async () => {
    const csv = `${MOVIES_HEADER}\nQuiet Harbour,2024,Drama,True,False,2026-02-01,0,0,118,tt123,An overview`;
    const report = await importRescueCsv(csv);

    expect(report.watches).toBe(1);
    expect((await db.watches.toArray())[0].runtimeMin).toBe(118);
  });

  it('turns rewatch_count into repeat viewings', async () => {
    const csv = `${MOVIES_HEADER}\nQuiet Harbour,2024,Drama,True,False,2026-02-01,2,0,118,tt123,x`;
    const report = await importRescueCsv(csv);
    // rewatch_count of 2 means three viewings in total.
    expect(report.watches).toBe(3);
  });

  it('imports watch_later as a watchlist entry', async () => {
    const csv = `${MOVIES_HEADER}\nQuiet Harbour,2024,Drama,False,True,,0,0,118,tt123,x`;
    const report = await importRescueCsv(csv);

    expect(report.watchlist).toBe(1);
    expect(report.watches).toBe(0);
    expect(await db.watchlist.count()).toBe(1);
  });

  it('converts a ten-point rating onto our five-point scale', async () => {
    const csv = `${MOVIES_HEADER}\nQuiet Harbour,2024,Drama,True,False,2026-02-01,0,9,118,tt123,x`;
    await importRescueCsv(csv);
    expect((await db.ratings.toArray())[0].value).toBe(4.5);
  });

  it('ignores an absent rating rather than storing zero', async () => {
    const csv = `${MOVIES_HEADER}\nQuiet Harbour,2024,Drama,True,False,2026-02-01,0,0,118,tt123,x`;
    await importRescueCsv(csv);
    expect(await db.ratings.count()).toBe(0);
  });
});

describe('series.csv', () => {
  it('adds a show to the library as being watched', async () => {
    const csv = `${SERIES_HEADER}\nThe Long Dark,8,10,Continuing,80,False,True,False,False,2026-01-05`;
    const report = await importRescueCsv(csv);

    expect(report.library).toBe(1);
    expect((await db.library.toArray())[0].status).toBe('watching');
  });

  it('treats an archived show as dropped', async () => {
    const csv = `${SERIES_HEADER}\nOld Show,2,10,Ended,20,False,False,True,False,2024-01-05`;
    await importRescueCsv(csv);
    expect((await db.library.toArray())[0].status).toBe('dropped');
  });

  it('treats an up-to-date show as completed', async () => {
    const csv = `${SERIES_HEADER}\nFinished Show,10,10,Ended,100,True,False,False,False,2025-01-05`;
    await importRescueCsv(csv);
    expect((await db.library.toArray())[0].status).toBe('completed');
  });

  it('imports for_later as a watchlist entry', async () => {
    const csv = `${SERIES_HEADER}\nMaybe Later,0,10,Continuing,0,False,False,False,True,`;
    const report = await importRescueCsv(csv);
    expect(report.watchlist).toBe(1);
  });
});

describe('reporting', () => {
  it('explains clearly when a file is not recognised', async () => {
    const report = await importRescueCsv('foo,bar\n1,2');
    expect(report.file).toBe('unknown');
    // Echoes what it saw, so the user can tell which file they picked.
    expect(report.warnings[0]).toMatch(/Not a recognised TV Time rescue file/);
    expect(report.warnings[0]).toMatch(/foo/);
  });

  it('handles an empty file', async () => {
    const report = await importRescueCsv('');
    expect(report.warnings[0]).toMatch(/empty/);
  });

  it('counts rows it had to skip', async () => {
    const csv = `${MOVIES_HEADER}\n,2024,Drama,True,False,2026-02-01,0,0,118,tt123,x`;
    const report = await importRescueCsv(csv);
    expect(report.skipped).toBe(1);
    expect(report.warnings.some((w) => /skipped/.test(w))).toBe(true);
  });
});
