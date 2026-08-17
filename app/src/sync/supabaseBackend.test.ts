import { describe, expect, it } from 'vitest';
import { SupabaseBackend } from './supabaseBackend';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Change } from './types';

/**
 * The mapping layer between local camelCase records and the database's snake_case
 * columns, plus error classification.
 *
 * These are the parts that can be checked without a live project. The network
 * behaviour itself is unverified until pointed at a real Supabase instance.
 */

const USER = '11111111-1111-1111-1111-111111111111';

/** Minimal fake recording what would have been sent. */
function fakeClient(opts: { error?: { message: string; code?: string }; rows?: unknown[] } = {}) {
  const captured: Array<{ table: string; rows: Record<string, unknown>[] }> = [];

  const builder = {
    upsert(rows: Record<string, unknown>[]) {
      captured[captured.length - 1].rows = rows;
      return Promise.resolve({ error: opts.error ?? null });
    },
    select() {
      return builder;
    },
    gt() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return Promise.resolve({ data: opts.rows ?? [], error: opts.error ?? null });
    },
  };

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from(table: string) {
      captured.push({ table, rows: [] });
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, captured };
}

const change = (over: Partial<Change> = {}): Change => ({
  pk: 'w1',
  table: 'watches',
  row: { id: 'w1', targetId: 'tmdb:ep:1', seriesId: 'tmdb:tv:1', watchedAt: 1_700_000_000_000, source: 'manual' },
  updatedAt: 1_700_000_000_000,
  deleted: false,
  ...over,
});

describe('column mapping on push', () => {
  it('converts camelCase fields to snake_case columns', async () => {
    const { client, captured } = fakeClient();
    await new SupabaseBackend(client).push([change()]);

    const row = captured[0].rows[0];
    expect(row).toMatchObject({ id: 'w1', target_id: 'tmdb:ep:1', series_id: 'tmdb:tv:1' });
    expect(row).not.toHaveProperty('targetId');
  });

  it('converts epoch milliseconds to ISO timestamps', async () => {
    const { client, captured } = fakeClient();
    await new SupabaseBackend(client).push([change()]);
    expect(captured[0].rows[0].watched_at).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('stamps the authenticated user, so rows cannot be attributed elsewhere', async () => {
    const { client, captured } = fakeClient();
    await new SupabaseBackend(client).push([change()]);
    expect(captured[0].rows[0].user_id).toBe(USER);
  });

  it('carries the tombstone flag', async () => {
    const { client, captured } = fakeClient();
    await new SupabaseBackend(client).push([change({ deleted: true })]);
    expect(captured[0].rows[0].deleted).toBe(true);
  });

  it('groups changes by table into one request each', async () => {
    const { client, captured } = fakeClient();
    await new SupabaseBackend(client).push([
      change(),
      change({ pk: 'w2', row: { id: 'w2', targetId: 'x', watchedAt: 1 } }),
      change({ table: 'watchlist', pk: 't1', row: { titleId: 't1', kind: 'show', addedAt: 1 } }),
    ]);

    expect(captured).toHaveLength(2);
    expect(captured.find((c) => c.table === 'watches')?.rows).toHaveLength(2);
  });

  it('drops unknown fields rather than sending columns that do not exist', async () => {
    const { client, captured } = fakeClient();
    await new SupabaseBackend(client).push([
      change({ row: { id: 'w1', targetId: 'x', watchedAt: 1, bogusField: 'nope' } }),
    ]);
    expect(captured[0].rows[0]).not.toHaveProperty('bogusField');
  });
});

describe('column mapping on pull', () => {
  it('converts snake_case columns back to camelCase and parses timestamps', async () => {
    const { client } = fakeClient({
      rows: [
        {
          id: 'w1',
          target_id: 'tmdb:ep:1',
          series_id: 'tmdb:tv:1',
          watched_at: '2026-01-05T20:00:00.000Z',
          updated_at: '2026-01-05T20:00:00.000Z',
          deleted: false,
        },
      ],
    });

    const { changes } = await new SupabaseBackend(client).pull(0);
    const watch = changes.find((c) => c.table === 'watches');
    expect(watch?.row).toMatchObject({ targetId: 'tmdb:ep:1', seriesId: 'tmdb:tv:1' });
    expect(watch?.row.watchedAt).toBe(Date.parse('2026-01-05T20:00:00.000Z'));
  });

  it('advances the cursor to the newest row seen', async () => {
    const { client } = fakeClient({
      rows: [{ id: 'w1', updated_at: '2026-03-01T00:00:00.000Z', deleted: false }],
    });
    const { cursor } = await new SupabaseBackend(client).pull(0);
    expect(cursor).toBe(Date.parse('2026-03-01T00:00:00.000Z'));
  });

  it('excludes user_id from the primary key, since it is implied by the session', async () => {
    const { client } = fakeClient({
      rows: [{ user_id: USER, title_id: 'tmdb:tv:9', updated_at: '2026-01-01T00:00:00.000Z' }],
    });
    const { changes } = await new SupabaseBackend(client).pull(0);
    const wl = changes.find((c) => c.table === 'watchlist');
    expect(wl?.pk).toBe('tmdb:tv:9');
  });
});

describe('error classification', () => {
  it('treats an RLS refusal as permanent, so it cannot block the queue forever', async () => {
    const { client } = fakeClient({ error: { message: 'permission denied', code: '42501' } });
    await expect(new SupabaseBackend(client).push([change()])).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('treats a check-constraint violation as permanent', async () => {
    const { client } = fakeClient({ error: { message: 'violates check', code: '23514' } });
    await expect(new SupabaseBackend(client).push([change()])).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('treats an unknown or network error as retryable', async () => {
    const { client } = fakeClient({ error: { message: 'connection reset' } });
    await expect(new SupabaseBackend(client).push([change()])).rejects.toMatchObject({
      retryable: true,
    });
  });

  it('treats being signed out as permanent rather than retrying forever', async () => {
    const client = {
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    } as unknown as SupabaseClient;

    await expect(new SupabaseBackend(client).push([change()])).rejects.toMatchObject({
      retryable: false,
      message: 'Not signed in',
    });
  });
});
