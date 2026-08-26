import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { importDioCache } from './diocache.ts';

/**
 * End to end against a real `DioCache.db`, built by real SQLite, with real write-ahead
 * frames — the whole path from bytes to watch history.
 *
 * The rows that matter here are the ones written *after* a checkpoint: they exist only
 * in the `-wal`, so importing the `.db` alone must lose them and importing both must
 * not. That is the entire claim doc 8 makes.
 */

const MOVIE = {
  status: 'success',
  data: {
    type: 'list',
    objects: [
      {
        uuid: 'm1',
        entity_type: 'movie',
        rewatch_count: 0,
        watched_at: '2026-02-01T20:00:00Z',
        filter: ['watched'],
        extended: { is_watched: true },
        meta: { uuid: 'm1', name: 'Checkpointed Film', runtime: 7080 },
      },
    ],
  },
};

/** Written only after the checkpoint, so it lives in the log and nowhere else. */
const WAL_ONLY_MOVIE = {
  status: 'success',
  data: {
    type: 'list',
    objects: [
      {
        uuid: 'm2',
        entity_type: 'movie',
        rewatch_count: 0,
        watched_at: '2026-07-14T20:00:00Z',
        filter: ['watched'],
        extended: { is_watched: true },
        meta: { uuid: 'm2', name: 'Only In The Log', runtime: 5400 },
      },
    ],
  },
};

function buildCache() {
  const dir = mkdtempSync(join(tmpdir(), 'dio-'));
  const path = join(dir, 'DioCache.db');

  execFileSync(
    process.execPath,
    [
      '-e',
      `
      const fs = require('node:fs');
      const { DatabaseSync } = require('node:sqlite');
      const p = ${JSON.stringify(path)};
      const db = new DatabaseSync(p);
      db.exec("pragma journal_mode = wal");
      // The real table, from tvtime-rescue-data's own fixture.
      db.exec("create table cache_dio (key text, subKey text, max_age_date integer, max_stale_date integer, content BLOB, statusCode integer, headers BLOB, primary key (key, subKey))");
      const put = (k, obj) => db.prepare("insert into cache_dio values (?,?,?,?,?,?,?)")
        .run(k, 's', 0, 0, Buffer.from(JSON.stringify(obj)), 200, Buffer.from('{}'));

      put('k0', ${JSON.stringify(MOVIE)});
      // Padding, so the checkpoint has something to move and the file grows past one page.
      for (let i = 0; i < 200; i++) put('pad' + i, { junk: 'x'.repeat(200) });
      db.exec("pragma wal_checkpoint(full)");

      // Everything from here on exists only in the -wal.
      put('k1', ${JSON.stringify(WAL_ONLY_MOVIE)});

      fs.copyFileSync(p, p + '.copy');
      fs.copyFileSync(p + '-wal', p + '.copy-wal');
    `,
    ],
    { stdio: 'pipe' },
  );

  return {
    dbBytes: new Uint8Array(readFileSync(`${path}.copy`)),
    walBytes: new Uint8Array(readFileSync(`${path}.copy-wal`)),
    dir,
  };
}

const titles = async () => (await db.watches.toArray()).map((w) => w.targetId).sort();

beforeEach(async () => {
  await Promise.all([
    db.watches.clear(),
    db.watchlist.clear(),
    db.ratings.clear(),
    db.library.clear(),
  ]);
});

describe('importing a real DioCache.db', () => {
  it('reads the cache and records the watches', async () => {
    const { dbBytes, walBytes, dir } = buildCache();
    const report = await importDioCache(dbBytes, walBytes);

    expect(report.watches).toBe(2);
    expect(await titles()).toEqual([
      'local:movie:checkpointed-film',
      'local:movie:only-in-the-log',
    ]);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('loses the recent history when the -wal is left behind', async () => {
    // The exact silent failure the rescue tool everyone is pointed at produces.
    const { dbBytes, dir } = buildCache();
    const report = await importDioCache(dbBytes);

    expect(report.watches).toBe(1);
    expect(await titles()).toEqual(['local:movie:checkpointed-film']);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('says so, loudly, when the -wal was not supplied', async () => {
    // Someone who does not know what they lost cannot go back for it.
    const { dbBytes, dir } = buildCache();
    const report = await importDioCache(dbBytes);

    expect(report.warnings.join(' ')).toMatch(/No DioCache\.db-wal was supplied/);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('reports what the log recovered when it was supplied', async () => {
    const { dbBytes, walBytes, dir } = buildCache();
    const report = await importDioCache(dbBytes, walBytes);

    expect(report.warnings.join(' ')).toMatch(/Recovered \d+ page\(s\) from the write-ahead log/);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('reads runtimes out of seconds', async () => {
    const { dbBytes, walBytes, dir } = buildCache();
    await importDioCache(dbBytes, walBytes);

    const runtimes = (await db.watches.toArray()).map((w) => w.runtimeMin).sort((a, b) => a! - b!);
    expect(runtimes).toEqual([90, 118]);
    rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('refuses a file that is not a TV Time cache, without throwing', async () => {
    const report = await importDioCache(new Uint8Array(4096));

    expect(report.watches).toBe(0);
    expect(report.warnings.join(' ')).toMatch(/Could not read that as a TV Time cache/);
  }, 30_000);
});
