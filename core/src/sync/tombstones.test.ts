import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../data/db.ts';
import {
  addToLibrary,
  addToWatchlist,
  clearRating,
  markWatched,
  rate,
  removeFromWatchlist,
  unwatchLatest,
} from '../data/repo.ts';
import { resetSyncState } from './engine.ts';
import { toRemote } from './supabaseBackend.ts';
import type { SyncTable } from './types.ts';

/**
 * A delete queued before the thing it deletes has ever been sent.
 *
 * Do it once and everything is fine. Do it twice — write, then undo — and the outbox
 * coalesces on `table:pk`, so the delete **replaces** the insert that had not gone out
 * yet. A tombstone is an upsert with `deleted: true`, so what reaches the server is a
 * row it has never seen, and the client had been sending nothing but the key.
 *
 * Every not-null column is then missing. Postgres raises 23502; `classify` reads that as
 * retryable; the entry never leaves the queue; and `syncOnce` returns on a push failure,
 * so **every later write is stuck behind it, for ever**. Undo a watch before your next
 * sync — which §6.64's Undo button exists to make easy — and sync stops working, with
 * nothing on screen to say so. §6.70.
 *
 * The check is mechanical rather than a list somebody maintains: the not-null columns
 * come from the migrations, so a column added tomorrow is covered without anybody
 * remembering this file.
 */
const MIGRATIONS = resolve(import.meta.dirname, '../../../supabase/migrations');

/** Columns declared `not null` with no default, per table. */
function requiredColumns(): Map<string, string[]> {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(MIGRATIONS, f), 'utf8'))
    .join('\n');

  const tables = new Map<string, string[]>();
  for (const match of sql.matchAll(/create table if not exists ([a-z_]+) \(([\s\S]*?)\n\);/g)) {
    const required: string[] = [];
    for (const line of match[2].split('\n')) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || trimmed.startsWith('--')) continue;
      const name = trimmed.split(/\s+/)[0];
      if (!/^[a-z_]+$/.test(name)) continue;
      if (['primary', 'unique', 'check', 'constraint', 'foreign'].includes(name)) continue;
      // A default fills itself in; only a bare `not null` needs the client to supply it.
      if (/\bnot null\b/i.test(trimmed) && !/\bdefault\b/i.test(trimmed)) required.push(name);
    }
    tables.set(match[1], required);
  }
  return tables;
}

const REQUIRED = requiredColumns();

/**
 * `user_id` is stamped by the backend adapter from the verified session, never by the
 * row, and is deliberately not in the column map.
 */
const SERVER_SUPPLIED = new Set(['user_id']);

const outbox = () =>
  db.outbox as unknown as import('../data/store.ts').Table<{
    key: string;
    table: SyncTable;
    row: Record<string, unknown>;
    deleted: boolean;
  }>;

/** What the push would actually send for the one entry in the queue. */
async function queuedRow(key: string) {
  const entry = await outbox().get(key);
  expect(entry, `nothing queued under ${key}`).toBeTruthy();
  expect(entry!.deleted, `${key} is not a tombstone`).toBe(true);
  return { table: entry!.table, columns: Object.keys(toRemote(entry!.table, entry!.row)) };
}

function expectComplete(table: string, columns: string[]) {
  const missing = (REQUIRED.get(table) ?? []).filter(
    (c) => !SERVER_SUPPLIED.has(c) && !columns.includes(c),
  );
  expect(missing, `${table} tombstone is missing ${missing.join(', ')}`).toEqual([]);
}

const TITLE = 'tmdb:tv:1';
const EPISODE = 'tmdb:ep:1';

beforeEach(async () => {
  await resetSyncState();
  await Promise.all([
    db.watches.clear(),
    db.ratings.clear(),
    db.watchlist.clear(),
    db.library.clear(),
  ]);
});

describe('the migrations name what a row must carry', () => {
  it('found them, rather than passing on an empty list', () => {
    // Otherwise every check below is vacuous.
    expect(REQUIRED.get('watches')).toContain('watched_at');
    expect(REQUIRED.get('watches')).toContain('target_id');
    expect(REQUIRED.get('ratings')).toContain('value');
    expect(REQUIRED.get('watchlist')).toContain('added_at');
    expect(REQUIRED.get('library')).toContain('status');
  });
});

describe('undoing something that has not been sent yet', () => {
  it('a watch marked and unmarked', async () => {
    await markWatched({ targetId: EPISODE, seriesId: TITLE });
    const [watch] = await db.watches.toArray();
    expect(await unwatchLatest(EPISODE)).toBe(true);

    const { columns } = await queuedRow(`watches:${watch.id}`);
    expectComplete('watches', columns);
  });

  it('a rating given and cleared', async () => {
    await rate(EPISODE, 4);
    await clearRating(EPISODE);

    const { columns } = await queuedRow(`ratings:${EPISODE}`);
    expectComplete('ratings', columns);
  });

  it('a watchlist entry added and removed', async () => {
    await addToWatchlist(TITLE, 'show');
    await removeFromWatchlist(TITLE);

    const { columns } = await queuedRow(`watchlist:${TITLE}`);
    expectComplete('watchlist', columns);
  });
});

describe('and the sequence continuing past the undo', () => {
  it('marking again after unmarking queues a fresh watch, not a resurrected one', async () => {
    // Watches are events with their own ids, so the third act is a new row rather than
    // an edit of the tombstoned one — and the tombstone has to survive it.
    await markWatched({ targetId: EPISODE, seriesId: TITLE });
    const [first] = await db.watches.toArray();
    await unwatchLatest(EPISODE);
    await markWatched({ targetId: EPISODE, seriesId: TITLE });

    const entries = await outbox().toArray();
    const tomb = entries.find((e) => e.key === `watches:${first.id}`);
    const fresh = entries.filter((e) => e.table === 'watches' && !e.deleted);
    expect(tomb?.deleted).toBe(true);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].key).not.toBe(`watches:${first.id}`);
    expect(await db.watches.count()).toBe(1);
  });

  it('rating again after clearing replaces the tombstone rather than keeping both', async () => {
    // A rating is keyed by target, so the same outbox slot: the last thing the person
    // did has to be what the server is told.
    await rate(EPISODE, 4);
    await clearRating(EPISODE);
    await rate(EPISODE, 2);

    const entry = await outbox().get(`ratings:${EPISODE}`);
    expect(entry?.deleted).toBe(false);
    expect(entry?.row.value).toBe(2);
    expect((await db.ratings.get(EPISODE))?.value).toBe(2);
  });

  it('adding to the watchlist again after removing does the same', async () => {
    await addToWatchlist(TITLE, 'show');
    await removeFromWatchlist(TITLE);
    await addToWatchlist(TITLE, 'show', 'second thoughts');

    const entry = await outbox().get(`watchlist:${TITLE}`);
    expect(entry?.deleted).toBe(false);
    expect(entry?.row.note).toBe('second thoughts');
    expect(await db.watchlist.count()).toBe(1);
  });

  it('tracking, dropping and tracking again leaves one library row', async () => {
    await addToLibrary(TITLE, 'show');
    await addToLibrary(TITLE, 'show', 'dropped');
    await addToLibrary(TITLE, 'show', 'watching');

    expect(await db.library.count()).toBe(1);
    expect((await db.library.get(TITLE))?.status).toBe('watching');
    const entry = await outbox().get(`library:${TITLE}`);
    expect(entry?.row.status).toBe('watching');
  });
});
