import { useState } from 'react';
import { signIn, signOut, signUp } from '@reviewies/core/sync/auth';
import { useSync } from '../sync/useSync';
import { COPY } from '@reviewies/core/copy';
import { retryRejectedWrites } from '@reviewies/core/sync/driver';

/**
 * Account and sync controls.
 *
 * Framed as optional throughout: the app is fully usable signed out, and the copy
 * says so rather than nagging. Signing in adds multi-device sync and the shared
 * layer; it is not a gate.
 */
export function AccountPanel() {
  const { configured, session, pending, rejected, busy, lastResult, lastRunAt, sync } = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [retryNote, setRetryNote] = useState<string>();

  if (!configured) {
    return (
      <section className="rounded-2xl bg-surface p-4">
        <h2 className="mb-1 font-semibold">Sync</h2>
        <p className="text-sm text-muted">
          Not configured. Reviewies works fully offline without it — set
          <code className="mx-1">VITE_SUPABASE_URL</code> and
          <code className="mx-1">VITE_SUPABASE_ANON_KEY</code> to sync across devices.
        </p>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNotice(undefined);
    try {
      if (mode === 'up') {
        await signUp(email, password);
        setNotice('Check your email to confirm the account, then sign in.');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  if (!session) {
    return (
      <section className="rounded-2xl bg-surface p-4">
        <h2 className="mb-1 font-semibold">Sync across devices</h2>
        <p className="mb-3 text-sm text-muted">
          Optional. Everything already works on this device — an account adds sync and
          shared reactions.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-xl bg-surface-2 px-3 py-2.5 outline-none placeholder:text-muted"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            className="rounded-xl bg-surface-2 px-3 py-2.5 outline-none placeholder:text-muted"
          />
          <button type="submit" className="rounded-xl bg-accent px-4 py-2.5 font-medium text-ink">
            {mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          className="tap mt-2 text-sm text-muted underline"
        >
          {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
        </button>

        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-surface p-4">
      <h2 className="mb-1 font-semibold">Sync</h2>
      <p className="text-sm text-muted">Signed in as {session.user.email}</p>

      <dl className="mt-3 flex gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted">Waiting to upload</dt>
          <dd className="text-lg font-semibold tabular-nums">{pending}</dd>
        </div>
        {lastRunAt && (
          <div>
            <dt className="text-xs text-muted">Last sync</dt>
            <dd className="text-lg">{new Date(lastRunAt).toLocaleTimeString()}</dd>
          </div>
        )}
      </dl>

      {lastResult?.error && (
        // Surfaced rather than hidden: a silent sync failure is how people lose
        // confidence in a tracker.
        <p className="mt-2 text-sm text-accent">Last sync failed: {lastResult.error}</p>
      )}

      {/* Writes the server refused, which this device is still holding.
          Separate from the waiting count because they mean opposite things: pending is
          "on its way", this is "not going without help". Counted since the engine was
          written and read by nothing until §6.71, so a queue stuck for a week looked
          exactly like one that was empty. */}
      {rejected > 0 && (
        <div className="mt-3 rounded-xl bg-ink/40 p-3" role="status">
          <p className="text-sm text-accent">{COPY.sync.rejected(rejected)}</p>
          <button
            onClick={async () => setRetryNote(COPY.sync.retrying(await retryRejectedWrites()))}
            className="mt-2 rounded-lg bg-surface2 px-3 py-1.5 text-sm font-medium"
          >
            {COPY.sync.retryRejected}
          </button>
          {retryNote && <p className="mt-2 text-xs text-muted">{retryNote}</p>}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void sync()}
          disabled={busy}
          aria-label="Sync now"
          aria-busy={busy}
          className="rounded-xl bg-accent px-4 py-2 font-medium text-ink disabled:bg-surface-2 disabled:text-muted"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          onClick={() => void signOut()}
          aria-label="Sign out of your account"
          className="rounded-xl bg-surface-2 px-4 py-2"
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
