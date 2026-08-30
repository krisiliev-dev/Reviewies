import { Block } from '../ui/Block';
import { useState } from 'react';
import { signIn, signOut, signUp } from '@reviewies/core/sync/auth';
import { useSync } from '../sync/useSync';
import { COPY } from '@reviewies/core/copy';
import { retryRejectedWrites } from '@reviewies/core/sync/driver';
import { Button } from '../ui/Button';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';

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
      <Block heading="Sync">
        {/*
          The spaces are typed, and `{' '}` is where a line has to break.

          This was three lines with the names at the head of the second and third, and
          JSX deletes a newline between a text run and an element — so the sentence
          arrived as `setVITE_SUPABASE_URL andVITE_SUPABASE_ANON_KEY`, which is what the
          clipboard and the accessible name still said. `mx-1` on each `<code>` covered it
          for a sighted reader and only on the side that had lost its space, so the gap
          after each name came out double the gap before it, and `and` was welded to the
          name after it with no break opportunity: in `dark-10-settings.png` the line
          `set VITE_SUPABASE_URL` stops at 180.5pt of a measure that runs to 387.5, which
          leaves 56% of it blank. `Settings.tsx` types the same shape on one line and has
          always rendered right. `note.test.ts` holds the rule now.
        */}
        <Note>
          Not configured. Reviewies works fully offline without it — set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to sync across
          devices.
        </Note>
      </Block>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNotice(undefined);
    try {
      if (mode === 'up') {
        await signUp(email, password);
        setNotice(COPY.sync.confirmEmail);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY.sync.failed);
    }
  }

  if (!session) {
    return (
      <Block heading={COPY.sync.acrossDevices}>
        <Note className="mb-3">
          Optional. Everything already works on this device — an account adds sync and
          shared reactions.
        </Note>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <Field
            type="email"
            required
            label={COPY.fields.email}
            value={email}
            onChange={setEmail}
            placeholder="Email"
          />
          <Field
            type="password"
            required
            minLength={8}
            label={COPY.fields.password}
            value={password}
            onChange={setPassword}
            placeholder={COPY.fields.passwordRule}
          />
          <Button
            submit
            size="page"
            tone="primary"
            label={mode === 'in' ? COPY.controls.signIn : COPY.controls.createAccount}
            name={mode === 'in' ? COPY.controls.signIn : COPY.controls.createAccount}
          />
        </form>

        <button
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          className="tap mt-2 text-s14 text-ink-secondary underline"
        >
          {mode === 'in' ? COPY.controls.createAccountInstead : COPY.controls.haveAccount}
        </button>

        {error && <p className="mt-2 text-s14 text-trouble">{error}</p>}
        {notice && <Note className="mt-2">{notice}</Note>}
      </Block>
    );
  }

  return (
    <Block heading="Sync">
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
          <Button
            onPress={async () => setRetryNote(COPY.sync.retrying(await retryRejectedWrites()))}
            label={COPY.sync.retryRejected}
            name={COPY.sync.retryRejected}
            className="mt-2"
          />
          {retryNote && <Note level="footnote" className="mt-2">{retryNote}</Note>}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          tone="primary"
          label={busy ? COPY.waiting.syncing : 'Sync now'}
          name="Sync now"
          // The rule under the label rather than a spinner in place of it: `busy` keeps
          // the word readable, which is what this call site worked around by hand.
          busy={busy}
          disabled={busy}
          onPress={() => void sync()}
        />
        <Button
          onPress={() => void signOut()}
          label={COPY.controls.signOut}
          name="Sign out of your account"
        />
      </div>
    </Block>
  );
}
