import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { addToLibrary, addToWatchlist, markWatched } from '@reviewies/core/data/repo';
import { getEpisodesCached, getProvider, getTitleCached, type SearchResult } from '@reviewies/core/metadata/index';
import { SEARCH_TIMEOUT_MS } from '@reviewies/core/metadata/provider';
import { Poster } from '../ui/Poster';
import { AddToList } from '../social/AddToList';
import { Button } from '../ui/Button';

export function Search() {
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
          setError('That took too long. Check your connection and try again.');
          setBusy(false);
        } else if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Search failed');
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
    <div className="p-4">
      <h1 className="mb-3 px-1 text-2xl font-semibold">Search</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Shows, films, anime…"
        className="w-full rounded-none bg-ground-raised px-4 py-3 text-base outline-none placeholder:text-ink-secondary"
        autoFocus
      />

      {busy && <p className="mt-4 px-1 text-sm text-ink-secondary">Searching…</p>}
      {error && (
        <div className="mt-4 flex flex-col items-start gap-2 px-1">
          <p className="text-sm text-trouble" role="status">
            {error}
          </p>
          {/* Something to press. A message with no action is only a nicer way of being
              stuck, which is what "Searching…" for ever already was. */}
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-pill border border-stroke-signal px-4 py-2 text-sm"
          >
            Try again
          </button>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {results.map((r) => (
          <ResultRow key={r.id} result={r} />
        ))}
      </ul>
    </div>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  const [added, setAdded] = useState<'library' | 'watchlist' | 'logged'>();
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
    // Episodes are needed before Up Next can offer anything for this show.
    if (result.kind === 'show') await getEpisodesCached(result.id);
    setAdded('library');
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
    <li className="flex items-start gap-3 rounded-plate bg-ground-raised p-3">
      <Link
        to={`/title/${encodeURIComponent(result.id)}`}
        aria-label={`Open ${result.name}`}
        className="shrink-0"
      >
        <Poster url={result.posterUrl} name={result.name} className="h-24 w-16 rounded-plate" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{result.name}</p>
        <p className="text-xs text-ink-secondary">
          {result.kind === 'show' ? 'Series' : 'Film'}
          {result.year ? ` · ${result.year}` : ''}
        </p>

        {noting ? (
          <div className="mt-2 flex gap-1.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why? e.g. Ana recommended"
              className="min-w-0 flex-1 rounded-none border border-stroke-signal px-3 py-1.5 text-sm outline-none placeholder:text-ink-secondary"
              autoFocus
            />
            <button
              onClick={saveToWatchlist}
              aria-label={`Save ${result.name} to your watchlist`}
              className="rounded-pill bg-action-fill px-3 text-sm font-medium text-action-label"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              onPress={track}
              disabled={added === 'library'}
              tone="primary"
              label={added === 'library' ? 'Tracking' : 'Track'}
              name={`Track ${result.name}`}
            />
            <Button
              onPress={() => setNoting(true)}
              disabled={added === 'watchlist'}
              tone="secondary"
              label={added === 'watchlist' ? 'On watchlist' : 'Watchlist'}
              name={`Add ${result.name} to your watchlist`}
            />
            {/* Films only: "watched" is not a thing you can say about a whole series
                in one tap without lying about which episodes. */}
            {result.kind === 'film' && (
              <Button
                onPress={log}
                disabled={added === 'logged'}
                tone="secondary"
                label={added === 'logged' ? 'Logged' : 'Seen it'}
                name={`Log that you have seen ${result.name}`}
              />
            )}
          </div>
        )}

        {!noting && <AddToList titleId={result.id} kind={result.kind} />}
      </div>
    </li>
  );
}
