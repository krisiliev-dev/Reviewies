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
export function MatchImports({ onDone }: { onDone?: () => void }) {
  const [progress, setProgress] = useState<RunProgress>();
  const [running, setRunning] = useState(false);
  const [asks, setAsks] = useState<Proposal[]>([]);

  async function start() {
    setRunning(true);
    setAsks([]);
    try {
      const result = await runMatching({ onProgress: setProgress });
      setAsks(result.asks);
    } finally {
      setRunning(false);
      onDone?.();
    }
  }

  async function choose(proposal: Proposal, providerId: string) {
    await acceptMatch(proposal.localId, providerId);
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
