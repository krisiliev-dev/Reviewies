import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../data/db.ts';
import {
  MAX_ATTEMPTS,
  rejectedCount,
  resetSyncState,
  retryRejected,
  syncOnce,
} from './engine.ts';
import { enqueue } from './engine.ts';
import { MemoryBackend } from './memoryBackend.ts';
import { SyncError } from './types.ts';
import { stripComments } from '../test/source.ts';

/**
 * A queue that cannot drain, and nobody being told.
 *
 * §6.70 found a tombstone the server could never accept. The row was one bug; the
 * silence around it is the larger one. `syncOnce` returns on the first failed push, so
 * one entry the server refuses holds up everything queued behind it — and `attempts`
 * was counted and read by nothing at all, so a queue stuck for a week looked exactly
 * like a queue that was empty.
 *
 * The other half of it was worse and nobody had noticed: a *permanent* failure deleted
 * the entire batch. Postgres fails the statement rather than the row, and nothing here
 * asked which row, so one malformed tombstone could take a hundred and ninety-nine good
 * watch events with it. §6.71.
 */

const watch = (id: string) => ({
  id,
  targetId: `tmdb:ep:${id}`,
  seriesId: 'tmdb:tv:1',
  watchedAt: 1000,
  source: 'manual' as const,
});

let backend: MemoryBackend;

beforeEach(async () => {
  backend = new MemoryBackend();
  await resetSyncState();
  await db.rejected.clear();
  await db.watches.clear();
});

/** Queue in a known order, oldest first, so "in front" means something. */
async function queue(ids: string[]) {
  for (const [i, id] of ids.entries()) {
    await enqueue('watches', watch(id) as unknown as Record<string, unknown>, {
      updatedAt: 1000 + i,
    });
  }
}

describe('one write the server will never accept', () => {
  beforeEach(() => {
    // First in the queue, and it stays first: the point is that everything behind it
    // used to be stuck there. A test that puts the poison last proves nothing.
    backend.refuses.set('watches:poison', new SyncError('23502: null value in column', false));
  });

  it('does not stop everything behind it', async () => {
    await queue(['poison', 'a', 'b', 'c']);
    await syncOnce(backend);

    const delivered = backend.snapshot().map((c) => c.pk).sort();
    expect(delivered).toEqual(['a', 'b', 'c']);
  });

  it('is set aside rather than deleted', async () => {
    await queue(['poison', 'a']);
    await syncOnce(backend);

    expect(await rejectedCount()).toBe(1);
    const [held] = await db.rejected.toArray();
    expect(held.pk).toBe('poison');
    expect(held.reason).toContain('23502');
    // The row itself, not a stub: whatever is offered to somebody later has to be the
    // write they made.
    expect(held.row.targetId).toBe('tmdb:ep:poison');
  });

  it('does not take its neighbours with it', async () => {
    // The whole batch used to be deleted. Two hundred writes for one bad row.
    await queue(['poison', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
    await syncOnce(backend);

    expect(await rejectedCount()).toBe(1);
    expect(backend.snapshot()).toHaveLength(7);
  });

  it('leaves the queue empty rather than looping on it', async () => {
    await queue(['poison', 'a']);
    await syncOnce(backend);
    expect(await db.outbox.count()).toBe(0);
  });

  it('and a later sync is unaffected', async () => {
    await queue(['poison', 'a']);
    await syncOnce(backend);
    await queue(['later']);
    const result = await syncOnce(backend);

    expect(result.error).toBeUndefined();
    expect(backend.snapshot().map((c) => c.pk)).toContain('later');
  });

  it('reports how many it set aside', async () => {
    await queue(['poison', 'a']);
    expect((await syncOnce(backend)).rejected).toBe(1);
  });

  it('finds more than one of them in the same batch', async () => {
    backend.refuses.set('watches:poison2', new SyncError('22P02: invalid input', false));
    await queue(['poison', 'a', 'poison2', 'b']);
    await syncOnce(backend);

    expect((await db.rejected.toArray()).map((r) => r.pk).sort()).toEqual(['poison', 'poison2']);
    expect(backend.snapshot().map((c) => c.pk).sort()).toEqual(['a', 'b']);
  });
});

describe('a failure the server calls temporary', () => {
  it('keeps the entry and counts the attempt', async () => {
    await queue(['a']);
    backend.failNextPush = new SyncError('503: unavailable', true);
    await syncOnce(backend);

    const [entry] = await db.outbox.toArray();
    expect(entry.attempts).toBe(1);
    expect(await rejectedCount()).toBe(0);
  });

  it('gives up on it eventually, rather than retrying for ever', async () => {
    // Retryable buys patience, not immunity: a row the server calls transient and
    // refuses every time is §6.70's jam wearing different clothes.
    await queue(['a']);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      backend.failNextPush = new SyncError('503: unavailable', true);
      await syncOnce(backend);
    }

    expect(await db.outbox.count()).toBe(0);
    expect(await rejectedCount()).toBe(1);
    expect((await db.rejected.toArray())[0].attempts).toBe(MAX_ATTEMPTS);
  });

  it('and an ordinary network failure is still just a wait', async () => {
    await queue(['a']);
    backend.failNextPush = new Error('Failed to fetch');
    await syncOnce(backend);

    expect(await db.outbox.count()).toBe(1);
    expect(await rejectedCount()).toBe(0);

    await syncOnce(backend);
    expect(backend.snapshot()).toHaveLength(1);
  });
});

describe('offering it back', () => {
  it('puts what was set aside into the queue again', async () => {
    // The honest thing after a deployment: a row refused because the schema did not
    // know a column succeeds once it does.
    backend.refuses.set('watches:poison', new SyncError('42703: no such column', false));
    await queue(['poison']);
    await syncOnce(backend);
    expect(await rejectedCount()).toBe(1);

    backend.refuses.clear();
    expect(await retryRejected()).toBe(1);
    await syncOnce(backend);

    expect(await rejectedCount()).toBe(0);
    expect(backend.snapshot().map((c) => c.pk)).toEqual(['poison']);
  });

  it('starts its count again, so one bad week does not doom it', async () => {
    await queue(['a']);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      backend.failNextPush = new SyncError('503: unavailable', true);
      await syncOnce(backend);
    }
    await retryRejected();
    const [entry] = await db.outbox.toArray();
    expect(entry.attempts).toBe(0);
  });
});

