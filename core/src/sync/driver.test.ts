import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { enqueue, resetSyncState } from './engine';
import { setStorage } from '../data/storage';
import { MemoryBackend } from './memoryBackend';
import { onSyncStatus, requestSync, resetSyncDriver, startSyncDriver, syncStatus } from './driver';
import * as auth from './auth';

/**
 * The driver, which is the part that was missing rather than broken.
 *
 * Every sync bug found in the last three sprints went unnoticed because the queue they
 * fed was barely being drained: on the web the loop belonged to a screen, and on the
 * phone there was no loop at all. These check the triggers, because a driver that starts
 * and never fires is indistinguishable from the thing it replaced.
 */
let backend: MemoryBackend;

beforeEach(async () => {
  backend = new MemoryBackend();
  resetSyncDriver();
  await resetSyncState();
  await Promise.all([db.watches.clear(), db.outbox.clear()]);
  emptyStorage();
  vi.spyOn(auth, 'syncConfigured').mockReturnValue(true);
  vi.spyOn(auth, 'ensureProfile').mockResolvedValue(undefined as never);
});

afterEach(() => {
  resetSyncDriver();
  vi.restoreAllMocks();
});

/** A signed-in session, without a network. */
function signedIn(userId = 'u1') {
  vi.spyOn(auth, 'getSession').mockResolvedValue({ user: { id: userId } } as never);
  vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
}

/** A fresh key/value store, so one case's recorded owner does not reach the next. */
function emptyStorage() {
  const values = new Map<string, string>();
  setStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
}

const watch = (id: string) => ({
  id,
  targetId: 'tmdb:ep:1',
  seriesId: 'tmdb:tv:1',
  watchedAt: 1000,
  source: 'manual' as const,
});

describe('the sync driver', () => {
  it('pushes a queued write without anybody visiting a screen', async () => {
    signedIn();
    startSyncDriver({ backend: () => backend, intervalMs: 60_000 });
    // Let the session resolve before the write, so this is the queue trigger and not
    // the sign-in one doing the work.
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));

    await enqueue('watches', watch('a'));

    // The whole point: a write on the title page reaches the server without anybody
    // opening the account panel.
    await vi.waitFor(() => expect(backend.snapshot()).toHaveLength(1), { timeout: 3000 });
  });

  it('does nothing at all while signed out', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue(null);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
    startSyncDriver({ backend: () => backend });

    await enqueue('watches', watch('a'));
    await requestSync();

    // The rows stay queued rather than being lost or attempted against nothing.
    expect(backend.snapshot()).toHaveLength(0);
    expect(await db.outbox.count()).toBe(1);
  });

  it('syncs when somebody signs in, because that is when a queue built offline moves', async () => {
    let announce: ((session: unknown) => void) | undefined;
    vi.spyOn(auth, 'getSession').mockResolvedValue(null);
    vi.spyOn(auth, 'onAuthChange').mockImplementation((fn) => {
      announce = fn as (session: unknown) => void;
      return () => {};
    });

    startSyncDriver({ backend: () => backend });
    await enqueue('watches', watch('a'));
    expect(backend.snapshot()).toHaveLength(0);

    announce?.({ user: { id: 'u1' } });

    await vi.waitFor(() => expect(backend.snapshot()).toHaveLength(1), { timeout: 3000 });
  });

  it('coalesces overlapping reasons into one round trip', async () => {
    signedIn();
    // No driver: this is about requestSync itself, and a driver would fire its own
    // sync on sign-in and on the enqueue below, which is the noise this measures.
    startSyncDriver({ backend: () => backend, intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await vi.waitFor(() => expect(syncStatus().busy).toBe(false));

    // Something to actually push, or every call is a no-op and the test passes with
    // the guard removed.
    await enqueue('watches', watch('a'));
    await vi.waitFor(() => expect(backend.snapshot()).toHaveLength(1), { timeout: 3000 });
    await enqueue('watches', watch('b'));
    const before = backend.pushCount;

    // A write settling just as the app comes to the foreground is one sync, not two.
    await Promise.all([requestSync(), requestSync(), requestSync()]);

    expect(backend.pushCount - before).toBeLessThanOrEqual(1);
  });

  it('survives a backend that throws, and says so', async () => {
    signedIn();
    startSyncDriver({
      backend: () => {
        throw new Error('no network');
      },
    });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));

    await requestSync();

    // A failed sync is not a failed app: the status carries the reason and the queue
    // keeps its rows for the next trigger.
    expect(syncStatus().lastError).toBe('no network');
    expect(syncStatus().busy).toBe(false);
  });

  it('tells subscribers rather than making them poll', async () => {
    signedIn();
    const seen: boolean[] = [];
    onSyncStatus((s) => seen.push(s.busy));

    startSyncDriver({ backend: () => backend });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await requestSync();

    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('replaces itself rather than running two loops through one queue', async () => {
    signedIn();
    const stopFirst = startSyncDriver({ backend: () => backend });
    startSyncDriver({ backend: () => backend });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));

    await enqueue('watches', watch('a'));
    await vi.waitFor(() => expect(backend.snapshot()).toHaveLength(1), { timeout: 3000 });

    // Two drivers racing the same outbox is the failure this avoids; the first was
    // stopped when the second started, so stopping it again is a no-op.
    stopFirst();
    expect(backend.snapshot()).toHaveLength(1);
  });
});


describe('whose queue it is', () => {
  it('sends a second account nothing the first one left behind', async () => {
    // Sign out on a shared device, sign in as somebody else, and the first sync used to
    // push whatever the previous person had not managed to upload — into the new
    // account. `resetSyncState` existed for exactly this and had no callers.
    signedIn('first');
    startSyncDriver({ backend: () => backend, intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await enqueue('watches', watch('a'));
    await vi.waitFor(() => expect(backend.snapshot()).toHaveLength(1), { timeout: 3000 });

    // The first person queues one more thing and closes the app before it goes.
    resetSyncDriver();
    await enqueue('watches', watch('b'));

    const second = new MemoryBackend();
    signedIn('second');
    startSyncDriver({ backend: () => second, intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await requestSync();

    expect(second.snapshot()).toHaveLength(0);
  });

  it('keeps the queue when the same person signs back in', async () => {
    signedIn('first');
    startSyncDriver({ backend: () => backend, intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await requestSync();

    resetSyncDriver();
    await enqueue('watches', watch('a'));

    const again = new MemoryBackend();
    signedIn('first');
    startSyncDriver({ backend: () => again, intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await requestSync();

    // Signing out and back in is not a reason to lose a write made in between.
    expect(again.snapshot()).toHaveLength(1);
  });

  it('does not discard a queue built before anyone signed in at all', async () => {
    // The migration's whole flow: import a history offline, then make an account. The
    // rows were queued with no owner recorded, and they belong to whoever signs in.
    await enqueue('watches', watch('a'));

    signedIn('first');
    startSyncDriver({ backend: () => backend, intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStatus().signedIn).toBe(true));
    await requestSync();

    expect(backend.snapshot()).toHaveLength(1);
  });
});
