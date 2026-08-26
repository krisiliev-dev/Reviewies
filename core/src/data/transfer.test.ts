import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { markWatched } from './repo.ts';
import {
  exportAll,
  exportWatchesCsv,
  importBundle,
  importWatchHistoryCsv,
  parseCsv,
  toCsv,
} from './transfer.ts';
import { makeId } from '../domain/types.ts';

beforeEach(async () => {
  await Promise.all([
    db.library.clear(),
    db.watches.clear(),
    db.ratings.clear(),
    db.watchlist.clear(),
    db.reactions.clear(),
    db.titles.clear(),
    db.episodes.clear(),
  ]);
});

describe('CSV parsing', () => {
  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('a,b\n"one, two",three');
    expect(rows[1]).toEqual(['one, two', 'three']);
  });

  it('handles escaped quotes', () => {
    const rows = parseCsv('a\n"she said ""hi"""');
    expect(rows[1]).toEqual(['she said "hi"']);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips blank lines rather than emitting empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toHaveLength(2);
  });

  it('round-trips through toCsv', () => {
    const rows = [
      ['title', 'note'],
      ['Quiet Harbour', 'has a comma, and "quotes"'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('importing watch history from other trackers', () => {
  it('imports rows keyed by series, season and episode', async () => {
    const csv = [
      'series,season,episode,watched_at',
      'The Long Dark,1,1,2026-01-05T20:00:00Z',
      'The Long Dark,1,2,2026-01-06T20:00:00Z',
    ].join('\n');

    const report = await importWatchHistoryCsv(csv);
    expect(report.watches).toBe(2);
    expect(await db.watches.count()).toBe(2);

    const events = await db.watches.orderBy('watchedAt').toArray();
    expect(events[0].source).toBe('import');
    expect(events[0].watchedAt).toBe(Date.parse('2026-01-05T20:00:00Z'));
  });

  it('accepts alternative column names from different exporters', async () => {
    // Header style closer to Trakt/Simkl exports.
    const csv = ['show_name,season_number,episode_number,last_watched', 'Kitchen Nightshift,1,4,2026-02-01'].join(
      '\n',
    );
    expect((await importWatchHistoryCsv(csv)).watches).toBe(1);
  });

  it('warns rather than silently importing nothing when columns are unrecognised', async () => {
    const report = await importWatchHistoryCsv('foo,bar\n1,2');
    expect(report.watches).toBe(0);
    expect(report.warnings[0]).toContain('Could not find a title');
    // The header is echoed back so the user can see what we actually saw.
    expect(report.warnings[0]).toContain('foo');
  });

  it('reports skipped rows instead of dropping them quietly', async () => {
    const csv = ['series,season,episode', 'The Long Dark,1,1', ',,'].join('\n');
    const report = await importWatchHistoryCsv(csv);
    expect(report.watches).toBe(1);
    // The all-empty row is discarded as blank rather than counted.
    expect(report.skipped + report.watches).toBeGreaterThanOrEqual(1);
  });

  it('preserves repeat viewings of the same episode on different dates', async () => {
    const csv = [
      'series,season,episode,watched_at',
      'The Long Dark,1,1,2026-01-05T20:00:00Z',
      'The Long Dark,1,1,2026-03-05T20:00:00Z',
    ].join('\n');

    await importWatchHistoryCsv(csv);
    expect(await db.watches.count()).toBe(2);
  });

  it('is idempotent for identical rows, so re-importing does not duplicate history', async () => {
    const csv = ['series,season,episode,watched_at', 'The Long Dark,1,1,2026-01-05T20:00:00Z'].join('\n');
    await importWatchHistoryCsv(csv);
    await importWatchHistoryCsv(csv);
    expect(await db.watches.count()).toBe(1);
  });
});

describe('export', () => {
  it('exports user data and excludes provider metadata', async () => {
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'The Long Dark', fetchedAt: Date.now() });
    await markWatched({ targetId: makeId('tmdb', 'ep', 'x'), seriesId: 'tmdb:tv:1', runtimeMin: 50 });

    const bundle = await exportAll();
    expect(bundle.format).toBe('reviewies-export');
    expect(bundle.watches).toHaveLength(1);
    // Metadata belongs to the provider and must not be redistributed.
    expect(bundle).not.toHaveProperty('titles');
    expect(bundle).not.toHaveProperty('episodes');
  });

  it('round-trips an export back into an empty database', async () => {
    await markWatched({ targetId: 'tmdb:ep:1', seriesId: 'tmdb:tv:1', runtimeMin: 42 });
    await db.watchlist.put({ titleId: 'tmdb:tv:9', kind: 'show', addedAt: Date.now(), note: 'Ana recommended' });

    const bundle = await exportAll();
    await db.watches.clear();
    await db.watchlist.clear();

    const report = await importBundle(bundle);
    expect(report.watches).toBe(1);
    expect((await db.watchlist.toArray())[0].note).toBe('Ana recommended');
  });

  it('rejects files that are not Reviewies exports', async () => {
    await expect(importBundle({ format: 'something-else' } as never)).rejects.toThrow(
      /Not a Reviewies export/,
    );
  });

  it('warns when importing a newer export version', async () => {
    const bundle = await exportAll();
    const report = await importBundle({ ...bundle, version: 99 });
    expect(report.warnings[0]).toContain('newer version');
  });

  it('writes a watch history CSV with resolved series and episode names', async () => {
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'The Long Dark', fetchedAt: Date.now() });
    await db.episodes.put({
      id: 'tmdb:ep:5',
      seriesId: 'tmdb:tv:1',
      season: 2,
      number: 3,
      name: 'Thaw',
      fetchedAt: Date.now(),
    });
    await markWatched({ targetId: 'tmdb:ep:5', seriesId: 'tmdb:tv:1', runtimeMin: 55 });

    const rows = parseCsv(await exportWatchesCsv());
    expect(rows[0]).toContain('series');
    expect(rows[1]).toContain('The Long Dark');
    expect(rows[1]).toContain('Thaw');
    expect(rows[1]).toContain('2');
  });
});
