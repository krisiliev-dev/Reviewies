import { useState } from 'react';
import {
  acceptMatch,
  runMatching,
  type Proposal,
  type RunProgress,
} from '@reviewies/core/data/reconcile';
import { Poster } from './Poster';

/**
 * Finishing a migration.
 *
 * An export carries names and dates and no provider IDs, so an import lands under local
 * ones the provider has never heard of — no artwork, no air dates, no episode list
 * beyond what was watched. This is what turns those into real shows.
 *
 * The design turns on one asymmetry. An unmatched row is visibly unfinished and costs
 * nothing; a wrong match silently moves somebody's history onto the wrong show, and
 * there is no way for them to notice. So the run takes only what it is sure of and
 * leaves the rest here as questions — and the questions are shown as a choice with
 * posters and years, not as a yes/no on a name.
 */
export function MatchImports({
  onDone,
  /**
   * The two things this screen does, injectable for the same reason the core's are:
   * their real implementations talk to the provider, and this component's whole job is
   * the wiring between a person's choice and an irreversible write. A test that cannot
   * see which ID was accepted is not testing the part that matters.
   */
  run = runMatching,
  accept = acceptMatch,
}: {
  onDone?: () => void;
  run?: typeof runMatching;
  accept?: typeof acceptMatch;
}) {
  const [progress, setProgress] = useState<RunProgress>();
  const [running, setRunning] = useState(false);
  const [asks, setAsks] = useState<Proposal[]>([]);
  const [error, setError] = useState<string>();

  async function start() {
    setRunning(true);
    setError(undefined);
    setAsks([]);
    try {
      const result = await run({ onProgress: setProgress });
      // From the result, not only from the progress callback. A run with nothing left
      // to do never enters its loop, so nothing was ever reported and the screen went
      // back to offering the button as though it had not been pressed.
      setProgress(result);
      setAsks(result.asks);
    } catch (e) {
      // Caught and said, rather than thrown out of an event handler. Without this the
      // screen quietly went back to offering the button, which looks identical to a run
      // that found nothing to do — and nothing anywhere said the provider was down.
      setError(e instanceof Error ? e.message : 'Could not reach the metadata provider');
    } finally {
      setRunning(false);
      onDone?.();
    }
  }

  async function choose(proposal: Proposal, providerId: string) {
    await accept(proposal.localId, providerId);
    setAsks((current) => current.filter((a) => a.localId !== proposal.localId));
    onDone?.();
  }

  function skip(proposal: Proposal) {
    // Left unmatched rather than guessed at. It stays in the list for next time, which
    // is the whole point of not forcing a choice.
    setAsks((current) => current.filter((a) => a.localId !== proposal.localId));
  }

  return (
    <section className="flex flex-col gap-3">
      {!running && asks.length === 0 && (
        <button
          onClick={start}
          className="rounded-xl bg-accent px-4 py-3 font-medium text-ink"
        >
          Match imported shows
        </button>
      )}

      {running && (
        <p className="text-sm text-muted" aria-live="polite">
          Matching… {progress?.done ?? 0} of {(progress?.done ?? 0) + (progress?.left ?? 0)},{' '}
          {progress?.matched ?? 0} matched so far.
        </p>
      )}

      {!running && progress && (
        <p className="text-sm text-muted">
          Matched {progress.matched} of {progress.done}.
          {asks.length > 0 && ` ${asks.length} need a decision.`}
        </p>
      )}

      {error && <p className="text-sm text-accent">{error}</p>}

      {asks.map((ask) => (
        <div key={ask.localId} className="rounded-2xl bg-surface p-3">
          <p className="font-medium">{ask.name}</p>
          {/* Said plainly, because the honest reason to ask is not "we failed" — it is
              that more than one answer looked right, and picking one would be a guess
              about somebody's history. */}
          <p className="mb-2 text-sm text-muted">
            More than one show could be this. Picking the wrong one would move your
            history onto it.
          </p>
          <ul className="flex flex-col gap-1.5">
            {ask.candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  onClick={() => choose(ask, candidate.id)}
                  aria-label={`${ask.name} is ${candidate.name}${candidate.year ? `, ${candidate.year}` : ''}`}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-surface-2 p-2 text-left"
                >
                  <Poster
                    url={candidate.posterUrl}
                    name={candidate.name}
                    className="h-14 w-10 shrink-0 rounded-md"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{candidate.name}</span>
                    <span className="block text-xs text-muted">
                      {candidate.year ?? 'Year unknown'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => skip(ask)}
            aria-label={`Leave ${ask.name} unmatched`}
            className="tap mt-2 text-xs text-muted underline"
          >
            None of these
          </button>
        </div>
      ))}
    </section>
  );
}
