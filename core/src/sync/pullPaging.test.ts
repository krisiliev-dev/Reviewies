import { describe, expect, it } from 'vitest';
import { SupabaseBackend } from './supabaseBackend.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncTable } from './types.ts';

/**
 * What happens when there is more to pull than one page holds.
 *
 * The existing fake answers every query with the same fixed array and ignores `gt`,
 * `order` and `limit` entirely, so no test could ever reach the page boundary — which
 * is the only place the cursor arithmetic can go wrong. This one is a small server: it
 * stores rows per table, filters by the cursor, sorts, and truncates.
 *
 * The scenario that matters is not exotic. Rescuing a TV Time library writes thousands
 * of watches at once, and Postgres stamps every row in a transaction with the same
 * `now()` — so "one table with far more than a page of changes, all sharing a
 * timestamp" is the *ordinary* first sync for the exact user this app was built for.
 */

const USER = '11111111-1111-1111-1111-111111111111';

interface Stored {
  updated_at: string;
  [column: string]: unknown;
}

/**
 * A fake that behaves like the query it is standing in for.
 *
 * It has to honour `gt`, `or`, both `order` calls and `limit`, because the boundary
 * they define is the only place the paging can go wrong. A fake that ignores them —
 * which is what the existing one in `supabaseBackend.test.ts` does — makes every test
 * here pass without exercising anything, and this file was written twice for exactly
 * that reason: the first version passed against a backend that did not yet take a page
 * size, so nothing was ever truncated.
 */
function fakeServer(tables: Partial<Record<SyncTable, Stored[]>>) {
  const queries: Array<{ table: string; limit: number }> = [];

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from(table: string) {
      let keep: (row: Stored) => boolean = () => true;
      const order: string[] = [];

      const builder = {
        select: () => builder,
        gt: (column: string, value: string) => {
          keep = (row) => String(row[column]) > value;
          return builder;
        },
        /** Only the one shape this backend builds: later, or the rest of one instant. */
        or: (filter: string) => {
          const match =
            /^updated_at\.gt\.(.+),and\(updated_at\.eq\.(.+),([a-z_]+)\.gt\."(.*)"\)$/.exec(
              filter,
            );
          if (!match) throw new Error(`fake cannot read this filter: ${filter}`);
          const [, after, at, tie, tieAfter] = match;
          keep = (row) =>
            row.updated_at > after || (row.updated_at === at && String(row[tie]) > tieAfter);
          return builder;
        },
        order: (column: string) => {
          order.push(column);
          return builder;
        },
        limit: (n: number) => {
          queries.push({ table, limit: n });
          const rows = (tables[table as SyncTable] ?? [])
            .filter(keep)
            .sort((a, b) => {
              for (const column of order) {
                const cmp = String(a[column]).localeCompare(String(b[column]));
                if (cmp !== 0) return cmp;
              }
              return 0;
            })
            .slice(0, n);
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, queries };
}

/** `count` watches, stamped `ms` apart from `startMs`. Zero means all in one instant. */
function watches(count: number, startMs: number, ms = 1): Stored[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w${i}`,
    target_id: `tmdb:ep:${i}`,
    series_id: 'tmdb:tv:1',
    watched_at: startMs,
    source: 'manual',
    deleted: false,
    updated_at: new Date(startMs + i * ms).toISOString(),
  }));
}

/** Drain the backend the way a client would: pull until it stops finding anything. */
async function drain(backend: SupabaseBackend, rounds = 50) {
  const seen = new Set<string>();
  let cursor = 0;

  for (let i = 0; i < rounds; i++) {
    const result = await backend.pull(cursor);
    for (const change of result.changes) seen.add(`${change.table}/${change.pk}`);
    if (result.cursor === cursor) break;
    cursor = result.cursor;
  }
  return seen;
}

describe('pulling more than one page', () => {
  it('does not skip a table that filled its page because another table had later rows', async () => {
    // The failure this exists to catch. `watches` has three pages of history; `ratings`
    // has one row, stamped later than any of it. Taking the newest timestamp across all
    // tables as the next cursor steps straight over everything in `watches` that did
    // not fit — silently, permanently, on somebody's first sync after an import.
    const { client } = fakeServer({
      watches: watches(250, 1_700_000_000_000),
      ratings: [
        {
          target_id: 'tmdb:tv:9',
          value: 5,
          rated_at: 1_800_000_000_000,
          deleted: false,
          updated_at: new Date(1_800_000_000_000).toISOString(),
        },
      ],
    });

    const seen = await drain(new SupabaseBackend(client, { pageSize: 100 }));

    expect(seen.size).toBe(251);
    expect(seen.has('watches/w249')).toBe(true);
    expect(seen.has('ratings/tmdb:tv:9')).toBe(true);
  });

  it('gets through a backlog several pages deep', async () => {
    const { client } = fakeServer({ watches: watches(430, 1_700_000_000_000) });
    const seen = await drain(new SupabaseBackend(client, { pageSize: 100 }));
    expect(seen.size).toBe(430);
  });

  it('gets through rows that all share one timestamp', async () => {
    // A bulk import writes in a single transaction, and Postgres gives every row in a
    // transaction the same `now()`. A cursor that is only a timestamp cannot separate
    // them, so `gt(cursor)` either loses the rest of the group or never advances.
    const { client } = fakeServer({ watches: watches(250, 1_700_000_000_000, 0) });
    const seen = await drain(new SupabaseBackend(client, { pageSize: 100 }));
    expect(seen.size).toBe(250);
  });

  it('stops asking once it has caught up', async () => {
    const { client, queries } = fakeServer({ watches: watches(30, 1_700_000_000_000) });
    const backend = new SupabaseBackend(client, { pageSize: 100 });

    const first = await backend.pull(0);
    expect(first.changes).toHaveLength(30);

    const before = queries.length;
    const second = await backend.pull(first.cursor);
    expect(second.changes).toHaveLength(0);
    // It still asks — that is the point of a sync — but finds nothing and does not
    // wind the cursor backwards.
    expect(queries.length).toBeGreaterThan(before);
    expect(second.cursor).toBe(first.cursor);
  });

  it('asks for the real page size by default', async () => {
    // The tests above shrink the page so the boundary is reachable at all. This one
    // exists so that shrinking it cannot quietly become the production value.
    const { client, queries } = fakeServer({ watches: watches(3, 1_700_000_000_000) });
    await new SupabaseBackend(client).pull(0);
    expect(queries.every((q) => q.limit === 1000)).toBe(true);
  });
});
