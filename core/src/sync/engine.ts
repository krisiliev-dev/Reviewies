import { db } from '../data/db.ts';
import { type Change, type SyncBackend, SyncError, type SyncTable } from './types.ts';
import { syncedNow } from './clock.ts';

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

/**
 * A write the server will never accept, kept out of the queue and kept.
 *
 * The outbox had two outcomes and needed three. A failure that cannot succeed was
 * *deleted* — the whole batch of up to two hundred rows, not just the offending one —
 * and a failure that could was left in front of everything else, so §6.70's tombstone
 * jammed every later write for ever with nothing on screen to say so.
 *
 * Set aside is the third: the row leaves the queue so the rest can drain, and it is
 * still here, counted, and said out loud. Deleting somebody's watch history to unblock
 * an upload is the one outcome that is never acceptable. §6.71.
 */
export interface RejectedEntry {
  key: string;
  table: SyncTable;
  pk: string;
  row: Record<string, unknown>;
  updatedAt: number;
  deleted: boolean;
  /** When it was set aside. */
  at: number;
  /** What the server said, verbatim, so it can be reported rather than guessed at. */
  reason: string;
  attempts: number;
}

/**
 * The outbox and the sync cursor live in the same database as everything else.
 *
 * They used to be a second Dexie instance. Separating them bought nothing — the two
 * were always written together — and it made the engine depend on a browser database
 * directly, which is exactly what stops the core running on a phone.
 */
const outbox = () => db.outbox as unknown as import('../data/store.ts').Table<OutboxEntry>;
const meta = () => db.syncState as unknown as import('../data/store.ts').Table<SyncMeta>;
const rejected = () =>
  db.rejected as unknown as import('../data/store.ts').Table<RejectedEntry>;

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
 * A local write and the outbox entry that will send it, together or not at all.
 *
 * Every syncable write in the product is a pair: put the row where the screen reads it,
 * then queue it for upload. They were ten separate pairs of `await`s with nothing holding
 * them together — and the *order* is what makes that dangerous. The local write goes
 * first, deliberately, so the interface never waits on the queue. Lose the pair and
 * nothing happened. Lose the second half and the change is **on this device and no
 * other, permanently, with nothing in the product that could notice**: the outbox is the
 * only record that a row needs sending, and a row missing from it is a row that has
 * already been sent, as far as anything here can tell.
 *
 * §6.155 measured the window in a real browser rather than reasoning about it. Marking an
 * episode watched and taking the tab away 1 ms later left `watches +1, outbox +0`; at
 * 4 ms the same; at 8 ms and beyond both landed; at 0 ms neither did, which is the
 * harmless outcome. So it is a few milliseconds wide per tap, on the tap the whole
 * product is built around, and it is silent.
 *
 * A helper rather than ten transactions, because ten call sites are ten chances to decide
 * it differently and an eleventh site is the one that will. §6.139.
 *
 * The four importers already did this correctly — every one of them wraps its bulk writes
 * and its `enqueueAll` in a transaction naming `db.outbox`. The paths that write thousands
 * of rows were safe; the single tap was not.
 */
export function queued<T>(table: unknown, body: () => Promise<T>): Promise<T> {
  // Dexie needs the stores named to lock them; the SQLite adapter accepts and ignores
  // them, because it locks the connection. `store.ts` says so at the transaction type.
  return db.transaction('rw', table, db.outbox, body) as Promise<T>;
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
  // Corrected towards the server where that is known. Every `updatedAt` in the product
  // is decided here, so this one line is what stops a wrong clock from writing rows no
  // other device can ever overwrite. §6.67.
  const updatedAt = opts.updatedAt ?? syncedNow();
  const key = `${table}:${pk}`;

  const existing = await outbox().get(key);
  /**
   * A stale write must not overwrite a newer one already waiting to go out — but only
   * when the caller said which write it is.
   *
   * The check used to apply to every call, comparing two of *this device's own*
   * timestamps. So a clock corrected backwards — NTP catching up, exactly what happens
   * to the fast device once it finds a network — left an entry stamped in the future
   * sitting in the queue, and every edit the person made afterwards was silently
   * dropped until the clock caught up with it again. Nothing told them; the button
   * worked and the change vanished.
   *
   * An unstamped call is happening *now*, in this process, after whatever is already
   * queued. It is later by construction and needs no clock to say so. Only an explicit
   * `updatedAt` — the importers, replaying history whose order they know — is compared.
   */
  if (opts.updatedAt !== undefined && existing && existing.updatedAt > updatedAt) return;

  await outbox().put({
    key,
    table,
    pk,
    row,
    updatedAt,
    deleted: opts.deleted ?? false,
    attempts: existing?.attempts ?? 0,
  });

  notifyQueued();
}

