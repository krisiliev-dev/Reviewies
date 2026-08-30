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
import { Attribution } from '../ui/Attribution';
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
      <Masthead className="px-1">{COPY.screens.discover}</Masthead>
      {/*
        Two modes, said apart. `getSuggestions` builds from the library and only falls back
        to a chart when that comes back empty, so the feed is entirely one or entirely the
        other — and until §6.169 the screen said the same sentence for both.
      */}
      <Note className="mb-4 px-1">
        {suggestions?.[0]?.trending ? COPY.discover.trendingBlurb : COPY.discover.blurb}
      </Note>

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

      {/* The phone credited TMDB under its suggestions and this screen did not — the same
          screen, the same data, one platform meeting a licence condition. §6.147. */}
      <Attribution of={['tmdb']} />
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
  /*
   * What the press did, kept so the control can say it. §6.176 found the web had no such
   * state at all: both buttons stayed on their original labels and re-enabled themselves,
   * so pressing "Watchlist" twice looked exactly like pressing it once and nothing on the
   * screen confirmed the first press. The phone has disabled-and-relabelled since it
   * shipped; §6.51 says the better version wins, and this is the web taking it.
   */
  const [added, setAdded] = useState<'library' | 'watchlist'>();

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
    /*
     * The feed reloads before the episodes land, for the reason `Search`'s `track` gives:
     * the show is tracked by the line above, and waiting on twenty-four season requests to
     * say so is a control that looks untouched for half a minute. §6.153.
     */
    await addToLibrary(suggestion.id, suggestion.kind);
    setAdded('library');
    // Reload so the newly tracked title drops out of the feed immediately.
    onActed();
    if (suggestion.kind === 'show') void getEpisodesCached(suggestion.id).catch(() => {});
  }

  async function save() {
    setBusy(true);
    await cache();
    await addToWatchlist(suggestion.id, suggestion.kind, `Suggested by ${suggestion.because[0]}`);
    setAdded('watchlist');
    onActed();
  }

  return (
    <BaseRow
      title={suggestion.name}
      meta={`${suggestion.kind === 'show' ? COPY.kinds.show : COPY.kinds.film}${suggestion.year ? ` · ${suggestion.year}` : ''}`}
      /*
       * Saying why is what separates a recommendation from an advert. In `note` because
       * that is the slot for a sentence about the row rather than a fact about it. A
       * trending row is not *because* of anything you watched, and saying it was is a false
       * sentence on the one line of the card a person actually reads. §6.152.
       *
       * And a trending row now says **nothing** here rather than *Popular right now*.
       * §6.169 photographed thirty rows each carrying that same line: a sentence repeated
       * on every row it appears on is not the line that distinguishes them, it is the
       * screen's mode — and `getSuggestions` is all-or-nothing, so the mode belongs once at
       * the top of the screen, which is where `trendingBlurb` puts it.
       */
      note={
        suggestion.trending
          ? undefined
          : COPY.discover.because(suggestion.because, suggestion.becauseWatched)
      }
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
            disabled={busy || added === 'library'}
            tone="primary"
            label={added === 'library' ? COPY.controls.tracking : COPY.controls.track}
            name={COPY.controls.trackTitle(suggestion.name)}
          />
          <Button
            onPress={save}
            disabled={busy || added === 'watchlist'}
            tone="secondary"
            label={added === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
            name={COPY.controls.addToWatchlist(suggestion.name)}
          />
        </div>
      }
    />
  );
}
