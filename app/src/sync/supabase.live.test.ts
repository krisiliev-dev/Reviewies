import { createClient } from '@supabase/supabase-js';
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

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const pub = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
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
