import { type Change, type PullResult, type SyncBackend, SyncError } from './types.ts';

/**
 * An in-memory server, used to test the sync engine without a live backend.
 *
 * It implements the same last-write-wins semantics the real server must, and can be
 * told to fail, so retry and data-loss behaviour is testable rather than assumed.
 */
export class MemoryBackend implements SyncBackend {
  readonly name = 'memory';

  private rows = new Map<string, Change>();
  private clock = 0;
  private sequence = new Map<string, number>();

  /** Set to make the next push throw. */
  failNextPush?: SyncError | Error;
  /** Set to make the next pull throw. */
  failNextPull?: Error;
  pushCount = 0;

  /**
   * Rows this server will never accept, by primary key.
   *
   * A real server fails the whole *statement*, not the row — which is why §6.71 has to
   * bisect a failed batch to find out which entry is the problem. Modelling that here
   * rather than failing whichever push happens to be first is the difference between a
   * test that proves the isolation works and one that proves a batch of size one works.
   */
  readonly refuses = new Map<string, SyncError>();

  async push(changes: Change[]): Promise<void> {
    this.pushCount++;
    if (this.failNextPush) {
      const err = this.failNextPush;
      this.failNextPush = undefined;
      throw err;
    }

    // Any offending row poisons the whole call, and nothing in it is written — exactly
    // what Postgres does with a failed multi-row upsert.
    for (const change of changes) {
      const refusal = this.refuses.get(`${change.table}:${change.pk}`);
      if (refusal) throw refusal;
    }

    for (const change of changes) {
      const key = `${change.table}:${change.pk}`;
      const existing = this.rows.get(key);
      // Idempotent and order-independent: an older write never overwrites a newer
      // one, so a duplicated or delayed push is harmless.
      if (existing && existing.updatedAt > change.updatedAt) continue;
      this.rows.set(key, { ...change });
      this.sequence.set(key, ++this.clock);
    }
  }

  async pull(cursor: number): Promise<PullResult> {
    if (this.failNextPull) {
      const err = this.failNextPull;
      this.failNextPull = undefined;
      throw err;
    }

    const changes: Change[] = [];
    for (const [key, change] of this.rows) {
      if ((this.sequence.get(key) ?? 0) > cursor) changes.push(change);
    }
    return { changes, cursor: this.clock };
  }

  /** Simulate another device writing directly to the server. */
  seed(change: Change): void {
    const key = `${change.table}:${change.pk}`;
    this.rows.set(key, change);
    this.sequence.set(key, ++this.clock);
  }

  get size(): number {
    return this.rows.size;
  }

  snapshot(): Change[] {
    return [...this.rows.values()];
  }
}
