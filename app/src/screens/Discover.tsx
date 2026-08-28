import { useCallback, useEffect, useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import { Poster } from '../ui/Poster';
import { Button } from '../ui/Button';
import { Row as BaseRow } from '../ui/Row';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';

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
    <div className="p-s16">
      <Masthead className="px-1">Discover</Masthead>
      <Note className="mb-4 px-1">{COPY.discover.blurb}</Note>

      {error && <p className="px-1 text-s14 text-trouble">{error}</p>}
      {suggestions === undefined && <Note className="px-1">Finding something…</Note>}
      {suggestions?.length === 0 && !error && (
        <Note className="px-1">{COPY.discover.empty}</Note>
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
    <BaseRow
      title={suggestion.name}
      meta={`${suggestion.kind === 'show' ? 'Series' : 'Film'}${suggestion.year ? ` · ${suggestion.year}` : ''}`}
      // Saying why is what separates a recommendation from an advert. In `note` because
      // that is the slot for a sentence about the row rather than a fact about it.
      note={COPY.discover.because(suggestion.because)}
      open={{ name: `Open ${suggestion.name}`, to: `/title/${encodeURIComponent(suggestion.id)}` }}
      lead={
        <Poster
          url={suggestion.posterUrl}
          name={suggestion.name}
         
        />
      }
      under={
        /* Wraps, for the same reason the Up Next row does: at twice the text size two
           controls and a poster are wider than a phone. */
        <div className="flex flex-wrap gap-1.5">
          <Button
            onPress={track}
            disabled={busy}
            tone="primary"
            label="Track"
            name={`Track ${suggestion.name}`}
          />
          <Button
            onPress={save}
            disabled={busy}
            tone="secondary"
            label="Watchlist"
            name={COPY.controls.addToWatchlist(suggestion.name)}
          />
        </div>
      }
    />
  );
}
