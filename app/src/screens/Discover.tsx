import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import { Poster } from '../ui/Poster';

/**
 * Discovery.
 *
 * Nothing you have watched, are tracking, or have already put on your watchlist
 * appears here. That exclusion is the most repeated request on Trakt's roadmap and
 * the thing every competitor gets wrong.
 */
export function Discover() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setSuggestions(await getSuggestions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load suggestions');
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4">
      <h1 className="mb-1 px-1 text-2xl font-semibold">Discover</h1>
      <p className="mb-4 px-1 text-sm text-ink-secondary">{COPY.discover.blurb}</p>

      {error && <p className="px-1 text-sm text-trouble">{error}</p>}
      {suggestions === undefined && <p className="px-1 text-ink-secondary">Finding something…</p>}
      {suggestions?.length === 0 && !error && (
        <p className="px-1 text-ink-secondary">{COPY.discover.empty}</p>
      )}

      <ul className="flex flex-col gap-2">
        {suggestions?.map((s) => (
          <SuggestionRow key={s.id} suggestion={s} onActed={load} />
        ))}
      </ul>
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onActed,
}: {
  suggestion: Suggestion;
  onActed: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function cache() {
    await db.titles.put({
      id: suggestion.id,
      kind: suggestion.kind,
      name: suggestion.name,
      year: suggestion.year,
      overview: suggestion.overview,
      posterUrl: suggestion.posterUrl,
      fetchedAt: Date.now(),
    });
  }

  async function track() {
    setBusy(true);
    await cache();
    await addToLibrary(suggestion.id, suggestion.kind);
    if (suggestion.kind === 'show') await getEpisodesCached(suggestion.id);
    // Reload so the newly tracked title drops out of the feed immediately.
    onActed();
  }

  async function save() {
    setBusy(true);
    await cache();
    await addToWatchlist(suggestion.id, suggestion.kind, `Suggested by ${suggestion.because[0]}`);
    onActed();
  }

  return (
    <li className="flex items-start gap-3 rounded-plate bg-ground-raised p-3">
      <Link
        to={`/title/${encodeURIComponent(suggestion.id)}`}
        aria-label={`Open ${suggestion.name}`}
        className="shrink-0"
      >
        <Poster url={suggestion.posterUrl} name={suggestion.name} className="h-24 w-16 rounded-plate" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{suggestion.name}</p>
        <p className="text-xs text-ink-secondary">
          {suggestion.kind === 'show' ? 'Series' : 'Film'}
          {suggestion.year ? ` · ${suggestion.year}` : ''}
        </p>
        <p className="mt-1 truncate text-xs text-ink-secondary">
          {COPY.discover.because(suggestion.because)}
        </p>

        {/* Wraps, for the same reason the Up Next row does. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={track}
            disabled={busy}
            aria-label={`Track ${suggestion.name}`}
            className="rounded-pill bg-action-fill px-3 py-1.5 text-sm font-medium text-action-label disabled:bg-ground-well disabled:text-ink-secondary"
          >
            Track
          </button>
          <button
            onClick={save}
            disabled={busy}
            aria-label={`Add ${suggestion.name} to your watchlist`}
            className="rounded-pill border border-stroke-signal px-3 py-1.5 text-sm text-ink-secondary disabled:opacity-50"
          >
            Watchlist
          </button>
        </div>
      </div>
    </li>
  );
}
