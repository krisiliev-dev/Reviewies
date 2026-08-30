import { useEffect, useRef, useState } from 'react';
import { db } from '../data/db';
import { COPY } from '@reviewies/core/copy';
import { alreadyHave, shelfFor, type AlreadyHave } from '@reviewies/core/data/already';
import { addToLibrary, addToWatchlist, markWatched } from '@reviewies/core/data/repo';
import { getEpisodesCached, getProvider, getTitleCached, type SearchResult } from '@reviewies/core/metadata/index';
import { SEARCH_TIMEOUT_MS } from '@reviewies/core/metadata/provider';
import { Poster } from '../ui/Poster';
import { AddToList } from '../social/AddToList';
import { Button } from '../ui/Button';
import { Row as BaseRow } from '../ui/Row';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import { Masthead } from '../ui/Masthead';

export function Search() {
  /*
   * Read once when the screen opens, not as a live subscription.
   *
   * A live query on the library re-renders this screen the instant `track()` writes its
   * row — and `track()` is not finished at that point: `addToLibrary` comes first and
   * `getEpisodesCached` after it. The re-render abandoned that continuation, so the show
   * was tracked with no episodes cached and Up Next said "all caught up" about eighteen
   * unwatched ones. Measured: with this as a live query the phone smoke stops at check 31,
   * without it the same steps pass.
   *
   * One-shot is also what the feature needs. This answers "what did I already have when I
   * opened this screen"; `added` answers "what have I done since", and it wins. Nothing
   * here has to react to a write it made itself.
   */
  const [have, setHave] = useState<AlreadyHave>();
  useEffect(() => {
    void alreadyHave().then(setHave);
  }, []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** Told apart from an abort caused by typing, which is not a failure. */
  const timedOut = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    // Give up rather than say "Searching…" for ever. The deadline itself lives in the
    // core beside the provider — the phone needs the same one.
    timedOut.current = false;
    const giveUp = setTimeout(() => {
      timedOut.current = true;
      controller.abort('timeout');
    }, SEARCH_TIMEOUT_MS);

    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(undefined);
      try {
        setResults(await getProvider().search(q, controller.signal));
      } catch (e) {
        // An abort we asked for is a timeout and has to be said; an abort from the
        // cleanup below is somebody typing again, and says nothing.
        if (timedOut.current) {
          setError(COPY.app.timedOut);
          setBusy(false);
        } else if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : COPY.app.searchFailed);
        }
      } finally {
        clearTimeout(giveUp);
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(giveUp);
    };
  }, [query, attempt]);

  return (
    <div className="p-s16">
      <Masthead className="px-1">Search</Masthead>
      <Field
        label={COPY.fields.search}
        value={query}
        onChange={setQuery}
        placeholder={COPY.fields.searchPlaceholder}
        autoFocus
      />

      {busy && <Note className="mt-4 px-1">Searching…</Note>}
      {error && (
        <div className="mt-4 flex flex-col items-start gap-2 px-1">
          <p className="text-s14 text-trouble" role="status">
            {error}
          </p>
          {/* Something to press. A message with no action is only a nicer way of being
              stuck, which is what "Searching…" for ever already was. */}
          <Button
            onPress={() => setAttempt((n) => n + 1)}
            label={COPY.controls.tryAgain}
            name={COPY.controls.searchAgain}
          />
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {results.map((r) => (
          <ResultRow key={r.id} result={r} have={have} />
        ))}
      </ul>
    </div>
  );
}

function ResultRow({ result, have }: { result: SearchResult; have?: AlreadyHave }) {
  const [added, setAdded] = useState<'library' | 'watchlist' | 'logged'>();
  const shelf = added ?? shelfFor(result, have);
  const [note, setNote] = useState('');
  const [noting, setNoting] = useState(false);

  /**
   * Cache the full title, not just the search result.
   *
   * Search does not return runtime, external IDs, or whether a show has ended — only
   * the detail endpoint does — and `ended` is what lets a finished show complete
   * itself later. The detail call has to come *first*: writing the thin search row
   * would leave a fresh cache entry that `getTitleCached` then happily serves instead
   * of fetching, so the missing fields would never arrive.
   */
  async function cacheTitle() {
    const detail = await getTitleCached(result.id).catch(() => undefined);
    if (detail) return;

    // Offline, or the provider does not know it: keep what search gave us rather
    // than losing the title entirely.
    await db.titles.put({
      id: result.id,
      kind: result.kind,
      name: result.name,
      year: result.year,
      overview: result.overview,
      posterUrl: result.posterUrl,
      fetchedAt: Date.now(),
    });
  }

  /**
   * Log a film as watched without opening its page.
   *
   * Research doc 4 §2.2: *"I try to avoid seeing reviews and ratings of movies before
   * I see them for myself. It's a little hard to do that when I have to go to the page
   * to add it."* Nothing about recording a watch requires reading other people's
   * opinions of it first, so this deliberately does not navigate.
   */
  async function log() {
    // Search results carry no runtime — only the detail endpoint does — and stats are
    // runtime-weighted, so a film logged without one would be counted as a
    // 30-minute default. cacheTitle fetches it; if that fails the watch is still
    // recorded, just unweighted.
    await cacheTitle();
    const detail = await db.titles.get(result.id);
    await markWatched({ targetId: result.id, runtimeMin: detail?.runtimeMin });
    await addToLibrary(result.id, result.kind, 'completed');
    navigator.vibrate?.(10);
    setAdded('logged');
  }

  async function track() {
    await cacheTitle();
    await addToLibrary(result.id, result.kind);
    /*
     * Said before the episodes arrive, not after.
     *
     * This awaited `getEpisodesCached` and only then set the state, so the row read
     * *Track* for as long as the fetch took — one request per season, which for a
     * 1,220-episode show is twenty-four of them and over thirty seconds of a control that
     * looks untouched. §6.151's real-data pass gave up waiting for the label.
     *
     * The show **is** tracked by this line; saying so is not a promise about episodes.
     * They fill behind it, and §6.153 measured that they land whether or not the person
     * stays: tracked, left the screen after 150ms, and the count arrived exactly as it did
     * for somebody who waited. The floating promise is not a shortcut — it is the truth
     * about what depends on what. §6.153.
     */
    setAdded('library');
    // Episodes are needed before Up Next can offer anything for this show, and nothing
    // here has to wait for them. A rejection is the provider's to report, not this row's.
    if (result.kind === 'show') void getEpisodesCached(result.id).catch(() => {});
  }

  async function saveToWatchlist() {
    await db.titles.put({
      id: result.id,
      kind: result.kind,
      name: result.name,
      year: result.year,
      posterUrl: result.posterUrl,
      fetchedAt: Date.now(),
    });
    await addToWatchlist(result.id, result.kind, note.trim() || undefined);
    setAdded('watchlist');
    setNoting(false);
  }

  return (
    <BaseRow
      title={result.name}
      meta={`${result.kind === 'show' ? 'Series' : 'Film'}${result.year ? ` · ${result.year}` : ''}`}
      open={{
        // The poster was the only target and the words beside it were not one.
        name: `Open ${result.name}`,
        to: `/title/${encodeURIComponent(result.id)}`,
      }}
      lead={
        <Poster url={result.posterUrl} name={result.name} />
      }
      under={
        <>
          {noting ? (
            <div className="flex gap-1.5">
              <Field
                size="row"
                label={COPY.controls.noteFor(result.name)}
                value={note}
                onChange={setNote}
                placeholder={COPY.watchlist.notePlaceholder}
                className="min-w-0 flex-1"
                autoFocus
              />
              <Button
                tone="primary"
                label="Save"
                name={COPY.controls.saveToWatchlist(result.name)}
                onPress={saveToWatchlist}
              />
            </div>
          ) : (
            /* Three actions, each naming its own row. The direction's "one action" is a
               naming rule rather than a counting one — see `Row`'s `under` — and these
               three were each added deliberately for a reason doc 4 records. */
            <div className="flex flex-wrap gap-1.5">
              <Button
                onPress={track}
                disabled={shelf === 'library'}
                tone="primary"
                label={shelf === 'library' ? 'Tracking' : COPY.controls.track}
                name={COPY.controls.trackTitle(result.name)}
              />
              <Button
                onPress={() => setNoting(true)}
                disabled={shelf === 'watchlist'}
                tone="secondary"
                label={shelf === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
                name={COPY.controls.addToWatchlist(result.name)}
              />
              {/* Films only: "watched" is not a thing you can say about a whole series
                  in one tap without lying about which episodes. */}
              {result.kind === 'film' && (
                <Button
                  onPress={log}
                  disabled={added === 'logged'}
                  tone="secondary"
                  label={added === 'logged' ? 'Logged' : COPY.controls.seenIt}
                  name={`Log that you have seen ${result.name}`}
                />
              )}
            </div>
          )}

          {!noting && <AddToList titleId={result.id} kind={result.kind} />}
        </>
      }
    />
  );
}
