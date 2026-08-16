import { type Change, type PullResult, type SyncBackend, SyncError } from './types';

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

  async push(changes: Change[]): Promise<void> {
    this.pushCount++;
    if (this.failNextPush) {
      const err = this.failNextPush;
      this.failNextPush = undefined;
      throw err;
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
