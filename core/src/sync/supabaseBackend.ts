import { type SupabaseClient } from '@supabase/supabase-js';
import { getClient } from './auth.ts';
import { type Change, type PullResult, type SyncBackend, SyncError, type SyncTable } from './types.ts';

/**
 * Supabase implementation of the sync contract.
 *
 * Only the project URL and the anon (publishable) key are used. The anon key is
 * designed to be public and ships in the client bundle — it is safe there precisely
 * because row-level security decides what it can reach. The service-role key must
 * never appear in this codebase: it bypasses RLS entirely.
 *
 * ⚠️ Unverified against a live project. The engine in ./engine.ts is fully tested
 * against a simulated server; this adapter is the thin translation layer and needs a
 * real project to confirm.
 */

/**
 * Local camelCase to the database's snake_case, per table.
 *
 * Exported for one test, which checks it against the migration SQL. A column missing
 * from here is not an error anywhere — `toRemote` skips what it does not know — so the
 * field simply never leaves the device, and the only place that shows is a second one.
 */
export const COLUMN_MAP: Record<SyncTable, Record<string, string>> = {
  watches: {
    id: 'id',
    targetId: 'target_id',
    seriesId: 'series_id',
    watchedAt: 'watched_at',
    runtimeMin: 'runtime_min',
    source: 'source',
  },
  ratings: { targetId: 'target_id', value: 'value', ratedAt: 'rated_at' },
  watchlist: { titleId: 'title_id', kind: 'kind', note: 'note', addedAt: 'added_at' },
  library: {
    titleId: 'title_id',
    kind: 'kind',
    status: 'status',
    posterOverride: 'poster_override',
    ordering: 'ordering',
    addedAt: 'added_at',
  },
  reactions: { id: 'id', targetId: 'target_id', tMs: 't_ms', emoji: 'emoji', createdAt: 'created_at' },
};

/** Columns holding epoch milliseconds locally and timestamptz remotely. */
const TIMESTAMP_COLUMNS = new Set(['watched_at', 'rated_at', 'added_at', 'created_at']);

export function toRemote(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const map = COLUMN_MAP[table];
  const out: Record<string, unknown> = {};

  for (const [local, remote] of Object.entries(map)) {
    if (!(local in row)) continue;
    const value = row[local];
    out[remote] =
      TIMESTAMP_COLUMNS.has(remote) && typeof value === 'number'
        ? new Date(value).toISOString()
        : value;
  }
  return out;
}

export function fromRemote(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const map = COLUMN_MAP[table];
  const out: Record<string, unknown> = {};

  for (const [local, remote] of Object.entries(map)) {
    if (!(remote in row)) continue;
    const value = row[remote];
    out[local] =
      TIMESTAMP_COLUMNS.has(remote) && typeof value === 'string' ? Date.parse(value) : value;
  }
  return out;
}

const PK_COLUMN: Record<SyncTable, string[]> = {
  watches: ['id'],
  reactions: ['id'],
  ratings: ['user_id', 'target_id'],
  watchlist: ['user_id', 'title_id'],
  library: ['user_id', 'title_id'],
};

/** How many rows one pull asks each table for. Exposed so tests can reach the boundary. */
export const DEFAULT_PAGE_SIZE = 1000;

/**
 * A ceiling on requests per table, so a server that never returns a short page cannot
 * spin forever. Reaching it raises rather than truncating: silently returning part of
 * someone's history is the failure this whole paging scheme exists to prevent.
 */
const MAX_PAGES = 1000;

/**
 * The column that breaks ties between rows sharing a timestamp.
 *
 * `user_id` is dropped because every row in a pull already belongs to one user, so it
 * is constant and orders nothing.
 */
function tieBreaker(table: SyncTable): string {
  return PK_COLUMN[table].filter((column) => column !== 'user_id')[0];
}

export class SupabaseBackend implements SyncBackend {
  readonly name = 'supabase';
  private readonly client: SupabaseClient;
  private readonly pageSize: number;

  constructor(client: SupabaseClient, options: { pageSize?: number } = {}) {
    this.client = client;
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  /**
   * The backend the running app actually uses.
   *
   * It used to call `createClient` itself, and that was the whole bug. `sync/auth.ts`
   * keeps the session under its own `storageKey` — and on a phone in AsyncStorage,
   * which a default client cannot reach at all — so this second client had **never seen
   * a session on either platform**. Every sync therefore raised *Not signed in*, and
   * because that was classified non-retryable the engine deleted the whole batch from
   * the outbox: everything written offline, dropped, silently, on the first attempt.
   *
   * Nothing caught it because nothing has ever called this. `supabaseBackend.test.ts`
   * and `supabase.live.test.ts` both construct `new SupabaseBackend(client)` with a
   * client they signed in themselves, so the tested path and the shipped path were not
   * the same path. §6.67; the guard is in `app/src/wiring/`.
   */
  static fromEnv(): SupabaseBackend | undefined {
    const client = getClient();
    if (!client) return undefined;
    return new SupabaseBackend(client);
  }

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    /**
     * Retryable, and the distinction matters more than it looks.
     *
     * The engine deletes a batch from the outbox when a push fails permanently, which
     * is right for a row the server will never accept — a constraint violation is not
     * going to start passing. It is wrong for a failure about the *request*: a session
     * that expired mid-sync, or a driver and a backend that disagree about who is
     * signed in, would take somebody's queued history with it. The driver refuses to
     * sync while signed out, so this cannot spin. §6.67.
     */
    if (error || !data.user) throw new SyncError('Not signed in', true);
    return data.user.id;
  }

