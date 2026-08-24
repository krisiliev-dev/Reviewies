/**
 * Sync contract.
 *
 * The client is the source of truth for your own history — every local write lands
 * in IndexedDB immediately and is queued for the server afterwards. Marking an
 * episode watched must never wait on, or fail because of, the network.
 *
 * Conflict resolution is field-level last-write-wins. That is sufficient here
 * because the operations are naturally idempotent: "episode X watched at time T"
 * either happened or it did not. CRDTs would be unwarranted complexity.
 */

export type SyncTable = 'watches' | 'ratings' | 'watchlist' | 'library' | 'reactions';

export interface Change {
  /** Stable identity of the row within its table. */
  pk: string;
  table: SyncTable;
  /** Row contents. Ignored when `deleted` is true. */
  row: Record<string, unknown>;
  /** Logical clock for last-write-wins. Epoch milliseconds. */
  updatedAt: number;
  /** Tombstone. Deletes have to replicate just like edits. */
  deleted: boolean;
}

export interface PullResult {
  changes: Change[];
  /** Cursor to pass to the next pull. */
  cursor: number;
}

export interface SyncBackend {
  readonly name: string;
  /**
   * Send local changes. Must be idempotent — the same change may be pushed more
   * than once if a response is lost, and that must not duplicate or corrupt data.
   */
  push(changes: Change[]): Promise<void>;
  /** Fetch everything changed after `cursor`. */
  pull(cursor: number): Promise<PullResult>;
}

export class SyncError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'SyncError';
    this.retryable = retryable;
  }
}
