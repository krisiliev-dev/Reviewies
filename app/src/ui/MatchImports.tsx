import { useEffect, useRef, useState } from 'react';
import {
  acceptMatch,
  runMatching,
  type Proposal,
  type RunProgress,
} from '@reviewies/core/data/reconcile';
import { getProvider, type SearchResult } from '@reviewies/core/metadata/index';
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
 *
 * It starts itself, since doc 10 §4. The button was the first thing somebody saw after
 * importing years of history: an empty Up Next, and a chore. Importing is already a
 * deliberate act and matching is the rest of it, so it follows without being asked, and
 * the only thing that reaches the person is what genuinely could not be decided.
 */
/**
 * Once per session, not once per visit.
 *
 * Up Next mounts this whenever anything is unmatched, and that includes every time
 * somebody returns to the tab. Matching asks the provider once per show, so re-running
 * it on each visit would be a burst of requests to answer a question already answered.
 * Module scope rather than component state because remounting is exactly what has to
 * stop mattering.
 */
let startedThisSession = false;

/** Only for tests, which need each case to look like a fresh launch. */
export function resetAutoMatch(): void {
  startedThisSession = false;
}

export function MatchImports({
  onDone,
  /** Off for the panel shown right after an import, which explains itself first. */
  autoStart = true,
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
  autoStart?: boolean;
  run?: typeof runMatching;
  accept?: typeof acceptMatch;
}) {
  const [progress, setProgress] = useState<RunProgress>();
  const [running, setRunning] = useState(false);
  const [asks, setAsks] = useState<Proposal[]>([]);
  const [error, setError] = useState<string>();

  const startRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    if (!autoStart || startedThisSession) return;
    startedThisSession = true;
    void startRef.current?.();
  }, [autoStart]);

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

  startRef.current = start;

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
          className="rounded-pill bg-accent px-4 py-3 font-medium text-ink"
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
        <div key={ask.localId} className="rounded-plate bg-surface p-3">
          <p className="font-medium">{ask.name}</p>
          {/* Said plainly, because the honest reason to ask is not "we failed" — it is
              that more than one answer looked right, and picking one would be a guess
              about somebody's history.
              …unless there is nothing to choose between, which is a different sentence
              and used to be this one. A screen saying "more than one show could be this"
              above an empty list, whose only control is "None of these", tells somebody
              the opposite of the truth and then offers them nothing but giving up.
              Doc 10 §5. */}
          {ask.candidates.length > 0 ? (
            <p className="mb-2 text-sm text-muted">
              More than one show could be this. Picking the wrong one would move your
              history onto it.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted">
                Nothing came back under that name — it may be listed differently, or be a
                show the provider has never had. You know what it is; search for it.
              </p>
              <FindIt ask={ask} onChosen={(id) => void choose(ask, id)} />
            </>
          )}
          <ul className="flex flex-col gap-1.5">
            {ask.candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  onClick={() => choose(ask, candidate.id)}
                  aria-label={`${ask.name} is ${candidate.name}${candidate.year ? `, ${candidate.year}` : ''}`}
                  className="flex w-full items-center gap-3 rounded-plate bg-surface-2 p-2 text-left"
                >
                  <Poster
                    url={candidate.posterUrl}
                    name={candidate.name}
                    className="h-14 w-10 shrink-0 rounded-plate"
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
            {ask.candidates.length > 0 ? 'None of these' : 'Leave it for now'}
          </button>
        </div>
      ))}
    </section>
  );
}

/**
 * Search for the show yourself, when the matcher had nothing.
 *
 * The person knows what they watched; the matcher only had a string from an export that
 * may have been spelled differently, localised, or belong to a show no provider carries.
 * Asking them is better than the alternative, which was telling them to give up.
 *
 * The same shape as the candidates above on purpose — poster, name, year — because it is
 * the same decision, and choosing here writes the same irreversible match.
 */
function FindIt({ ask, onChosen }: { ask: Proposal; onChosen: (providerId: string) => void }) {
  const [query, setQuery] = useState(ask.name);
  const [results, setResults] = useState<SearchResult[]>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();

  async function look() {
    if (!query.trim()) return;
    setBusy(true);
    setFailed(undefined);
    try {
      setResults(await getProvider().search(query.trim()));
    } catch (e) {
      // Said rather than swallowed: an empty list and a failed request look identical,
      // and one of them is worth trying again.
      setFailed(e instanceof Error ? e.message : 'Could not reach the metadata provider');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-2 flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void look();
        }}
        className="flex gap-1.5"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search for the show ${ask.name} really is`}
          placeholder="Search by name"
          className="min-w-0 flex-1 rounded-none bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-pill bg-accent px-3 text-sm font-medium text-ink disabled:bg-surface-2 disabled:text-muted"
        >
          {busy ? 'Looking…' : 'Search'}
        </button>
      </form>

      {failed && (
        <p className="text-xs text-accent" role="status">
          {failed}
        </p>
      )}

      {results?.length === 0 && !failed && (
        <p className="text-xs text-muted">
          Nothing under that name either. Leaving it unmatched keeps your watches — it
          just has no episode list.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {results?.map((result) => (
          <li key={result.id}>
            <button
              onClick={() => onChosen(result.id)}
              aria-label={`${ask.name} is ${result.name}${result.year ? `, ${result.year}` : ''}`}
              className="flex w-full items-center gap-3 rounded-plate bg-surface-2 p-2 text-left"
            >
              <Poster
                url={result.posterUrl}
                name={result.name}
                className="h-14 w-10 shrink-0 rounded-plate"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm">{result.name}</span>
                <span className="block text-xs text-muted">{result.year ?? 'Year unknown'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
