import { zipSync, strToU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { importArchive, importArchiveEntry, pairWal } from './archiveImport';

const EPISODES_CSV =
  'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id\n' +
  'The Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001';

const MOVIES_CSV =
  'title,year,genres,watched,watch_later,watched_at,rewatch_count,rating,runtime_min,imdb_id,overview\n' +
  'Quiet Harbour,2024,Drama,True,False,2026-02-01,0,0,118,tt1,x';

const GENERIC_CSV = 'series,season,episode,watched_at\nSome Show,1,1,2026-03-01';

beforeEach(async () => {
  await Promise.all([
    db.watches.clear(),
    db.watchlist.clear(),
    db.ratings.clear(),
    db.library.clear(),
  ]);
});

describe('pairing a write-ahead log with its database', () => {
  it('matches SQLite\'s own naming convention', () => {
    const pairs = pairWal(['DioCache.db', 'DioCache.db-wal']);
    expect(pairs.get('DioCache.db')).toBe('DioCache.db-wal');
  });

  it('ignores a stray -wal with no database beside it', () => {
    expect(pairWal(['Other.db-wal']).size).toBe(0);
  });

  it('pairs inside a folder', () => {
    const pairs = pairWal(['backup/DioCache.db', 'backup/DioCache.db-wal']);
    expect(pairs.get('backup/DioCache.db')).toBe('backup/DioCache.db-wal');
  });

  it('does not pair files from different folders', () => {
    // Two separate recoveries in one archive must not be spliced together.
    expect(pairWal(['a/DioCache.db', 'b/DioCache.db-wal']).size).toBe(0);
  });
});

describe('recognising an entry by its contents', () => {
  it('spots a rescue-tool episodes file whatever it is called', async () => {
    // The export format changed more than once; matching on filenames would fail
    // silently for anyone whose zip differs.
    const { outcome } = await importArchiveEntry('some-random-name.txt', strToU8(EPISODES_CSV));
    expect(outcome).toMatch(/TV Time episodes\.csv/);
    expect(await db.watches.count()).toBe(1);
  });

  it('spots a generic watch history', async () => {
    const { outcome } = await importArchiveEntry('history.csv', strToU8(GENERIC_CSV));
    expect(outcome).toMatch(/Watch history/);
  });

  it('spots our own export', async () => {
    const bundle = JSON.stringify({
      format: 'reviewies-export',
      version: 1,
      library: [],
      watches: [],
      ratings: [],
      watchlist: [],
      reactions: [],
    });
    const { outcome } = await importArchiveEntry('reviewies.json', strToU8(bundle));
    expect(outcome).toMatch(/Reviewies export/);
  });

  it('says plainly when JSON is not a format we know', async () => {
    const { outcome } = await importArchiveEntry('x.json', strToU8('{"unknown": true}'));
    expect(outcome).toMatch(/not a format we recognise/);
  });

  it('reports an unreadable CSV with its columns, so the user can tell us', async () => {
    const { outcome } = await importArchiveEntry('x.csv', strToU8('alpha,beta\n1,2'));
    expect(outcome).toMatch(/alpha/);
  });

  it('reports something that is not a table at all', async () => {
    const { outcome } = await importArchiveEntry('notes.txt', strToU8('just some prose'));
    expect(outcome).toMatch(/Not recognised/);
  });
});

describe('importing a zip', () => {
  it('imports every recognised file in it', async () => {
    const zip = zipSync({
      'export/episodes.csv': strToU8(EPISODES_CSV),
      'export/movies.csv': strToU8(MOVIES_CSV),
    });
    const report = await importArchive(zip);

    expect(report.watches).toBe(2);
    expect(report.files).toHaveLength(2);
  });

  it('lists what it did with each file rather than reporting a bare total', async () => {
    // Silence is the failure mode: every competitor "imports" and quietly drops half.
    const zip = zipSync({
      'episodes.csv': strToU8(EPISODES_CSV),
      'readme.txt': strToU8('hello'),
    });
    const report = await importArchive(zip);

    expect(report.files.map((f) => f.name).sort()).toEqual(['episodes.csv', 'readme.txt']);
    expect(report.files.find((f) => f.name === 'readme.txt')?.outcome).toMatch(/Not recognised/);
  });

  it('ignores archiver noise instead of calling it unrecognised', async () => {
    const zip = zipSync({
      'episodes.csv': strToU8(EPISODES_CSV),
      '__MACOSX/._episodes.csv': strToU8('junk'),
      '.DS_Store': strToU8('junk'),
    });
    const report = await importArchive(zip);

    expect(report.files).toHaveLength(1);
  });

  it('explains itself when the file is not a zip', async () => {
    const report = await importArchive(new Uint8Array([1, 2, 3, 4]));
    expect(report.warnings.join(' ')).toMatch(/Could not open that as a zip/);
  });

  it('says so when the zip holds nothing readable', async () => {
    const report = await importArchive(zipSync({ '.DS_Store': strToU8('x') }));
    expect(report.warnings.join(' ')).toMatch(/nothing we could read/);
  });

  it('does not double-count a re-import', async () => {
    const zip = zipSync({ 'episodes.csv': strToU8(EPISODES_CSV) });
    await importArchive(zip);
    await importArchive(zip);
    expect(await db.watches.count()).toBe(1);
  });
});
