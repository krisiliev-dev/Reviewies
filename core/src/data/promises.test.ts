import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db.ts';
import { exportAll, importBundle } from './transfer.ts';
import { expireMetadata } from '../metadata/index.ts';
import { METADATA_TTL_MS } from '../domain/types.ts';
import { TABLES } from './adapters/schema.ts';
import * as auth from '../sync/auth.ts';
import { contributeReference, MIN_REFERENCE_MS } from '../fingerprint/references.ts';
import { framesForMs } from '../fingerprint/continuous.ts';

/**
 * The sentences the app says out loud, checked against what it does.
 *
 * Two bugs in two sprints were found by reading a claim rather than the code: "an
 * account adds sync across devices" on a phone that had never synced, and "clearing them
 * never touches your own history" on a button that erased every imported show's name.
 * Both were true when written. Neither had anything holding them true.
 *
 * So the claims that would hurt if they quietly stopped being true live here, quoted, so
 * that changing the behaviour breaks the test rather than the promise.
 */

beforeEach(async () => {
  await Promise.all([
    db.library.clear(),
    db.watches.clear(),
    db.ratings.clear(),
    db.watchlist.clear(),
    db.reactions.clear(),
    db.titles.clear(),
    db.episodes.clear(),
    db.providers.clear(),
    db.outbox.clear(),
  ]);
  vi.restoreAllMocks();
});

describe('"Everything, in full, with no account and no upsell. It is yours."', () => {
  it('carries every table that holds your own data', async () => {
    // Driven off the schema rather than a list written here, because the hole this
    // sentence cannot survive is a table added to the user-data half and not to the
    // export — and a hand-written list would be updated in the same commit that
    // forgot it. The metadata cache is excluded on purpose: it is not ours to
    // redistribute and TMDB's terms forbid it. The outbox and cursor are bookkeeping.
    const NOT_YOURS = ['titles', 'episodes', 'providers', 'animeIds', 'outbox', 'syncState'];
    const yours = TABLES.map((t) => t.name).filter((name) => !NOT_YOURS.includes(name));

    // If this drops to nothing the assertion below passes vacuously.
    expect(yours.length).toBeGreaterThan(4);

    const bundle = await exportAll({ account: async () => undefined });

    for (const table of yours) expect(Object.keys(bundle)).toContain(table);
  });

  it('carries the lists, follows and comments that live on the server', async () => {
    // These existed only in Supabase and were in no export at all, which made "in full"
    // false for the thing a Letterboxd refugee would grieve most.
    const bundle = await exportAll({
      account: async () => ({
        handle: 'someone',
        lists: [
          {
            name: 'Comfort rewatches',
            isPublic: false,
            createdAt: '2026-01-01T00:00:00Z',
            items: [{ titleId: 'tmdb:tv:1', kind: 'show', addedAt: '2026-01-01T00:00:00Z' }],
          },
        ],
        following: ['someone_else'],
        comments: [
          { targetId: 'tmdb:ep:1', body: 'the best one', createdAt: '2026-01-02T00:00:00Z' },
        ],
      }),
    });

    expect(bundle.account?.lists[0].name).toBe('Comfort rewatches');
    expect(bundle.account?.lists[0].items).toHaveLength(1);
    expect(bundle.account?.following).toEqual(['someone_else']);
    expect(bundle.account?.comments[0].body).toBe('the best one');
  });

  it('points at the second step rather than dropping the account half', async () => {
    // The importer's own standard, applied to itself: nothing is silently dropped.
    // Lists and follows go back through `restoreAccount`, which needs an account and a
    // network and so cannot happen inside the local transaction.
    const bundle = await exportAll({
      account: async () => ({
        lists: [{ name: 'A list', isPublic: true, createdAt: 'x', items: [] }],
        following: ['a', 'b'],
        comments: [],
      }),
    });

    const report = await importBundle(bundle);

    expect(report.warnings.join(' ')).toMatch(/1 list\(s\) and 2 follow\(s\)/);
    expect(report.warnings.join(' ')).toMatch(/restore them separately/);
    // Nothing about comments, because this file carries none.
    expect(report.warnings.join(' ')).not.toMatch(/comment/);
  });

  it('needs no account to produce the local half', async () => {
    // "with no account" is the load-bearing half of the sentence. A network failure
    // fetching the account side must not be able to take the export with it.
    await db.watches.put({ id: 'w1', targetId: 'tmdb:ep:1', watchedAt: 1, source: 'manual' });

    const bundle = await exportAll({ account: async () => undefined });

    expect(bundle.watches).toHaveLength(1);
    expect(bundle.account).toBeUndefined();
  });
});

