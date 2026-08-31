import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { alreadyHave, shelfFor, type AlreadyHave } from '@reviewies/core/data/already';
import { addToLibrary, addToWatchlist, markWatched } from '@reviewies/core/data/repo';
import {
  getEpisodesCached,
  getProvider,
  getTitleCached,
  type SearchResult,
} from '@reviewies/core/metadata/index';
import { SEARCH_TIMEOUT_MS } from '@reviewies/core/metadata/provider';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import { boxFacts } from '@reviewies/core/ui/box';
import {
  applyFilters,
  genresOf,
  NO_FILTERS,
  type Filters as FilterSet,
} from '@reviewies/core/discover/filters';
import { AddToList } from '../social/AddToList';
import { Poster } from '../ui/Poster';
import { Browse } from '../ui/Browse';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Filters } from '../ui/Filters';
import { Row as BaseRow } from '../ui/Row';
import { Note } from '../ui/Note';
import { Attribution } from '../ui/Attribution';
import { Masthead } from '../ui/Masthead';
import { useWaitedLongEnough } from '../ui/waiting';
import { QUERY_PARAM, queryFrom } from '@reviewies/core/ui/segments';

/**
 * One surface for *find me something*, in the two shapes that question has.
 *
 * `docs/design/architecture.md` section 5. Search and Discover were two tabs answering one
 * question, split by **how** you were going to answer it — which is a distinction about the
 * app rather than about the person. They are one screen now, and each shape does the job it
 * is right for:
 *
 *  - **Nothing typed** — the shelf. Boxes with genre, year and title on them, grouped by why
 *    they are being suggested, turning over for the synopsis and the actions. Discover is
 *    for *discovering*, and what it was — a list of shows with two buttons on each row — is
 *    a way of adding things, not a way of looking at them.
 *  - **Something typed** — the list. The compact row layout Discover used to have is exactly
 *    right for results: you already know what you are looking for and the job is to find it
 *    in a column and act on it.
 *
 * Filters apply to whichever is showing. Nothing you have watched, are tracking, or have
 * already put on your watchlist appears on the shelf — that exclusion is the most repeated
 * request on Trakt's roadmap and the thing every competitor gets wrong. Search deliberately
 * does *not* exclude those, because looking something up you already have is the point of
 * looking something up.
 */
