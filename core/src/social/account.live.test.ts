import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getConfig } from '../config.ts';
import { signIn, signOut } from '../sync/auth.ts';
import { fetchAccountExport } from './exportAccount.ts';
import { restoreAccount } from './restoreAccount.ts';
import { createList, addToList, fetchLists } from './lists.ts';

/**
 * The account half of an export, against a real project.
 *
 * `backendQueries.test.ts` checks every column, table, foreign key and policy these
 * paths name against the migrations, and that catches the failure that is silent — a
 * wrong name produces `{ data: null, error }`, which every read here turns into an
 * empty array indistinguishable from "you have no lists". What it cannot check is
 * behaviour: whether a policy actually lets the rows through, whether PostgREST
 * resolves the embed, whether an insert satisfies its constraints.
 *
 * That is this, and it needs a service key to make and unmake its own user:
 *
 *   SB_SECRET=sb_secret_... npx vitest run src/social/account.live.test.ts
 *
 * It ships unrun. Signing up through the public endpoint is not a substitute — the
 * project rejects disposable addresses and the account could not be cleaned up
 * afterwards, and creating an account nobody can delete on a live project to satisfy
 * a test is not a trade worth making.
 */
const url = getConfig().supabaseUrl;
const pub = getConfig().supabaseAnonKey;
const secret = process.env.SB_SECRET;

const live = url && pub && secret ? describe : describe.skip;

live('the account export, live', () => {
  const stamp = Date.now();
  const email = `account-${stamp}@example.com`;
  const password = 'test-password-123';
  const handle = `acct${stamp}`.slice(0, 28);
  let userId: string;

  const admin = (path: string, init: RequestInit = {}) =>
    fetch(`${url}${path}`, {
      ...init,
      headers: {
        apikey: secret!,
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

  beforeAll(async () => {
    const created = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    }).then((r) => r.json());
    userId = created.id;

    // Through the core's own client, not a second one: `fetchAccountExport` and
    // `restoreAccount` use `getClient()`, and a test that authenticated something else
    // would prove nothing about them.
    await signIn(email, password);
    await admin('/rest/v1/profiles', {
      method: 'POST',
      body: JSON.stringify({ id: userId, handle }),
    });
  }, 30_000);

  afterAll(async () => {
    await signOut().catch(() => {});
    if (!userId) return;
    await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(() => {});
  });

  it('reads back a list with its items, notes and visibility', async () => {
    const id = await createList('Comfort rewatches', false, 'the reliable ones');
    expect(id, 'the list was not created').toBeDefined();
    expect(await addToList(id!, 'tmdb:tv:1396', 'show')).toEqual({ ok: true });
    expect(await addToList(id!, 'tmdb:movie:550', 'film', 'for the ending')).toEqual({ ok: true });

    const account = await fetchAccountExport();

    expect(account?.handle).toBe(handle);
    const list = account?.lists.find((l) => l.name === 'Comfort rewatches');
    // The whole point: a private list is the caller's own, and `lists_select` has to
    // let it through on `user_id = auth.uid()` rather than on `is_public`.
    expect(list, 'a private list did not come back to its owner').toBeDefined();
    expect(list?.description).toBe('the reliable ones');
    expect(list?.isPublic).toBe(false);
    expect(list?.items.map((i) => i.titleId)).toEqual(['tmdb:tv:1396', 'tmdb:movie:550']);
    expect(list?.items[1].note).toBe('for the ending');
  }, 30_000);

  it('restores a list from a bundle, and does not duplicate it on a second run', async () => {
    const bundle = {
      lists: [
        {
          name: `Restored ${stamp}`,
          isPublic: true,
          createdAt: new Date().toISOString(),
          items: [{ titleId: 'tmdb:tv:1399', kind: 'show', addedAt: new Date().toISOString() }],
        },
      ],
      following: [],
      comments: [],
    };

    const first = await restoreAccount(bundle);
    expect(first).toMatchObject({ lists: 1, listItems: 1 });

    const second = await restoreAccount(bundle);
    expect(second.lists, 'a second restore created the list again').toBe(0);
    expect(second.skipped.join(' ')).toMatch(/already here/);

    const names = (await fetchLists()).lists.map((l: { name: string }) => l.name);
    expect(names.filter((n: string) => n === `Restored ${stamp}`)).toHaveLength(1);
  }, 30_000);

  it('comes back empty rather than failing when there is nothing to read', async () => {
    // The shape that matters for anyone with an account and no lists: `account` present
    // and its arrays empty, never `undefined`, which the export reads as "no account".
    const account = await fetchAccountExport();

    expect(account).toBeDefined();
    expect(Array.isArray(account?.following)).toBe(true);
    expect(Array.isArray(account?.comments)).toBe(true);
  }, 30_000);
});