/**
 * The classifier's list, checked against the file rather than remembered.
 *
 * §6.71 widened it after §6.70's jam, and the codes came from making real Postgres
 * reject each shape (`app/src/backend/schema.test.ts`). This is the cheap half: that the
 * decisions written down there are the decisions in the code, and that the one
 * deliberate exception stays an exception.
 */
describe('which failures are worth trying again', () => {
  /**
   * Comments stripped first, and that is not tidiness.
   *
   * The first version of this read the set with its comments in, so commenting a code
   * *out* left it "listed" and every check below passed. Found by planting exactly that
   * — the third plant of the sprint, and the only one that did not fail. A guard that
   * reads prose as code is the shape this repository keeps catching itself in (§6.41,
   * §6.63), and it catches nothing.
   */
  const source = stripComments(
    readFileSync(resolve(import.meta.dirname, './supabaseBackend.ts'), 'utf8'),
  );
  const permanent = /const permanent = new Set\(\[([\s\S]*?)\]\)/.exec(source)?.[1] ?? '';
  const listed = [...permanent.matchAll(/'([0-9A-Z]{5})'/g)].map((m) => m[1]);

  it('found the list rather than passing on an empty one', () => {
    expect(listed.length).toBeGreaterThan(4);
  });

  it.each([
    ['42501', 'an RLS policy refused it'],
    ['23514', 'a check constraint the client cannot satisfy'],
    ['23502', 'a not-null column the client did not send'],
    ['22003', 'a number too big for the column'],
    ['22P02', 'a uuid that is not one'],
    ['42703', 'a column the deployed schema does not have'],
    ['23505', 'a duplicate the conflict target missed'],
  ])('%s never succeeds however often it is sent — %s', (code) => {
    expect(listed).toContain(code);
  });

  it('but a missing profile row is a timing problem, and stays retryable', () => {
    // 23503 is the only foreign key these tables have — `user_id → profiles` — and
    // `ensureProfile()` fixes it on the next run. Setting somebody's history aside for
    // a reason that resolves itself would be the wrong kind of caution.
    expect(listed).not.toContain('23503');
  });
});