describe('"Artwork and episode listings ... expire automatically"', () => {
  const NOW = Date.UTC(2026, 5, 1);
  const old = NOW - METADATA_TTL_MS - 1;

  it('deletes cached rows past the TTL rather than merely refusing to serve them', async () => {
    // Nothing expired anything before this. `isStale` is checked when a row is read, so
    // a show looked up once and never opened again stayed on the device indefinitely —
    // past the six months TMDB's terms allow.
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'Old', fetchedAt: old });
    await db.episodes.put({
      id: 'tmdb:ep:1',
      seriesId: 'tmdb:tv:1',
      season: 1,
      number: 1,
      name: 'One',
      fetchedAt: old,
    });

    const gone = await expireMetadata(NOW);

    expect(gone).toBe(2);
    expect(await db.titles.count()).toBe(0);
  });

  it('leaves rows that are still inside it', async () => {
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'Fresh', fetchedAt: NOW - 1000 });

    await expireMetadata(NOW);

    expect(await db.titles.count()).toBe(1);
  });

  it('never expires a title an import brought with it', async () => {
    // A placeholder has a fetchedAt like anything else and is not the provider's to
    // expire. Sweeping it would take the name of a show TMDB has never heard of.
    await db.titles.put({
      id: 'local:tv:tvtime-900',
      kind: 'show',
      name: 'Some Obscure Show',
      fetchedAt: old,
    });

    await expireMetadata(NOW);

    expect(await db.titles.count()).toBe(1);
  });
});

describe('"Audio never leaves this device"', () => {
  it('uploads landmark hashes and nothing that could be played back', async () => {
    const rows: Array<Record<string, unknown>> = [];
    vi.spyOn(auth, 'getSession').mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.spyOn(auth, 'getClient').mockReturnValue({
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          rows.push(row);
          return { error: null };
        },
      }),
    } as never);

    await contributeReference({
      targetId: 'tmdb:ep:1',
      hashes: Uint32Array.from([1, 2, 3]),
      // Long enough to clear MIN_REFERENCE_MS: a three-frame recording is now refused
      // before it reaches the network, which is the point of the floor but would make
      // this promise untestable.
      frameCount: framesForMs(MIN_REFERENCE_MS + 1000, 512, 16_000),
      hopSize: 512,
      sampleRate: 16_000,
    });

    expect(rows).toHaveLength(1);
    // Named exhaustively rather than by exclusion: a field added later has to be looked
    // at and added here, which is the moment to ask whether it is audio.
    expect(Object.keys(rows[0]).sort()).toEqual([
      'audio_track',
      'frame_count',
      'hashes',
      'hop_size',
      'sample_rate',
      'target_id',
      'user_id',
    ]);
  });
});

describe('"with no account" is the load-bearing half', () => {
  it('still writes the file when the account half cannot be read', async () => {
    await db.watches.put({ id: 'w1', targetId: 'tmdb:ep:1', watchedAt: 1, source: 'manual' });

    const bundle = await exportAll({
      account: async () => {
        throw new Error('offline');
      },
    });

    expect(bundle.watches).toHaveLength(1);
    // Said rather than swallowed: a signed-in person would otherwise get a file that
    // looks complete and is missing their lists.
    expect(bundle.accountUnavailable).toBe('offline');
  });
});