  async push(changes: Change[]): Promise<void> {
    const userId = await this.userId();

    // Group by table so each becomes one round trip rather than one per row.
    const byTable = new Map<SyncTable, Change[]>();
    for (const change of changes) {
      const list = byTable.get(change.table) ?? [];
      list.push(change);
      byTable.set(change.table, list);
    }

    for (const [table, group] of byTable) {
      const rows = group.map((change) => ({
        ...toRemote(table, change.row),
        user_id: userId,
        updated_at: new Date(change.updatedAt).toISOString(),
        deleted: change.deleted,
      }));

      // Upsert keyed on the primary key makes a repeated push idempotent, which
      // matters when a response is lost and the engine retries.
      const { error } = await this.client
        .from(table)
        .upsert(rows, { onConflict: PK_COLUMN[table].join(','), ignoreDuplicates: false });

      if (error) throw classify(error);
    }
  }

  /**
   * Fetch everything changed since `cursor`, draining every table completely.
   *
   * Draining matters, and one page per table used to be the whole of it. The returned
   * cursor is the newest timestamp seen *anywhere*, so a table that filled its page
   * while another table happened to hold a later row had the cursor stepped straight
   * over its remainder — gone, silently, permanently. Rescuing a TV Time library writes
   * thousands of watches at once, so "one table with far more than a page of changes"
   * is the ordinary first sync for exactly the person this app was built for.
   *
   * Paging is by keyset — the last row's `(synced_at, id)` — rather than by offset or
   * by timestamp alone. Postgres stamps every row written in one transaction with the
   * same `now()`, so a bulk import gives thousands of rows an identical `synced_at`. A
   * cursor that is only a timestamp cannot say where inside that group it stopped:
   * `gt` loses the rest of the group and `gte` never advances past it.
   *
   * `synced_at`, not `updated_at`, since §6.67 and migration 0014. `updated_at` is
   * whatever clock the writing device had; `synced_at` is when this server learned of
   * the row. Ordering a cursor by the first meant one device a week fast pushed every
   * other device's cursor a week into the future — after which they received nothing at
   * all — and one a week slow pushed rows that every cursor had already passed, so the
   * row arrived and nobody ever saw it. Conflict resolution still reads `updated_at`,
   * which is the one thing it is good for: which of two offline edits the person made
   * second.
   *
   * The external cursor stays a single timestamp, which is safe only because every
   * table is fully drained before it moves. It does mean a first sync after a large
   * import assembles the whole backlog in memory — the same data the local import
   * already held, so it is affordable, but it is a real cost and not an oversight.
   */
  async pull(cursor: number): Promise<PullResult> {
    const since = new Date(cursor).toISOString();
    const changes: Change[] = [];
    let newest = cursor;

    for (const table of Object.keys(COLUMN_MAP) as SyncTable[]) {
      const tie = tieBreaker(table);
      let lastAt = since;
      let lastTie: string | undefined;

      for (let page = 0; ; page++) {
        if (page >= MAX_PAGES) {
          throw new SyncError(`Too many pages of ${table} to pull in one go`, true);
        }

        const filtered =
          lastTie === undefined
            ? this.client.from(table).select('*').gt('synced_at', lastAt)
            : this.client
                .from(table)
                .select('*')
                // Everything strictly later, plus the remainder of the timestamp we
                // stopped inside. Quoted because an id is arbitrary text and a bare
                // comma would be read as another filter.
                .or(
                  `synced_at.gt.${lastAt},and(synced_at.eq.${lastAt},${tie}.gt."${lastTie}")`,
                );

        const { data, error } = await filtered
          .order('synced_at', { ascending: true })
          .order(tie, { ascending: true })
          .limit(this.pageSize);

        if (error) throw classify(error);
        const rows = (data ?? []) as Record<string, unknown>[];

        for (const record of rows) {
          // Two clocks, two jobs. The cursor advances on the server's; the change
          // carries the device's, because that is what settles a conflict.
          newest = Math.max(newest, Date.parse(String(record.synced_at)));
          const updatedAt = Date.parse(String(record.updated_at));

          changes.push({
            table,
            pk: PK_COLUMN[table]
              .filter((c) => c !== 'user_id')
              .map((c) => String(record[c]))
              .join('|'),
            row: fromRemote(table, record),
            updatedAt,
            deleted: Boolean(record.deleted),
          });
        }

        // A short page means the table is caught up. Anything else and there is more.
        if (rows.length < this.pageSize) break;

        const last = rows[rows.length - 1];
        lastAt = String(last.synced_at);
        lastTie = String(last[tie]);
      }
    }

    return { changes, cursor: newest };
  }
}

/**
 * Decide whether a failure is worth retrying.
 *
 * Getting this wrong in either direction is costly: retrying a permanent rejection
 * blocks the queue forever, and giving up on a transient one loses the change.
 */
function classify(error: { message: string; code?: string }): SyncError {
  const permanent = new Set([
    '42501', // insufficient privilege — an RLS policy refused the write
    '23514', // check constraint violation
    '23503', // foreign key violation
    '22P02', // malformed input
  ]);
  const retryable = !error.code || !permanent.has(error.code);
  return new SyncError(`${error.code ?? 'error'}: ${error.message}`, retryable);
}
