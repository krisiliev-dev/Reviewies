import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreAccount } from './restoreAccount.ts';
import * as auth from '../sync/auth.ts';
import * as lists from './lists.ts';
import * as people from './people.ts';
import type { AccountExport } from './exportAccount.ts';

/**
 * Putting an export's lists and follows back.
 *
 * The parts that matter are the ones that go wrong quietly: a restore run twice leaving
 * two of everything, an item order that only looks right because nothing raced, and a
 * handle that no longer exists being skipped without anybody being told.
 *
 * The Supabase calls are stubbed at the module boundary rather than at the client,
 * because what is being checked here is the restore's decisions — which list to create,
 * which handle to resolve, what to say about the rest — and not PostgREST's wire format,
 * which supabase.live.test.ts covers against the real thing.
 */
const bundle = (over: Partial<AccountExport> = {}): AccountExport => ({
  lists: [],
  following: [],
  comments: [],
  ...over,
});

let created: Array<{ name: string; isPublic: boolean; description?: string }>;
let added: Array<{ listId: string; titleId: string; note?: string }>;
let followed: string[];

beforeEach(() => {
  created = [];
  added = [];
  followed = [];

  vi.spyOn(auth, 'getSession').mockResolvedValue({ user: { id: 'me' } } as never);
  vi.spyOn(lists, 'fetchLists').mockResolvedValue({ lists: [] });
  vi.spyOn(lists, 'createList').mockImplementation(async (name, isPublic, description) => {
    created.push({ name, isPublic: Boolean(isPublic), description });
    return `list-${created.length}`;
  });
  vi.spyOn(lists, 'addToList').mockImplementation(async (listId, titleId, _kind, note) => {
    added.push({ listId, titleId, note });
    return { ok: true };
  });
  vi.spyOn(people, 'findByHandle').mockImplementation(async (handle) =>
    handle === 'gone' ? {} : { person: { id: `id-${handle}`, handle } },
  );
  vi.spyOn(people, 'follow').mockImplementation(async (id) => {
    followed.push(id);
    return { ok: true };
  });
});

afterEach(() => vi.restoreAllMocks());

const aList = (over = {}) => ({
  name: 'Comfort rewatches',
  isPublic: false,
  createdAt: '2026-01-01T00:00:00Z',
  items: [
    { titleId: 'tmdb:tv:1', kind: 'show', addedAt: '2026-01-01T00:00:00Z' },
    { titleId: 'tmdb:movie:2', kind: 'film', note: 'for the ending', addedAt: '2026-01-02T00:00:00Z' },
  ],
  ...over,
});

describe('restoring what the local import could not', () => {
  it('recreates a list with its description, visibility and item notes', async () => {
    const report = await restoreAccount(
      bundle({ lists: [aList({ isPublic: true, description: 'the reliable ones' })] }),
    );

    expect(created).toEqual([
      { name: 'Comfort rewatches', isPublic: true, description: 'the reliable ones' },
    ]);
    expect(added.map((a) => a.titleId)).toEqual(['tmdb:tv:1', 'tmdb:movie:2']);
    expect(added[1].note).toBe('for the ending');
    expect(report).toMatchObject({ lists: 1, listItems: 2, follows: 0 });
  });

  it('adds items in file order, because nothing else preserves it', async () => {
    // `addToList` sets no rank, so the ordering falls back to `added_at` — which
    // reproduces the original order only if the inserts happen in it. Doing these
    // concurrently would be faster and would shuffle everybody's lists.
    await restoreAccount(
      bundle({
        lists: [
          aList({
            items: ['c', 'a', 'b'].map((id) => ({ titleId: id, kind: 'show', addedAt: 'x' })),
          }),
        ],
      }),
    );

    expect(added.map((a) => a.titleId)).toEqual(['c', 'a', 'b']);
  });

  it('leaves a list that is already here alone', async () => {
    // Running a restore twice must not leave two of everything, and a restored list is
    // a new row with a new ID — the name is the only thing the two copies share.
    vi.spyOn(lists, 'fetchLists').mockResolvedValue({
      lists: [{ id: 'existing', name: 'comfort REWATCHES', isPublic: false, count: 2 }],
    } as never);

    const report = await restoreAccount(bundle({ lists: [aList()] }));

    expect(created).toEqual([]);
    expect(report.lists).toBe(0);
    expect(report.skipped.join(' ')).toMatch(/already here/);
  });

  it('restores nothing when it cannot see what is already there', async () => {
    // The functional half of the failure-as-absence pattern rather than the cosmetic
    // one. `fetchLists` returned a bare array, so a request that never arrived looked
    // exactly like an empty account — and the restore would have made a second copy of
    // every list somebody owns. Doing nothing is recoverable; that is not.
    vi.spyOn(lists, 'fetchLists').mockResolvedValue({ lists: [], failed: 'network' } as never);

    const report = await restoreAccount(bundle({ lists: [aList()] }));

    expect(created).toEqual([]);
    expect(report.lists).toBe(0);
    expect(report.skipped.join(' ')).toMatch(/Could not check what is already here/);
  });

  it('does not create the same list twice from one file', async () => {
    const report = await restoreAccount(bundle({ lists: [aList(), aList()] }));

    expect(created).toHaveLength(1);
    expect(report.lists).toBe(1);
  });

  it('follows by exact handle', async () => {
    const report = await restoreAccount(bundle({ following: ['ana', 'ben'] }));

    expect(followed).toEqual(['id-ana', 'id-ben']);
    expect(report.follows).toBe(2);
  });

  it('names a handle it could not find rather than dropping it', async () => {
    const report = await restoreAccount(bundle({ following: ['gone'] }));

    expect(report.follows).toBe(0);
    expect(report.skipped).toEqual(['@gone could not be found.']);
  });

  it('says a handle could not be looked up, rather than that it does not exist', async () => {
    // Different sentences for different facts: the first sends somebody looking for a
    // deleted account, the second tells them to try again.
    vi.spyOn(people, 'findByHandle').mockResolvedValue({ failed: 'network' });

    const report = await restoreAccount(bundle({ following: ['ana'] }));

    expect(report.follows).toBe(0);
    expect(report.skipped).toEqual(['@ana could not be looked up (network). Try again.']);
  });

  it('reports an item that could not be added, and keeps going', async () => {
    vi.spyOn(lists, 'addToList').mockImplementation(async (_l, titleId) =>
      titleId === 'tmdb:tv:1' ? { ok: false, reason: 'Already on that list.' } : { ok: true },
    );

    const report = await restoreAccount(bundle({ lists: [aList()] }));

    expect(report.listItems).toBe(1);
    expect(report.skipped.join(' ')).toMatch(/tmdb:tv:1 could not be added/);
  });

  it('says comments were kept rather than posted again', async () => {
    // Re-posting them would drop old text into other people's episode threads with
    // today's timestamps. The file keeps them for the person who owns them.
    const report = await restoreAccount(
      bundle({ comments: [{ targetId: 'tmdb:ep:1', body: 'x', createdAt: 'y' }] }),
    );

    expect(report.skipped).toEqual([
      '1 comment(s) were left in the file rather than posted again.',
    ]);
  });

  it('asks for an account rather than failing silently', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue(null);

    const report = await restoreAccount(bundle({ lists: [aList()] }));

    expect(created).toEqual([]);
    expect(report.skipped).toEqual(['Sign in first: lists and follows belong to an account.']);
  });
});
