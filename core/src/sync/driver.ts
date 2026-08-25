import { ensureProfile, getSession, onAuthChange, syncConfigured } from './auth';
import { onEnqueue, pendingCount, syncOnce, type SyncResult } from './engine';
import { SupabaseBackend } from './supabaseBackend';
import type { SyncBackend } from './types';

/**
 * The thing that actually runs sync.
 *
 * It lived in a React hook, and a hook runs for as long as the component holding it is
 * mounted. On the web that was the account panel and the people screen, so the queue
 * drained only while somebody happened to be looking at one of two screens they have no
 * reason to sit on — and every write in the app happens somewhere else. On the phone
 * nothing imported the engine at all: you could sign in, read "an account adds sync
 * across devices", and never have a single row leave the device.
 *
 * So it belongs here, where it runs for the app rather than for a screen, and where both
 * platforms get the same one. Screens subscribe to it for status; they do not own it.
 *
 * Nothing here is on the critical path of a user action. Marking an episode watched
 * completes locally and the upload follows whenever it can — that is the whole point of
 * the outbox, and it is why every trigger below is allowed to do nothing.
 */
export interface SyncStatus {
  configured: boolean;
  signedIn: boolean;
  pending: number;
  busy: boolean;
  lastResult?: SyncResult;
  lastRunAt?: number;
  lastError?: string;
}

let status: SyncStatus = { configured: false, signedIn: false, pending: 0, busy: false };
const listeners = new Set<(status: SyncStatus) => void>();

function update(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

export function syncStatus(): SyncStatus {
  return status;
}

export function onSyncStatus(fn: (status: SyncStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

let running: Promise<void> | undefined;
let makeBackend: () => SyncBackend | undefined = () => SupabaseBackend.fromEnv();

/**
 * Run one cycle, or join the one already running.
 *
 * Coalesced rather than queued: two reasons to sync arriving together — a write settling
 * just as the app comes to the foreground — should be one round trip, not two.
 */
export async function requestSync(): Promise<void> {
  if (running) return running;
  if (!status.configured || !status.signedIn) return;

  running = (async () => {
    update({ busy: true, lastError: undefined });
    try {
      const backend = makeBackend();
      if (!backend) return;
      await ensureProfile();
      const result = await syncOnce(backend);
      update({ lastResult: result, lastRunAt: Date.now(), lastError: result.error });
    } catch (e) {
      // A failed sync is not a failed app. The queue keeps its rows and the next
      // trigger tries again; what must not happen is an unhandled rejection from a
      // timer nobody is awaiting.
      update({ lastError: e instanceof Error ? e.message : 'Sync failed' });
    } finally {
      update({ busy: false, pending: await pendingCount() });
      running = undefined;
    }
  })();

  return running;
}

/**
 * Start the driver. Returns a stop function.
 *
 * Called once, by the app rather than by a screen. Calling it twice is a mistake worth
 * catching — two drivers would race each other through the same queue — so the second
 * call replaces the first.
 */
let stopCurrent: (() => void) | undefined;

export function startSyncDriver(options: {
  intervalMs?: number;
  /** Injected by tests; the default builds one from the configured credentials. */
  backend?: () => SyncBackend | undefined;
} = {}): () => void {
  stopCurrent?.();

  const { intervalMs = 60_000, backend } = options;
  if (backend) makeBackend = backend;

  update({ configured: syncConfigured() });
  let stopped = false;

  const unsubscribeAuth = onAuthChange((session) => {
    update({ signedIn: Boolean(session) });
    // Signing in is the moment a queue built up offline is most likely to move.
    if (session) void requestSync();
  });

  void getSession().then((session) => {
    update({ signedIn: Boolean(session) });
    if (session) void requestSync();
  });

  // A write settling is the other moment worth acting on, and the one that matters most
  // after an import: six thousand rows should not wait for a timer.
  const unsubscribeQueue = onEnqueue(() => {
    void pendingCount().then((pending) => update({ pending }));
    void requestSync();
  });

  const timer = setInterval(() => void requestSync(), intervalMs);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    unsubscribeAuth();
    unsubscribeQueue();
    if (stopCurrent === stop) stopCurrent = undefined;
  };
  stopCurrent = stop;
  return stop;
}

/** Mainly for tests, which start and stop drivers between cases. */
export function resetSyncDriver(): void {
  stopCurrent?.();
  stopCurrent = undefined;
  listeners.clear();
  makeBackend = () => SupabaseBackend.fromEnv();
  status = { configured: false, signedIn: false, pending: 0, busy: false };
}
