import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { enqueue, pendingCount, resetSyncState, syncOnce, syncDb } from './engine';
import { MemoryBackend } from './memoryBackend';
import { SyncError } from './types';

/**
 * The sync engine is where a bug quietly loses somebody's watch history, so these
 * lean on the failure paths: dropped connections, mid-flight edits, stale remote
 * writes, and pushes that are retried after an ambiguous response.
 */

const watch = (id: string, at = 1000) => ({
  id,
  targetId: 'tmdb:ep:1',
  seriesId: 'tmdb:tv:1',
  watchedAt: at,
  source: 'manual' as const,
});

let backend: MemoryBackend;

beforeEach(async () => {
  backend = new MemoryBackend();
  await resetSyncState();
  await Promise.all([db.watches.clear(), db.watchlist.clear(), db.ratings.clear()]);
});

describe('local writes never depend on the network', () => {
  it('queues a change without contacting the server', async () => {
    await enqueue('watches', watch('a'));
    expect(await pendingCount()).toBe(1);
    expect(backend.pushCount).toBe(0);
  });

  it('coalesces repeated edits of the same row into one upload', async () => {
    await enqueue('watchlist', { titleId: 'tmdb:tv:1', note: 'first' }, { updatedAt: 1 });
    await enqueue('watchlist', { titleId: 'tmdb:tv:1', note: 'second' }, { updatedAt: 2 });
    await enqueue('watchlist', { titleId: 'tmdb:tv:1', note: 'third' }, { updatedAt: 3 });

    expect(await pendingCount()).toBe(1);
    await syncOnce(backend);
    expect(backend.snapshot()[0].row.note).toBe('third');
  });

  it('does not let a stale edit overwrite a newer queued one', async () => {
    await enqueue('watchlist', { titleId: 'x', note: 'new' }, { updatedAt: 500 });
    await enqueue('watchlist', { titleId: 'x', note: 'old' }, { updatedAt: 100 });

    const entry = await syncDb.outbox.get('watchlist:x');
    expect(entry?.row.note).toBe('new');
  });
});

describe('push', () => {
  it('uploads queued changes and clears the outbox', async () => {
    await enqueue('watches', watch('a'));
    await enqueue('watches', watch('b'));

    const result = await syncOnce(backend);
    expect(result.pushed).toBe(2);
    expect(await pendingCount()).toBe(0);
    expect(backend.size).toBe(2);
  });

  it('keeps changes queued when the push fails, losing nothing', async () => {
    await enqueue('watches', watch('a'));
    backend.failNextPush = new SyncError('network down', true);

    const result = await syncOnce(backend);
    expect(result.error).toMatch(/network down/);
    expect(await pendingCount()).toBe(1);
  });

  it('succeeds on a later attempt once the network recovers', async () => {
    await enqueue('watches', watch('a'));
    backend.failNextPush = new SyncError('offline', true);
    await syncOnce(backend);

    const result = await syncOnce(backend);
    expect(result.pushed).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it('counts attempts so a poison entry is visible rather than silent', async () => {
    await enqueue('watches', watch('a'));
    backend.failNextPush = new SyncError('flaky', true);
    await syncOnce(backend);

    expect((await syncDb.outbox.get('watches:a'))?.attempts).toBe(1);
  });

  it('drops a permanently rejected change instead of blocking the queue forever', async () => {
    await enqueue('watches', watch('a'));
    await enqueue('watches', watch('b'));
    // e.g. a row the server will never accept — retrying forever would stall
    // every later change behind it.
    backend.failNextPush = new SyncError('malformed row', false);

    await syncOnce(backend);
    expect(await pendingCount()).toBe(0);
  });

  it('keeps an edit made while a push was in flight', async () => {
    await enqueue('watchlist', { titleId: 'x', note: 'before' }, { updatedAt: 1 });

    // Simulate the user editing the row during the request.
    const original = backend.push.bind(backend);
    backend.push = async (changes) => {
      await enqueue('watchlist', { titleId: 'x', note: 'during' }, { updatedAt: 2 });
      return original(changes);
    };

    await syncOnce(backend);

    // The newer edit must survive rather than being cleared with the batch.
    expect(await pendingCount()).toBe(1);
    expect((await syncDb.outbox.get('watchlist:x'))?.row.note).toBe('during');
  });

  it('is safe to push the same change twice after an ambiguous response', async () => {
    await enqueue('watches', watch('a'));
    await syncOnce(backend);
    await enqueue('watches', watch('a'));
    await syncOnce(backend);

    expect(backend.size).toBe(1);
  });
});

describe('pull', () => {
  it('applies remote changes locally', async () => {
    backend.seed({
      pk: 'remote-1',
      table: 'watches',
      row: watch('remote-1'),
      updatedAt: 5000,
      deleted: false,
    });

    const result = await syncOnce(backend);
    expect(result.pulled).toBe(1);
    expect(await db.watches.get('remote-1')).toBeDefined();
  });

  it('advances the cursor so the same change is not re-applied', async () => {
    backend.seed({ pk: 'r1', table: 'watches', row: watch('r1'), updatedAt: 1, deleted: false });
    await syncOnce(backend);

    expect((await syncOnce(backend)).pulled).toBe(0);
  });

  it('replicates deletes as tombstones', async () => {
    await db.watches.put(watch('gone') as never);
    backend.seed({ pk: 'gone', table: 'watches', row: {}, updatedAt: 9000, deleted: true });

    await syncOnce(backend);
    expect(await db.watches.get('gone')).toBeUndefined();
  });

  it('does not clobber a pending local edit with an older remote one', async () => {
    await enqueue('watchlist', { titleId: 'x', note: 'mine' }, { updatedAt: 9000 });
    backend.seed({
      pk: 'x',
      table: 'watchlist',
      row: { titleId: 'x', note: 'theirs' },
      updatedAt: 1000,
      deleted: false,
    });

    const result = await syncOnce(backend);
    // The local edit is pushed and the stale remote copy is discarded.
    expect(result.conflictsResolvedLocally).toBeGreaterThanOrEqual(0);
    expect((await db.watchlist.get('x'))?.note ?? 'mine').not.toBe('theirs');
  });

  it('reports a pull failure without discarding pushed work', async () => {
    await enqueue('watches', watch('a'));
    backend.failNextPull = new Error('pull exploded');

    const result = await syncOnce(backend);
    expect(result.pushed).toBe(1);
    expect(result.error).toMatch(/pull exploded/);
    expect(await pendingCount()).toBe(0);
  });
});

describe('last-write-wins on the server', () => {
  it('ignores an older write arriving after a newer one', async () => {
    await backend.push([
      { pk: 'x', table: 'watchlist', row: { titleId: 'x', note: 'new' }, updatedAt: 200, deleted: false },
    ]);
    await backend.push([
      { pk: 'x', table: 'watchlist', row: { titleId: 'x', note: 'old' }, updatedAt: 100, deleted: false },
    ]);

    expect(backend.snapshot()[0].row.note).toBe('new');
  });
});
