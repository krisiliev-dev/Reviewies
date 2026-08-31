import { useState } from 'react';
import { COPY } from '@reviewies/core/copy';
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
import { Button } from '../ui/Button';

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
        setNote(COPY.watching.listenLookupFailed(found.failed));
        return;
      }
      const stored = found.reference;
      if (!stored) {
        setNote(COPY.watching.listenUnmapped);
        return;
      }

      const result = await syncByListening(stored.reference);
      if (!result) {
        setNote(COPY.watching.listenNoMatch);
        return;
      }

      onSynced(result.positionMs);
      // Placed either way. A one-shot capture in a title sequence is exactly when
      // somebody reaches for this, and answering "could not place that" when it plainly
      // did would be a worse lie than naming the doubt. What changes is the sentence, and
      // the sentence is the only thing here that can do anything about it — there is no
      // clock of our own to check the placement against, the way the phone has.
      /*
       * **The residual `ambiguousMatch.test.ts` names, and it is smaller than that file
       * thinks.** Its closing note says a source-level check cannot see
       * `ambiguous: match.ambiguous && false`, and that closing it needs a behavioural test
       * of `syncByListening`, which needs a microphone.
       *
       * Half right. Planted in the main checkout, all ten of that file's clauses pass and
       * `npx tsc -b` is clean — but **oxlint sees it**, as `no-constant-condition`, and has
       * all along. What was true is that nothing *failed* on it: `verify` ended in a bare
       * `npx oxlint`, which prints warnings and exits 0.
       *
       * So `verify` now runs `oxlint -D no-constant-condition`. One rule promoted rather than
       * the whole set, because there are two dozen standing warnings here that are judgements
       * rather than defects, and turning them all red would be a different decision made by
       * accident. This one is not a judgement: a condition that cannot vary is a branch that
       * cannot run, which is the shape of every wiring defect this sprint found.
       *
       * The larger residual stands, and is genuinely microphone-shaped: nothing here can see
       * `ambiguous: someOtherBoolean`. What is closed is the constant.
       */
      const sure = Math.round(result.confidence * 100);
      setNote(
        result.ambiguous
          ? COPY.watching.listenPlacedTwice(sure)
          : COPY.watching.listenPlaced(sure),
      );
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
        {/* `Button`s. Both of these were hand-drawn pills carrying
            `disabled:opacity-50` and `disabled:opacity-40` — the fade four components in
            this app now refuse, on the screen the product is named for. §6.131. */}
        <Button
          size="inline"
          onPress={listen}
          disabled={!!busy}
          busy={busy === 'listening'}
          label={busy === 'listening' ? COPY.waiting.listening : 'Sync by listening'}
          name={busy === 'listening' ? COPY.waiting.listening : 'Sync by listening'}
        />
        <Button
          size="inline"
          onPress={contribute}
          disabled={!!busy || positionMs < 1000}
          busy={busy === 'contributing'}
          label={busy === 'contributing' ? 'Recording…' : COPY.controls.helpMapEpisode}
          // The title attribute is a tooltip on a pointer and nothing at all otherwise;
          // the reason it is disabled has to be part of the name.
          name={
            positionMs < 1000
              ? 'Help map this episode — start the episode first'
              : COPY.controls.helpMapEpisode
          }
        />
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
