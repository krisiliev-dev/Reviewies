import Dexie, { type EntityTable } from 'dexie';
import { db } from '../data/db';
import { type Change, type SyncBackend, SyncError, type SyncTable } from './types';

/**
 * Offline-first sync engine.
 *
 * Local writes go to IndexedDB and to an outbox in the same transaction. The outbox
 * drains when the network allows. If it never drains, nothing is lost — the data is
 * already on the device, which is the whole point of the architecture.
 */

export interface OutboxEntry {
  /** `table:pk` — one pending entry per row, so repeated edits coalesce. */
  key: string;
  table: SyncTable;
  pk: string;
  row: Record<string, unknown>;
  updatedAt: number;
  deleted: boolean;
  attempts: number;
}

export interface SyncMeta {
  key: string;
  value: number;
}

class SyncDB extends Dexie {
  outbox!: EntityTable<OutboxEntry, 'key'>;
  meta!: EntityTable<SyncMeta, 'key'>;

  constructor(name = 'reviewies-sync') {
    super(name);
    this.version(1).stores({ outbox: 'key, table, updatedAt', meta: 'key' });
  }
}

export const syncDb = new SyncDB();

const PK_FIELDS: Record<SyncTable, string[]> = {
  watches: ['id'],
  reactions: ['id'],
  ratings: ['targetId'],
  watchlist: ['titleId'],
  library: ['titleId'],
};

export function primaryKeyOf(table: SyncTable, row: Record<string, unknown>): string {
  return PK_FIELDS[table].map((f) => String(row[f])).join('|');
}

/**
 * Queue a local change for upload.
 *
 * Coalescing on `table:pk` means a row edited five times offline uploads once, with
 * its final value — the intermediate states have no meaning to anyone else.
 */
export async function enqueue(
  table: SyncTable,
  row: Record<string, unknown>,
  opts: { deleted?: boolean; updatedAt?: number } = {},
): Promise<void> {
  const pk = primaryKeyOf(table, row);
  const updatedAt = opts.updatedAt ?? Date.now();
  const key = `${table}:${pk}`;

  const existing = await syncDb.outbox.get(key);
  // A stale write must not overwrite a newer one already waiting to go out.
  if (existing && existing.updatedAt > updatedAt) return;

  await syncDb.outbox.put({
    key,
    table,
    pk,
    row,
    updatedAt,
    deleted: opts.deleted ?? false,
    attempts: existing?.attempts ?? 0,
  });
}

export async function pendingCount(): Promise<number> {
  return syncDb.outbox.count();
}

async function getCursor(): Promise<number> {
  return (await syncDb.meta.get('cursor'))?.value ?? 0;
}

async function setCursor(value: number): Promise<void> {
  await syncDb.meta.put({ key: 'cursor', value });
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Remote rows discarded because the local copy was newer. */
  conflictsResolvedLocally: number;
  error?: string;
}

/**
 * One full sync cycle: push local changes, then pull remote ones.
 *
 * Push happens first so that our own changes are already on the server when we pull,
 * which keeps last-write-wins from resurrecting data we just deleted.
 */
export async function syncOnce(backend: SyncBackend, batchSize = 200): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflictsResolvedLocally: 0 };

  // --- Push ---------------------------------------------------------------
  const batch = await syncDb.outbox.orderBy('updatedAt').limit(batchSize).toArray();
  if (batch.length > 0) {
    const changes: Change[] = batch.map((e) => ({
      pk: e.pk,
      table: e.table,
      row: e.row,
      updatedAt: e.updatedAt,
      deleted: e.deleted,
    }));

    try {
      await backend.push(changes);
      // Only clear entries that have not been superseded while the request was in
      // flight — otherwise an edit made mid-push would be silently dropped.
      await syncDb.transaction('rw', syncDb.outbox, async () => {
        for (const entry of batch) {
          const current = await syncDb.outbox.get(entry.key);
          if (current && current.updatedAt === entry.updatedAt) {
            await syncDb.outbox.delete(entry.key);
          }
        }
      });
      result.pushed = batch.length;
    } catch (e) {
      const retryable = !(e instanceof SyncError) || e.retryable;
      await syncDb.transaction('rw', syncDb.outbox, async () => {
        for (const entry of batch) {
          const current = await syncDb.outbox.get(entry.key);
          if (!current) continue;
          // Non-retryable failures are dropped rather than blocking the queue
          // forever; retryable ones stay put and are counted.
          if (retryable) await syncDb.outbox.update(entry.key, { attempts: current.attempts + 1 });
          else await syncDb.outbox.delete(entry.key);
        }
      });
      result.error = e instanceof Error ? e.message : String(e);
      return result;
    }
  }

  // --- Pull ---------------------------------------------------------------
  try {
    const { changes, cursor } = await backend.pull(await getCursor());
    for (const change of changes) {
      const applied = await applyRemote(change);
      if (applied) result.pulled++;
      else result.conflictsResolvedLocally++;
    }
    await setCursor(cursor);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

/**
 * Apply a remote change locally, unless we hold a newer version of the same row.
 * Returns whether it was applied.
 */
async function applyRemote(change: Change): Promise<boolean> {
  // A pending local edit always wins: it is newer by definition of not having
  // been pushed yet, and discarding it would lose a write the user has already
  // seen succeed.
  const pending = await syncDb.outbox.get(`${change.table}:${change.pk}`);
  if (pending && pending.updatedAt >= change.updatedAt) return false;

  const table = db.table(change.table);

  if (change.deleted) {
    await table.delete(change.pk.includes('|') ? change.pk.split('|')[0] : change.pk);
    return true;
  }

  await table.put(change.row as never);
  return true;
}

/** Discard all sync state. Local user data is untouched. */
export async function resetSyncState(): Promise<void> {
  await syncDb.outbox.clear();
  await syncDb.meta.clear();
}