export function Discover() {
  /**
   * The query is in the address, not in this component.
   *
   * `core/src/ui/segments.ts` owns the spelling and the whole argument; the short version is
   * that a `useState` here is a search react-router throws away. Opening a result pushes the
   * title page, which unmounts this screen, and coming back remounted it with an empty field
   * and the shelf where the results had been — measured at four characters, a press and a
   * mental operation in `docs/research/11-what-a-task-costs.md` §7.2. The phone survived the
   * same trip only because expo-router happens to keep a tab screen mounted, which is luck
   * rather than a decision, and neither side survived a reload or a shared link.
   *
   * `replace`, on every keystroke, for the reason `segments.ts` gives: a history entry per
   * character would make Back a backspace key. And the key is *dropped* when the field is
   * emptied, so clearing a search leaves `/discover` rather than a bookmark of nothing —
   * `queryFrom` reads the two addresses as the same screen, which is the property that has
   * to hold across the platforms.
   */
  const [params, setParams] = useSearchParams();
  const query = queryFrom(params.get(QUERY_PARAM));
  const setQuery = (next: string) =>
    setParams(next ? { [QUERY_PARAM]: next } : {}, { replace: true });
  const [filters, setFilters] = useState<FilterSet>(NO_FILTERS);

  const [suggestions, setSuggestions] = useState<Suggestion[]>();
  const [shelfError, setShelfError] = useState<string>();

  const load = useCallback(async () => {
    setShelfError(undefined);
    try {
      setSuggestions(await getSuggestions());
    } catch (e) {
      setShelfError(e instanceof Error ? e.message : 'Could not load suggestions');
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Read once when the screen opens, not as a live subscription.
   *
   * A live query on the library re-renders this screen the instant `track()` writes its
   * row — and `track()` is not finished at that point: `addToLibrary` comes first and
   * `getEpisodesCached` after it. The re-render abandoned that continuation, so the show
   * was tracked with no episodes cached and Up Next said "all caught up" about eighteen
   * unwatched ones. Measured: with this as a live query the phone smoke stops at check 31,
   * without it the same steps pass.
   */
  const [have, setHave] = useState<AlreadyHave>();
  useEffect(() => {
    void alreadyHave().then(setHave);
  }, []);

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

  const searching = query.trim().length > 0;
  /*
   * The filters narrow whichever half is showing, and the chips offered are taken from
   * whichever half is showing. `genresOf` says why the list is derived rather than fixed: a
   * fixed list is thirty-four chips that empty the screen.
   */
  const waited = useWaitedLongEnough(suggestions === undefined);
  const shelf = suggestions ?? [];
  const genres = genresOf(searching ? results : shelf);
  const shownResults = applyFilters(filters, results);
  const shownShelf = applyFilters(filters, shelf);
  const narrowedToNothing = searching
    ? results.length > 0 && shownResults.length === 0
    : shelf.length > 0 && shownShelf.length === 0;

  return (
    <div className="p-s16">
      <Masthead className="px-1">{COPY.screens.discover}</Masthead>

      {/* The field, at the top of the surface it now belongs to. */}
      <Field
        label={COPY.fields.search}
        value={query}
        onChange={setQuery}
        placeholder={COPY.fields.searchPlaceholder}
      />

      <div className="mt-4">
        <Filters value={filters} onChange={setFilters} genres={genres} />
      </div>

      {searching ? (
        <>
          {busy && <Note className="mt-4 px-1">{COPY.waiting.searching}</Note>}
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
          {narrowedToNothing && <Note className="mt-4 px-1">{COPY.discover.allFiltered}</Note>}

          <ul className="mt-4 flex flex-col gap-2">
            {shownResults.map((r) => (
              <ResultRow key={r.id} result={r} have={have} />
            ))}
          </ul>
        </>
      ) : (
        <>
          {/*
            Two modes, said apart. `getSuggestions` builds from the library and only falls
            back to a chart when that comes back empty, so the feed is entirely one or
            entirely the other — and until §6.169 the screen said the same sentence for both.

            And only where there is a shelf. `emptyStates.ts` excuses this sentence from the
            register on the grounds that it is "drawn above a **full** screen"; drawn above
            an empty one it is a claim about the contents of a list that is not there, and
            `00-discover-empty.png` is two sentences beginning "Nothing" with the real one
            second. Read off `shownShelf` rather than off `suggestions`, so the condition and
            the sentence are about the same boxes — a shelf narrowed to nothing by a filter
            has nothing to describe either, and `allFiltered` below is what that state says.
          */}
          {shownShelf.length > 0 && (
            <Note className="mb-4 px-1">
              {shownShelf[0]?.trending ? COPY.discover.trendingBlurb : COPY.discover.blurb}
            </Note>
          )}

          {shelfError && <p className="px-1 text-s14 text-trouble">{shelfError}</p>}
          {/* 13ms, measured, on a press from /lists — one frame, and a word cannot be read
              in one. `core/src/ui/waiting.ts` has the threshold; the branch stays because
              a shelf that has not been asked for yet is not a shelf that came back empty,
              and `COPY.discover.empty` on the next line is the sentence that would
              otherwise be making that claim. */}
          {suggestions === undefined && waited && <Note className="px-1">{COPY.waiting.loading}</Note>}
          {suggestions?.length === 0 && !shelfError && (
            <Note className="px-1">{COPY.discover.empty}</Note>
          )}
          {narrowedToNothing && <Note className="px-1">{COPY.discover.allFiltered}</Note>}

          <Browse items={shownShelf} onActed={load} />
        </>
      )}

      {/* The phone credited TMDB under its suggestions and this screen did not — the same
          screen, the same data, one platform meeting a licence condition. §6.147. */}
      <Attribution of={['tmdb']} />
    </div>
  );
}

/**
 * A result, as a row.
 *
 * The compact shape Discover used to wear on everything, kept for the half it was always
 * right for. `architecture.md` section 5: browsing is a shelf, finding is a list.
 */
function ResultRow({ result, have }: { result: SearchResult; have?: AlreadyHave }) {
  const [added, setAdded] = useState<'library' | 'watchlist' | 'logged'>();
  const shelf = added ?? shelfFor(result, have);

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
      genres: result.genres,
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

  /**
   * Adds on the press, which is what the control has always been called.
   *
   * This opened a note field instead. Six controls in the product are announced
   * `COPY.controls.addToWatchlist(name)` — *"Add {name} to your watchlist"* — and four of
   * them wrote the row when you pressed them; the two search rows, this one and the
   * phone's, wrote nothing. Measured on a real build and photographed in
   * `design/screens/04-search-noting.png`: the press replaced Track, Seen it and Add to
   * list with a field and a Save, offered **no Cancel**, and left the row with two ways
   * out — commit a watchlist entry you may not have wanted, or leave the screen.
   *
   * Two things internal to this row convicted it rather than a preference. `AddToList` sat
   * on the same row as a *reversible* disclosure (`label={open ? 'Cancel' : ...}`), so one
   * row carried two disclosures and only one could be backed out of. And `TitleDetail.tsx`
   * had already taken this decision and written down why: *"the field is one press away
   * where it belongs rather than a third state"*.
   *
   * The note is not lost, because it was never this screen's to hold. It is *why you saved
   * it*, and §6.167 gave the watchlist row its own "Add a note…" — so `watchlist.empty`'s
   * promise, *"Add something from Discover, then say why you saved it"*, is kept by the two
   * screens it names rather than by a third state on the first of them.
   */
  async function saveToWatchlist() {
    await db.titles.put({
      id: result.id,
      kind: result.kind,
      name: result.name,
      year: result.year,
      posterUrl: result.posterUrl,
      genres: result.genres,
      fetchedAt: Date.now(),
    });
    await addToWatchlist(result.id, result.kind);
    setAdded('watchlist');
  }

  return (
    <BaseRow
      title={result.name}
      /*
        `boxFacts`, not a fifth hand-written copy of it.

        This composed `kind` and `year` inline, and so did the phone's twin, character for
        character — one line, two platforms, punctuated twice, which is exactly the defect
        `boxUnder` was extracted to prevent and which went unnoticed only because the two
        copies happened to agree. `core/src/ui/box.ts` owns the composition; a search result
        carries neither `seasonCount` nor `runtimeMin` — `architecture.md`'s second refusal
        is that a list endpoint does not return them — so the function's tail is empty here
        and the line reads exactly as it did.
      */
      meta={boxFacts(result)}
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
          {/* Three actions, each naming its own row. The direction's "one action" is a
              naming rule rather than a counting one — see `Row`'s `under` — and these
              three were each added deliberately for a reason doc 4 records. */}
          <div className="flex flex-wrap gap-1.5">
            <Button
              onPress={track}
              disabled={shelf === 'library'}
              tone="primary"
              label={shelf === 'library' ? COPY.controls.tracking : COPY.controls.track}
              name={COPY.controls.trackTitle(result.name)}
            />
            {/* Adds, rather than revealing a field that then adds. `saveToWatchlist` above
                has the argument and the photograph. */}
            <Button
              onPress={saveToWatchlist}
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
                label={added === 'logged' ? COPY.controls.logged : COPY.controls.seenIt}
                name={`Log that you have seen ${result.name}`}
              />
            )}
          </div>

          <AddToList titleId={result.id} kind={result.kind} />
        </>
      }
    />
  );
}
