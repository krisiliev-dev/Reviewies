import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { addToLibrary, addToWatchlist } from '../data/repo';
import { getEpisodesCached, provider, type SearchResult } from '../metadata';
import { Poster } from '../ui/Poster';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(undefined);
      try {
        setResults(await provider.search(q, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="p-4">
      <h1 className="mb-3 px-1 text-2xl font-semibold">Search</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Shows, films, anime…"
        className="w-full rounded-xl bg-surface px-4 py-3 text-base outline-none placeholder:text-muted"
        autoFocus
      />

      {busy && <p className="mt-4 px-1 text-sm text-muted">Searching…</p>}
      {error && <p className="mt-4 px-1 text-sm text-accent">{error}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {results.map((r) => (
          <ResultRow key={r.id} result={r} />
        ))}
      </ul>
    </div>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  const [added, setAdded] = useState<'library' | 'watchlist'>();
  const [note, setNote] = useState('');
  const [noting, setNoting] = useState(false);

  async function track() {
    await db.titles.put({
      id: result.id,
      kind: result.kind,
      name: result.name,
      year: result.year,
      overview: result.overview,
      posterUrl: result.posterUrl,
      fetchedAt: Date.now(),
    });
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
    <li className="flex items-start gap-3 rounded-2xl bg-surface p-2.5">
      <Link to={`/title/${encodeURIComponent(result.id)}`} className="shrink-0">
        <Poster url={result.posterUrl} name={result.name} className="h-24 w-16 rounded-lg" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{result.name}</p>
        <p className="text-xs text-muted">
          {result.kind === 'show' ? 'Series' : 'Film'}
          {result.year ? ` · ${result.year}` : ''}
        </p>

        {noting ? (
          <div className="mt-2 flex gap-1.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why? e.g. Ana recommended"
              className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted"
              autoFocus
            />
            <button onClick={saveToWatchlist} className="rounded-lg bg-accent px-3 text-sm font-medium text-ink">
              Save
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={track}
              disabled={added === 'library'}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
            >
              {added === 'library' ? 'Tracking' : 'Track'}
            </button>
            <button
              onClick={() => setNoting(true)}
              disabled={added === 'watchlist'}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted disabled:opacity-50"
            >
              {added === 'watchlist' ? 'On watchlist' : 'Watchlist'}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
