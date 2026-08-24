import { useState } from 'react';
import { captureContribution, micSupported, syncByListening, HOP_SIZE } from '../fingerprint/capture';
import { contributeReference, fetchReference } from '@reviewies/core/fingerprint/references';

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
      const stored = await fetchReference(targetId);
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
      // Thirty seconds is enough to be useful without asking someone to sit still.
      const { hashes, frames } = await captureContribution(30_000);
      const result = await contributeReference({
        targetId,
        hashes,
        frameCount: frames,
        hopSize: HOP_SIZE,
        sampleRate: 22_050,
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
    <div className="mx-3 mb-2 rounded-xl bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={listen}
          disabled={!!busy}
          className="rounded-lg bg-surface px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {busy === 'listening' ? 'Listening…' : 'Sync by listening'}
        </button>
        <button
          onClick={contribute}
          disabled={!!busy || positionMs < 1000}
          className="rounded-lg bg-surface px-3 py-1.5 text-xs text-muted disabled:opacity-40"
          title={positionMs < 1000 ? 'Start the episode first' : undefined}
        >
          {busy === 'contributing' ? 'Recording…' : 'Help map this episode'}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        {/* Specific about scope: what is recorded, for how long, and what leaves the
            device. Vague reassurance would be worse than none. */}
        Uses the microphone for a few seconds. Audio never leaves this device — only a
        one-way digest of it is sent, which cannot be turned back into sound.
      </p>

      {note && <p className="mt-1 text-[11px] text-accent">{note}</p>}
    </div>
  );
}