/**
 * Tell the driver, from outside whatever transaction just wrote.
 *
 * `setTimeout` rather than a direct call, and that is load-bearing rather than
 * defensive. Every bulk writer queues from inside a Dexie transaction, and Dexie binds
 * promises to the transaction's zone — so a listener that reads the outbox or starts a
 * sync from here joins the caller's transaction and hangs it. An import of six thousand
 * rows stopped part-way through with no error at all, which is how this was found.
 *
 * What catches it is app/smoke.mjs, at the step that imports a GDPR zip: the report
 * never appears, because the transaction never commits. A unit test for it was written
 * and thrown away — fake-indexeddb does not reproduce the zone binding, so it passed
 * with the fix removed, and a guard that cannot fail is worse than none.
 */
function notifyQueued(): void {
  if (enqueueListeners.size === 0) return;
  setTimeout(() => {
    for (const listener of enqueueListeners) listener();
  }, 0);
}

/**
 * Queue a batch of rows the same way, for the paths that write in bulk.
 *
 * The importers and the matcher were writing straight to the tables, which is the one
 * thing in this codebase that must never happen: every other write goes through
 * `markWatched` or `rate`, which queue. A rescued history that never reaches the outbox
 * exists on one device and no other, and matching was worse than that — it retired watch
 * IDs locally while the server still held the old ones, so a pull could resurrect the
 * pre-match state and split one history across two sets of IDs.
 *
 * Sequential rather than parallel: each call reads the existing row to avoid clobbering
 * a newer write, and thousands of interleaved read-modify-writes against the same store
 * is how that check stops being reliable.
 */
export async function enqueueAll(
  table: SyncTable,
  rows: Array<Record<string, unknown>>,
  opts: { deleted?: boolean; updatedAt?: number } = {},
): Promise<void> {
  for (const row of rows) await enqueue(table, row, opts);
}

/**
 * Told when something joins the queue.
 *
 * The driver listens so a write can be followed by an upload rather than by a wait for
 * the next tick — which after an import is the difference between six thousand rows
 * leaving now and leaving in a minute.
 */
const enqueueListeners = new Set<() => void>();

export function onEnqueue(fn: () => void): () => void {
  enqueueListeners.add(fn);
  return () => enqueueListeners.delete(fn);
}

export async function pendingCount(): Promise<number> {
  return outbox().count();
}

/**
 * Whether one particular row is still waiting to go out.
 *
 * `pendingCount` answers about the **queue**; this answers about a **row**, and the
 * difference is what §6.177 needed. A screen asking "has the server heard about this
 * episode yet" cannot use a queue-wide number: an unrelated rating sitting in the outbox
 * would make it say yes, and an empty queue with this row already sent says no for the
 * wrong reason. The outbox is keyed `table:pk` — the same key `enqueue` writes — so the
 * exact question is answerable exactly.
 *
 * A `false` here does **not** mean the server has the row. It means this device is not
 * still holding it: a push that failed and was set aside lives in `rejected`, which is
 * `rejectedCount`'s subject and a different sentence.
 */
export async function isQueued(table: SyncTable, pk: string): Promise<boolean> {
  return (await outbox().get(`${table}:${pk}`)) !== undefined;
}

/** How many writes the server refused and this device is still holding. */
export async function rejectedCount(): Promise<number> {
  return rejected().count();
}

/**
 * Put a rejected write back in the queue.
 *
 * The one honest thing to offer after a deployment: a row set aside because the schema
 * did not know a column (42703) succeeds once it does, and nobody should have to be told
 * to reinstall the app.
 */
export async function retryRejected(): Promise<number> {
  const held = await rejected().toArray();
  for (const entry of held) {
    await outbox().put({
      key: entry.key,
      table: entry.table,
      pk: entry.pk,
      row: entry.row,
      updatedAt: entry.updatedAt,
      deleted: entry.deleted,
      attempts: 0,
    });
    await rejected().delete(entry.key);
  }
  return held.length;
}

async function getCursor(): Promise<number> {
  return (await meta().get('cursor'))?.value ?? 0;
}

