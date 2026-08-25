import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseBackend } from './supabaseBackend';
import type { Change } from './types';

/**
 * Live round-trip of the real sync adapter against a real Supabase project.
 *
 * Skipped unless credentials are supplied, so CI and contributors are unaffected:
 *
 *   SB_SECRET=sb_secret_... npx vitest run src/sync/supabase.live.test.ts
 *
 * This is the piece unit tests cannot cover — real PostgREST, real JWTs, real
 * row-level security deciding what comes back.
 */

const url = getConfig().supabaseUrl;
const pub = getConfig().supabaseAnonKey;
const secret = process.env.SB_SECRET;

const live = url && pub && secret ? describe : describe.skip;

live('Supabase sync adapter (live)', () => {
  const email = `sync-${Date.now()}@example.com`;
  const password = 'test-password-123';
  let backend: SupabaseBackend;
  let userId: string;

  beforeAll(async () => {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: secret!, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    }).then((r) => r.json());
    userId = created.id;

    const client = createClient(url!, pub!);
    await client.auth.signInWithPassword({ email, password });
    await client.from('profiles').insert({ id: userId, handle: `sync${Date.now()}`.slice(0, 28) });
    backend = new SupabaseBackend(client);
  }, 30_000);

  afterAll(async () => {
    if (!userId) return;
    await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: secret!, Authorization: `Bearer ${secret}` },
    }).catch(() => {});
  });

  it('pushes a watch and pulls it back with fields intact', async () => {
    const watchedAt = Date.now();
    const change: Change = {
      pk: crypto.randomUUID(),
      table: 'watches',
      row: {
        id: crypto.randomUUID(),
        targetId: 'tmdb:ep:62085',
        seriesId: 'tmdb:tv:1396',
        watchedAt,
        runtimeMin: 47,
        source: 'manual',
      },
      updatedAt: watchedAt,
      deleted: false,
    };

    await backend.push([change]);

    const { changes } = await backend.pull(0);
    const found = changes.find((c) => c.table === 'watches' && c.row.id === change.row.id);

    expect(found).toBeDefined();
    // Column mapping and timestamp conversion both survive the round trip.
    expect(found?.row.targetId).toBe('tmdb:ep:62085');
    expect(found?.row.seriesId).toBe('tmdb:tv:1396');
    expect(found?.row.runtimeMin).toBe(47);
    expect(Math.abs((found?.row.watchedAt as number) - watchedAt)).toBeLessThan(1000);
  }, 30_000);

  it('is idempotent — pushing the same change twice does not duplicate', async () => {
    const id = crypto.randomUUID();
    const change: Change = {
      pk: id,
      table: 'watchlist',
      row: { titleId: `tmdb:tv:${id.slice(0, 8)}`, kind: 'show', note: 'first', addedAt: Date.now() },
      updatedAt: Date.now(),
      deleted: false,
    };

    await backend.push([change]);
    await backend.push([change]);

    const { changes } = await backend.pull(0);
    const matches = changes.filter(
      (c) => c.table === 'watchlist' && c.row.titleId === change.row.titleId,
    );
    expect(matches).toHaveLength(1);
  }, 30_000);

  it('advances the cursor so a second pull returns nothing new', async () => {
    const first = await backend.pull(0);
    const second = await backend.pull(first.cursor);
    expect(second.changes).toHaveLength(0);
  }, 30_000);

  it('replicates a delete as a tombstone rather than losing it silently', async () => {
    const id = crypto.randomUUID();
    const row = { id, targetId: 'tmdb:ep:1', watchedAt: Date.now(), source: 'manual' };

    await backend.push([{ pk: id, table: 'watches', row, updatedAt: Date.now(), deleted: false }]);
    await backend.push([{ pk: id, table: 'watches', row, updatedAt: Date.now() + 1, deleted: true }]);

    const { changes } = await backend.pull(0);
    const found = changes.find((c) => c.table === 'watches' && c.row.id === id);
    expect(found?.deleted).toBe(true);
  }, 30_000);

  /**
   * Every table, not just the two that happened to be covered.
   *
   * `library` had never been pushed by the app at all — nothing that changed a library
   * row queued until recently — so its columns, its policy and the adapter's mapping for
   * it were entirely unproven against the real thing. `ratings` and `reactions` were
   * only ever exercised locally. A column silently dropped in the mapping looks like
   * nothing at all on one device.
   */
  it.each([
    [
      'library',
      () => ({
        titleId: `tmdb:tv:${crypto.randomUUID().slice(0, 8)}`,
        kind: 'show',
        status: 'watching',
        // The two fields most likely to be missing from a mapping: one optional, one
        // constrained by a check the database will enforce and nothing local will.
        posterOverride: 'https://example.test/p.jpg',
        ordering: 'absolute',
        addedAt: Date.now(),
      }),
      'titleId',
    ],
    [
      'ratings',
      () => ({
        targetId: `tmdb:tv:${crypto.randomUUID().slice(0, 8)}`,
        value: 4.5,
        ratedAt: Date.now(),
      }),
      'targetId',
    ],
    [
      'reactions',
      () => ({
        id: crypto.randomUUID(),
        targetId: `tmdb:ep:${crypto.randomUUID().slice(0, 8)}`,
        tMs: 61_000,
        emoji: '😂',
        createdAt: Date.now(),
      }),
      'id',
    ],
    [
      'watchlist',
      () => ({
        titleId: `tmdb:tv:${crypto.randomUUID().slice(0, 8)}`,
        kind: 'film',
        // Absent on purpose: an optional column has to survive being omitted as well as
        // being present.
        addedAt: Date.now(),
      }),
      'titleId',
    ],
    [
      'watches',
      () => ({
        id: crypto.randomUUID(),
        targetId: `tmdb:movie:${crypto.randomUUID().slice(0, 8)}`,
        // No seriesId: a film has none, and a mapping that assumes one would fail here
        // and nowhere else.
        watchedAt: Date.now(),
        source: 'import',
      }),
      'id',
    ],
  ] as const)('round-trips a %s row, then retires it', async (table, make, key) => {
    const row = make() as Record<string, unknown>;
    const pk = String(row[key]);

    await backend.push([{ pk, table, row, updatedAt: Date.now(), deleted: false }]);

    const { changes } = await backend.pull(0);
    const found = changes.find((c) => c.table === table && c.row[key] === row[key]);
    expect(found, `${table} did not come back`).toBeDefined();

    // Every field that went in comes back. Not a subset — a mapping that drops a column
    // is invisible locally and permanent once somebody has relied on it.
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === 'number' && field.endsWith('At')) {
        expect(Math.abs((found!.row[field] as number) - value), field).toBeLessThan(1000);
      } else {
        expect(found!.row[field], `${table}.${field}`).toEqual(value);
      }
    }

    // And a delete sticks rather than the row returning on the next pull.
    await backend.push([{ pk, table, row, updatedAt: Date.now() + 1, deleted: true }]);
    const after = await backend.pull(0);
    expect(after.changes.find((c) => c.table === table && c.row[key] === row[key])?.deleted).toBe(
      true,
    );
  }, 45_000);

  it('refuses to push when not signed in, without retrying forever', async () => {
    const other = crypto.randomUUID();
    // persistSession:false matters — otherwise this client picks up the session
    // the earlier client stored under the same key and would appear signed in.
    const client = createClient(url!, pub!, { auth: { persistSession: false } });
    const anonBackend = new SupabaseBackend(client);

    await expect(
      anonBackend.push([
        {
          pk: other,
          table: 'watches',
          row: { id: other, targetId: 'x', watchedAt: Date.now() },
          updatedAt: Date.now(),
          deleted: false,
        },
      ]),
    ).rejects.toMatchObject({ retryable: false });
  }, 30_000);
});
