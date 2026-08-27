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
      <section className="rounded-plate bg-ground-raised p-4">
        <h2 className="mb-1 font-semibold">Sync</h2>
        <p className="text-sm text-ink-secondary">
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
      <section className="rounded-plate bg-ground-raised p-4">
        <h2 className="mb-1 font-semibold">Sync across devices</h2>
        <p className="mb-3 text-sm text-ink-secondary">
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
            className="rounded-none bg-ground-well px-3 py-3 outline-none placeholder:text-ink-secondary"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            className="rounded-none border border-stroke-signal px-3 py-3 outline-none placeholder:text-ink-secondary"
          />
          <button type="submit" className="rounded-pill bg-action-fill px-4 py-3 font-medium text-action-label">
            {mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          className="tap mt-2 text-sm text-ink-secondary underline"
        >
          {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
        </button>

        {error && <p className="mt-2 text-sm text-trouble">{error}</p>}
        {notice && <p className="mt-2 text-sm text-ink-secondary">{notice}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-plate bg-ground-raised p-4">
      <h2 className="mb-1 font-semibold">Sync</h2>
      <p className="text-sm text-ink-secondary">Signed in as {session.user.email}</p>

      <dl className="mt-3 flex gap-4 text-sm">
        <div>
          <dt className="text-xs text-ink-secondary">Waiting to upload</dt>
          <dd className="text-lg font-semibold tabular-nums">{pending}</dd>
        </div>
        {lastRunAt && (
          <div>
            <dt className="text-xs text-ink-secondary">Last sync</dt>
            <dd className="text-lg">{new Date(lastRunAt).toLocaleTimeString()}</dd>
          </div>
        )}
      </dl>

      {lastResult?.error && (
        // Surfaced rather than hidden: a silent sync failure is how people lose
        // confidence in a tracker.
        <p className="mt-2 text-sm text-trouble">Last sync failed: {lastResult.error}</p>
      )}

      {/* Writes the server refused, which this device is still holding.
          Separate from the waiting count because they mean opposite things: pending is
          "on its way", this is "not going without help". Counted since the engine was
          written and read by nothing until §6.71, so a queue stuck for a week looked
          exactly like one that was empty. */}
      {rejected > 0 && (
        <div className="mt-3 rounded-plate bg-ground/40 p-3" role="status">
          <p className="text-sm text-trouble">{COPY.sync.rejected(rejected)}</p>
          <button
            onClick={async () => setRetryNote(COPY.sync.retrying(await retryRejectedWrites()))}
            className="mt-2 rounded-pill border border-stroke-signal px-3 py-1.5 text-sm font-medium"
          >
            {COPY.sync.retryRejected}
          </button>
          {retryNote && <p className="mt-2 text-xs text-ink-secondary">{retryNote}</p>}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void sync()}
          disabled={busy}
          aria-label="Sync now"
          aria-busy={busy}
          className="rounded-pill bg-action-fill px-4 py-2 font-medium text-action-label disabled:bg-ground-well disabled:text-ink-secondary"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          onClick={() => void signOut()}
          aria-label="Sign out of your account"
          className="rounded-pill border border-stroke-signal px-4 py-2"
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
