import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Change, type PullResult, type SyncBackend, SyncError, type SyncTable } from './types';

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

/** Local camelCase to the database's snake_case, per table. */
const COLUMN_MAP: Record<SyncTable, Record<string, string>> = {
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

function toRemote(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
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

function fromRemote(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
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

export class SupabaseBackend implements SyncBackend {
  readonly name = 'supabase';
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  static fromEnv(): SupabaseBackend | undefined {
    const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return undefined;
    return new SupabaseBackend(createClient(url, key));
  }

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    // Not being signed in is not retryable — retrying would spin forever.
    if (error || !data.user) throw new SyncError('Not signed in', false);
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

  async pull(cursor: number): Promise<PullResult> {
    const since = new Date(cursor).toISOString();
    const changes: Change[] = [];
    let newest = cursor;

    for (const table of Object.keys(COLUMN_MAP) as SyncTable[]) {
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(1000);

      if (error) throw classify(error);

      for (const row of data ?? []) {
        const record = row as Record<string, unknown>;
        const updatedAt = Date.parse(String(record.updated_at));
        newest = Math.max(newest, updatedAt);

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
