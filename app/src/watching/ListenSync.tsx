import { useState } from 'react';
import { Note } from '../ui/Note';
import {
  captureContribution,
  micSupported,
  syncByListening,
  HOP_SIZE,
  SAMPLE_RATE,
} from '../fingerprint/capture';
import {
  contributeReference,
  CONTRIBUTION_MS,
  fetchReference,
} from '@reviewies/core/fingerprint/references';

/**
 * Listen-to-sync, and contributing the timeline that makes it possible.
 *
 * Both are opt-in, per use, and explicit about what the microphone is doing. The
 * consent language is specific rather than buried, because "this app listens to your
 * room" is exactly the kind of feature that deserves to be refused if it is not
 * explained properly.
 */
export function ListenSync({
  targetId,
  onSynced,
  positionMs,
}: {
  targetId: string;
  onSynced: (ms: number) => void;
  /** Current clock position, used when contributing a timeline. */
  positionMs: number;
}) {
  const [busy, setBusy] = useState<'listening' | 'contributing'>();
  const [note, setNote] = useState<string>();

  if (!micSupported()) return null;

  async function listen() {
    setBusy('listening');
    setNote(undefined);
    try {
      const found = await fetchReference(targetId);
      // Two different things to say, and the wrong one sends somebody off to spend an
      // episode recording a timeline that may already exist.
      if (found.failed) {
        setNote(`Could not check for a timeline (${found.failed}). Sync by hand for now.`);
        return;
      }
      const stored = found.reference;
      if (!stored) {
        setNote('Nobody has mapped this episode yet. Sync by hand and you can contribute one.');
        return;
      }

      const result = await syncByListening(stored.reference);
      if (!result) {
        setNote('Could not place that. Try again somewhere quieter, or sync by hand.');
        return;
      }

      onSynced(result.positionMs);
      setNote(`Synced, ${Math.round(result.confidence * 100)}% confident.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Listening failed.');
    } finally {
      setBusy(undefined);
    }
  }

  async function contribute() {
    setBusy('contributing');
    setNote(undefined);
    try {
      // How long to record is one decision, made in the core: it was a fixed thirty
      // here and a twenty-second floor on the phone, neither of which knew about the
      // other. Where the clock is now is where the recording starts in the episode —
      // without it the contribution claims the episode begins wherever this person
      // happened to press the button.
      const { hashes, frames } = await captureContribution(CONTRIBUTION_MS, {
        startMs: positionMs,
      });
      const result = await contributeReference({
        targetId,
        hashes,
        frameCount: frames,
        hopSize: HOP_SIZE,
        sampleRate: SAMPLE_RATE,
      });
      setNote(
        result.ok
          ? 'Thank you. It becomes usable once someone else agrees with it.'
          : result.reason,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Recording failed.');
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="mx-3 mb-2 rounded-plate border border-stroke-signal px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={listen}
          disabled={!!busy}
          aria-busy={busy === 'listening'}
          className="rounded-pill bg-ground-raised px-3 py-1.5 text-s12 disabled:opacity-50"
        >
          {busy === 'listening' ? 'Listening…' : 'Sync by listening'}
        </button>
        <button
          onClick={contribute}
          disabled={!!busy || positionMs < 1000}
          aria-busy={busy === 'contributing'}
          // The title attribute is a tooltip on a pointer and nothing at all otherwise;
          // the reason it is disabled has to be part of the name.
          aria-label={
            positionMs < 1000
              ? 'Help map this episode — start the episode first'
              : 'Help map this episode'
          }
          className="rounded-pill bg-ground-raised px-3 py-1.5 text-s12 text-ink-secondary disabled:opacity-40"
          title={positionMs < 1000 ? 'Start the episode first' : undefined}
        >
          {busy === 'contributing' ? 'Recording…' : 'Help map this episode'}
        </button>
      </div>

      <Note level="footnote" className="mt-1.5">
        {/* Specific about scope: what is recorded, for how long, and what leaves the
            device. Vague reassurance would be worse than none. */}
        Uses the microphone for a few seconds. Audio never leaves this device — only a
        one-way digest of it is sent, which cannot be turned back into sound.
      </Note>

      {note && <Note level="footnote" className="mt-1">{note}</Note>}
    </div>
  );
}
