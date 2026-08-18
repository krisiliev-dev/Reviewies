import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthChange, syncConfigured, ensureProfile } from './auth';
import { pendingCount, syncOnce, type SyncResult } from './engine';
import { SupabaseBackend } from './supabaseBackend';

export interface SyncStatus {
  configured: boolean;
  session: Session | null;
  pending: number;
  busy: boolean;
  lastResult?: SyncResult;
  lastRunAt?: number;
  sync: () => Promise<void>;
}

/**
 * Drives sync from the UI.
 *
 * Sync is opportunistic on purpose: it runs on sign-in, on reconnect, and on a slow
 * timer. It is never on the critical path of a user action — marking an episode
 * watched completes locally and the upload follows whenever it can.
 */
export function useSync(intervalMs = 60_000): SyncStatus {
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult>();
  const [lastRunAt, setLastRunAt] = useState<number>();

  const configured = syncConfigured();

  useEffect(() => {
    if (!configured) return;
    void getSession().then(setSession);
    return onAuthChange(setSession);
  }, [configured]);

  // Keep the pending badge honest even when sync is not running.
  useEffect(() => {
    const tick = () => void pendingCount().then(setPending);
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  const sync = useCallback(async () => {
    if (!configured || !session || busy) return;
    setBusy(true);
    try {
      const backend = SupabaseBackend.fromEnv();
      if (!backend) return;
      await ensureProfile();
      setLastResult(await syncOnce(backend));
      setLastRunAt(Date.now());
    } finally {
      setBusy(false);
      setPending(await pendingCount());
    }
  }, [configured, session, busy]);

  useEffect(() => {
    if (!session) return;
    void sync();
    const id = setInterval(() => void sync(), intervalMs);
    // Coming back online is the moment a queued change is most likely to succeed.
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', onOnline);
    };
    // `sync` is intentionally excluded: it changes identity on every busy toggle,
    // which would tear down and rebuild the interval mid-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, intervalMs]);

  return { configured, session, pending, busy, lastResult, lastRunAt, sync };
}