async function setCursor(value: number): Promise<void> {
  await meta().put({ key: 'cursor', value });
}

/** A ceiling on push batches per sync, so a pathological queue cannot spin forever. */
const MAX_PUSH_BATCHES = 500;

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Remote rows discarded because the local copy was newer. */
  conflictsResolvedLocally: number;
  /** Writes set aside this run because the server will never accept them. */
  rejected: number;
  error?: string;
}

/**
 * How many times a retryable failure may repeat before the entry is set aside too.
 *
 * A failure the server calls transient can still be permanent in practice — a bug in
 * this client, a backend that 500s on one particular row for ever. Without a ceiling
 * that is indistinguishable from §6.70's jam, so retryable buys patience rather than
 * immunity. Twenty is roughly a day at the driver's interval: long enough that a
 * fortnight offline costs nothing, short enough that a genuinely stuck row stops
 * holding the rest hostage.
 */
export const MAX_ATTEMPTS = 20;

/** Move an entry out of the queue and into what the person can be shown. */
async function setAside(entry: OutboxEntry, reason: string, attempts: number): Promise<void> {
  await rejected().put({
    key: entry.key,
    table: entry.table,
    pk: entry.pk,
    row: entry.row,
    updatedAt: entry.updatedAt,
    deleted: entry.deleted,
    at: syncedNow(),
    reason,
    attempts,
  });
  await outbox().delete(entry.key);
}

/**
 * Which entries in a failed batch the server will not take.
 *
 * Binary search on the batch: push each half, and recurse into whichever halves fail.
 * A batch of one that fails is the answer. Everything that succeeds on the way is
 * genuinely delivered, so the isolation is not wasted work — it is the push, done in
 * smaller pieces.
 *
 * A retryable error part-way through means the network went while we were bisecting;
 * that half is left alone and tried again next time rather than blamed.
 */
async function isolate(backend: SyncBackend, batch: OutboxEntry[]): Promise<OutboxEntry[]> {
  const asChange = (e: OutboxEntry): Change => ({
    pk: e.pk,
    table: e.table,
    row: e.row,
    updatedAt: e.updatedAt,
    deleted: e.deleted,
  });

  const failing: OutboxEntry[] = [];
  const queue: OutboxEntry[][] = [batch];

  while (queue.length) {
    const part = queue.shift()!;
    if (part.length === 0) continue;
    try {
      await backend.push(part.map(asChange));
      // Delivered. Clear what is still recognisable, exactly as the happy path does.
      await db.transaction('rw', outbox(), async () => {
        for (const entry of part) {
          const current = await outbox().get(entry.key);
          if (current && current.updatedAt === entry.updatedAt) await outbox().delete(entry.key);
        }
      });
    } catch (e) {
      if (e instanceof SyncError && e.retryable) continue;
      if (part.length === 1) {
        failing.push(part[0]);
        continue;
      }
      const half = Math.floor(part.length / 2);
      queue.push(part.slice(0, half), part.slice(half));
    }
  }
  return failing;
}

/**
 * One full sync cycle: push local changes, then pull remote ones.
 *
 * Push happens first so that our own changes are already on the server when we pull,
 * which keeps last-write-wins from resurrecting data we just deleted.
 */
