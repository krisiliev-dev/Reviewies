import { useState } from 'react';
import { signIn, signOut, signUp } from '@reviewies/core/sync/auth';
import { useSync } from '../sync/useSync';
import { COPY } from '@reviewies/core/copy';
import { retryRejectedWrites } from '@reviewies/core/sync/driver';
import { Button } from '../ui/Button';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';

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
        <h2 className="mb-1 text-s16 font-title font-semibold">Sync</h2>
        <Note>
          Not configured. Reviewies works fully offline without it — set
          <code className="mx-1">VITE_SUPABASE_URL</code> and
          <code className="mx-1">VITE_SUPABASE_ANON_KEY</code> to sync across devices.
        </Note>
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
        <h2 className="mb-1 text-s16 font-title font-semibold">Sync across devices</h2>
        <Note className="mb-3">
          Optional. Everything already works on this device — an account adds sync and
          shared reactions.
        </Note>

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
          <Button
            submit
            size="page"
            tone="primary"
            label={mode === 'in' ? 'Sign in' : 'Create account'}
            name={mode === 'in' ? 'Sign in' : 'Create account'}
          />
        </form>

        <button
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          className="tap mt-2 text-s14 text-ink-secondary underline"
        >
          {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
        </button>

        {error && <p className="mt-2 text-s14 text-trouble">{error}</p>}
        {notice && <Note className="mt-2">{notice}</Note>}
      </section>
    );
  }

  return (
    <section className="rounded-plate bg-ground-raised p-4">
      <h2 className="mb-1 text-s16 font-title font-semibold">Sync</h2>
      <Note>Signed in as {session.user.email}</Note>

      <dl className="mt-3 flex gap-4 text-s14">
        <div>
          <Note level="footnote" as="dt">Waiting to upload</Note>
          <dd><Data value={pending} size="s20" /></dd>
        </div>
        {lastRunAt && (
          <div>
            <Note level="footnote" as="dt">Last sync</Note>
            <dd className="text-s20">{new Date(lastRunAt).toLocaleTimeString()}</dd>
          </div>
        )}
      </dl>

      {lastResult?.error && (
        // Surfaced rather than hidden: a silent sync failure is how people lose
        // confidence in a tracker.
        <p className="mt-2 text-s14 text-trouble">Last sync failed: {lastResult.error}</p>
      )}

      {/* Writes the server refused, which this device is still holding.
          Separate from the waiting count because they mean opposite things: pending is
          "on its way", this is "not going without help". Counted since the engine was
          written and read by nothing until §6.71, so a queue stuck for a week looked
          exactly like one that was empty. */}
      {rejected > 0 && (
        <div className="mt-3 rounded-plate bg-ground/40 p-3" role="status">
          <p className="text-s14 text-trouble">{COPY.sync.rejected(rejected)}</p>
          <button
            onClick={async () => setRetryNote(COPY.sync.retrying(await retryRejectedWrites()))}
            className="mt-2 rounded-pill border border-stroke-signal px-3 py-1.5 text-s14 font-title font-semibold"
          >
            {COPY.sync.retryRejected}
          </button>
          {retryNote && <Note level="footnote" className="mt-2">{retryNote}</Note>}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          tone="primary"
          label={busy ? 'Syncing…' : 'Sync now'}
          name="Sync now"
          // The rule under the label rather than a spinner in place of it: `busy` keeps
          // the word readable, which is what this call site worked around by hand.
          busy={busy}
          disabled={busy}
          onPress={() => void sync()}
        />
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