export async function syncOnce(backend: SyncBackend, batchSize = 200): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflictsResolvedLocally: 0, rejected: 0 };

  // --- Push ---------------------------------------------------------------
  //
  // In batches, until the queue is empty. It used to send one batch per call, which
  // was fine for a queue of a few edits and quietly awful for the flow this app was
  // built around: rescuing a TV Time library writes thousands of watch events at once,
  // and the caller runs a sync on a timer, so twenty thousand events at two hundred a
  // go is a hundred timer ticks before someone's history reaches the server.
  for (let batches = 0; ; batches++) {
    // A ceiling, not a limit anyone should reach. An entry that is superseded while in
    // flight is deliberately left in the queue, so a pathological write loop could keep
    // finding work; stopping is better than spinning.
    if (batches >= MAX_PUSH_BATCHES) break;

    const batch = await outbox().orderBy('updatedAt').limit(batchSize).toArray();
    if (batch.length === 0) break;

    const changes: Change[] = batch.map((e) => ({
      pk: e.pk,
      table: e.table,
      row: e.row,
      updatedAt: e.updatedAt,
      deleted: e.deleted,
    }));

    let cleared = 0;
    try {
      await backend.push(changes);
      // Only clear entries that have not been superseded while the request was in
      // flight — otherwise an edit made mid-push would be silently dropped.
      await db.transaction('rw', outbox(), async () => {
        for (const entry of batch) {
          const current = await outbox().get(entry.key);
          if (current && current.updatedAt === entry.updatedAt) {
            await outbox().delete(entry.key);
            cleared++;
          }
        }
      });
      result.pushed += batch.length;
    } catch (e) {
      const retryable = !(e instanceof SyncError) || e.retryable;
      result.error = e instanceof Error ? e.message : String(e);

      if (retryable) {
        /**
         * Count the attempt, and give up on anything that has had enough of them.
         *
         * A batch that fails for a transient reason stays put and is tried again. What
         * must not happen is *for ever*: a row the server calls retryable and refuses
         * every time is §6.70's jam wearing different clothes, so the ceiling applies
         * here too. Returning is still right — the network is the likely cause and
         * hammering it with the next batch helps nobody.
         */
        await db.transaction('rw', outbox(), rejected(), async () => {
          for (const entry of batch) {
            const current = await outbox().get(entry.key);
            if (!current) continue;
            const attempts = current.attempts + 1;
            if (attempts >= MAX_ATTEMPTS) {
              await setAside(current, result.error!, attempts);
              result.rejected++;
            } else {
              await outbox().update(entry.key, { attempts });
            }
          }
        });
        return result;
      }

      /**
       * One of these rows cannot be accepted. Find out which, rather than punishing all
       * of them.
       *
       * The whole batch — up to two hundred writes — used to be **deleted** on a
       * permanent failure, because Postgres fails the statement rather than the row and
       * nothing here asked which one. One malformed tombstone could take a hundred and
       * ninety-nine good watches with it, silently.
       *
       * Bisecting costs at most `log2(batch)` extra requests, only on a failure that is
       * already rare, and it is the only way to tell the offender from its neighbours
       * with a server that answers per statement.
       */
      const offenders = await isolate(backend, batch);
      await db.transaction('rw', outbox(), rejected(), async () => {
        for (const entry of offenders) {
          const current = await outbox().get(entry.key);
          if (!current) continue;
          await setAside(current, result.error!, current.attempts + 1);
          result.rejected++;
        }
      });
      // Round the loop again: the rest of the batch is untouched and still queued, so
      // the next pass sends it without the row that was stopping it.
      continue;
    }

    // Nothing left the queue, so the next pass would fetch the same rows and send them
    // again. Every entry in it was superseded mid-flight; they will go next time.
    if (cleared === 0) break;
  }

  // --- Pull ---------------------------------------------------------------
  try {
    const { changes, cursor } = await backend.pull(await getCursor());
    for (const change of changes) {
      const applied = await applyRemote(change);
      if (applied) result.pulled++;
      else result.conflictsResolvedLocally++;
    }
    /**
     * Never let the cursor run ahead of now.
     *
     * The real backend derives its cursor from the newest `updated_at` it saw, and that
     * column holds whatever clock wrote the row. One device a week fast therefore moved
     * *every other device's* cursor a week into the future, and each of them then asked
     * for everything later than that and received nothing — for a week. A single wrong
     * clock silenced sync for everybody, and the only symptom was that nothing arrived.
     *
     * Clamping here rather than in the adapter because it is the engine that owns the
     * cursor, and because it protects any backend. Rows stamped in the future are still
     * applied — they are somebody's data — they just cannot carry the cursor with them.
     * §6.67.
     */
    await setCursor(Math.min(cursor, syncedNow()));
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
  /**
   * A pending local edit always wins: it is newer by definition of not having been
   * pushed yet, and discarding it would lose a write the user has already seen succeed.
   *
   * That sentence was already here, and the line under it then compared timestamps and
   * did something else. On a device whose clock runs slow, a change made *after* the
   * remote one carried a smaller number and lost — the person's edit overwritten by the
   * thing they had just replaced. The rule as written needs no comparison: unconditional
   * is both simpler and what the comment always claimed. §6.67.
   *
   * It costs nothing in ordering. The pending entry is pushed moments later and
   * last-write-wins settles it on the server either way.
   */
  const pending = await outbox().get(`${change.table}:${change.pk}`);
  if (pending) return false;

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
  await outbox().clear();
  await meta().clear();
}
