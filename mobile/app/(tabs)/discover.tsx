import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import {
  applyFilters,
  genresOf,
  NO_FILTERS,
  type Filters as FilterSet,
} from '@reviewies/core/discover/filters';
import { addToLibrary, addToWatchlist, markWatched } from '@reviewies/core/data/repo';
import { alreadyHave, shelfFor, type AlreadyHave } from '@reviewies/core/data/already';
import { db } from '@reviewies/core/data/db';
import { COPY } from '@reviewies/core/copy';
import {
  getEpisodesCached,
  getTitleCached,
  getProvider,
} from '@reviewies/core/metadata/index';
import { SEARCH_TIMEOUT_MS, type SearchResult } from '@reviewies/core/metadata/provider';
import { AddToList } from '../../src/social/AddToList';
import { Poster } from '../../src/ui/Poster';
import { Browse } from '../../src/ui/Browse';
import { Filters } from '../../src/ui/Filters';
import { theme } from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Row as BaseRow } from '../../src/ui/Row';
import { Note } from '../../src/ui/Note';
import { Attribution } from '../../src/ui/Attribution';
import { Masthead } from '../../src/ui/Masthead';

/**
 * One surface for *find me something*, in the two shapes that question has.
 *
 * `docs/design/architecture.md` section 5, and the web's twin at `app/src/screens/Discover.tsx`
 * carries the reasoning. Search and Discover were two tabs answering one question, split by
 * **how** you were going to answer it. They are one screen now:
 *
 *  - **Nothing typed** — the shelf of boxes, which is what browsing wants.
 *  - **Something typed** — the list, which is what finding wants.
 *
 * Exclusion is the shelf's purpose rather than a filter on top of it — being recommended
 * something you finished last week was the single most repeated complaint on Trakt's
 * roadmap. Search does not exclude, because looking up something you already have is most
 * of why anybody searches after importing a decade of history.
 */
export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterSet>(NO_FILTERS);

  const [items, setItems] = useState<Suggestion[]>();
  const [shelfError, setShelfError] = useState<string>();

  /**
   * Reloaded after acting, so something you have just tracked leaves the shelf.
   *
   * The whole point of the shelf is that it excludes what you have seen; a suggestion
   * that stays put after you take it makes the screen look like it did not hear you.
   */
  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    void getSuggestions().then(
      (result: Suggestion[]) => !cancelled && setItems(result),
      (e: unknown) =>
        !cancelled && setShelfError(e instanceof Error ? e.message : 'Could not load'),
    );
    return () => {
      cancelled = true;
    };
  }, [round]);

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
    // Give up rather than spin for ever: a request that hangs never rejects, so without
    // this the failure people actually meet — a network that has stopped answering —
    // leaves the spinner turning with nothing to press. The web has had this deadline
    // since doc 10 §6; the phone, which is the platform most likely to be on a bad
    // connection, did not.
    timedOut.current = false;
    const giveUp = setTimeout(() => {
      timedOut.current = true;
      controller.abort();
    }, SEARCH_TIMEOUT_MS);

    // Debounced so typing does not fire a request per keystroke.
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(undefined);
      try {
        setResults(await getProvider().search(q, controller.signal));
      } catch (e) {
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
  const shelf = items ?? [];
  const genres = genresOf(searching ? results : shelf);
  const shownResults = applyFilters(filters, results);
  const shownShelf = applyFilters(filters, shelf);
  const narrowedToNothing = searching
    ? results.length > 0 && shownResults.length === 0
    : shelf.length > 0 && shownShelf.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Masthead>{COPY.screens.discover}</Masthead>

        {/* The field, at the top of the surface it now belongs to. */}
        <Field
          label={COPY.fields.search}
          value={query}
          onChange={setQuery}
          placeholder={COPY.fields.searchPlaceholder}
          autoCorrect={false}
        />

        <Filters value={filters} onChange={setFilters} genres={genres} />

        {searching ? (
          <>
            {/*
              The spinner *and* the sentence. A bare `ActivityIndicator` announces nothing to
              a screen reader and does not say what is being waited on; the web had said
              "Searching…" here since it was written. §6.104's rule — a state has to be
              legible as words, not only as motion.
            */}
            {busy && (
              <>
                <ActivityIndicator color={theme.workingMark} style={styles.loading} />
                <Note accessibilityLiveRegion="polite">{COPY.waiting.searching}</Note>
              </>
            )}
            {error && (
              <View style={styles.failed}>
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
                {/* Something to press. A message with no action is only a nicer way of
                    being stuck, which is what a spinner that never stops already was. */}
                <Button
                  onPress={() => setAttempt((n) => n + 1)}
                  label={COPY.controls.tryAgain}
                  name={COPY.controls.searchAgain}
                />
              </View>
            )}
            {narrowedToNothing && <Note>{COPY.discover.allFiltered}</Note>}

            {shownResults.map((result) => (
              <ResultRow key={result.id} result={result} have={have} />
            ))}
          </>
        ) : (
          <>
            {/* Two modes, said apart, and only where there is a shelf to describe. The
                web's copy of this has the reasoning; the short version is that
                `emptyStates.ts` excuses this sentence on the grounds that it is drawn above
                a *full* screen, and above an empty one it is the first of two sentences
                beginning "Nothing". */}
            {shownShelf.length > 0 && (
              <Note>
                {shownShelf[0]?.trending ? COPY.discover.trendingBlurb : COPY.discover.blurb}
              </Note>
            )}

            {/* The spinner *and* the sentence, as the search branch above already does and
                as this one did not. §6.104: a state has to be legible as words rather than
                only as motion — a bare `ActivityIndicator` announces nothing and does not
                say what is being waited for. The web has said `loading` here all along, so
                this is §6.51's rule rather than a new decision. */}
            {items === undefined && !shelfError && (
              <>
                <ActivityIndicator color={theme.workingMark} />
                <Note accessibilityLiveRegion="polite">{COPY.waiting.loading}</Note>
              </>
            )}
            {shelfError && <Text style={styles.error}>{shelfError}</Text>}
            {items?.length === 0 && <Note>{COPY.discover.empty}</Note>}
            {narrowedToNothing && <Note>{COPY.discover.allFiltered}</Note>}

            <Browse items={shownShelf} onActed={reload} />
          </>
        )}

        <Attribution of={['tmdb']} />
      </ScrollView>
    </SafeAreaView>
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
  const [note, setNote] = useState('');
  const [noting, setNoting] = useState(false);
  /*
   * What you already have, from the store rather than from this session.
   *
   * `added` alone was the whole of it: a `useState` set when you press a button, so a
   * search always offered **Track** — including for the three hundred shows somebody had
   * just imported, which is most of the reason to search at all when you have brought a
   * decade of history with you. The write is idempotent, so pressing it did no damage; it
   * simply appeared to do nothing.
   *
   * `alreadyHave` answers by ID and, for rows that have no provider ID yet, by name. The
   * local state still wins, so pressing a button reads immediately.
   */
  const shelf = added ?? shelfFor(result, have);

  /**
   * Cache the full title, not just the search result.
   *
   * Search does not return runtime, external IDs, or whether a show has ended — only
   * the detail endpoint does — and `ended` is what lets a finished show complete
   * itself later. The detail call comes first: writing the thin search row would leave
   * a fresh cache entry that `getTitleCached` then serves instead of fetching.
   */
  async function cacheTitle() {
    const detail = await getTitleCached(result.id).catch(() => undefined);
    if (detail) return;
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
   * Saved *with* the reason, which this screen could not do.
   *
   * The web's search row has opened a note field since the watchlist shipped and the
   * phone's called `addToWatchlist` with nothing — so the phone's own empty watchlist
   * said "Add something from Discover, then say why you saved it" over a screen with no
   * way to say why. A screen naming a way out it does not have is §6.50's class, and
   * this one was naming it about itself.
   *
   * The note is most of what a watchlist is for — doc 4: *"I have ZERO memory for why
   * they're there"* — and a note you can read but never write is a note nobody has.
   */
  async function watchlist() {
    await cacheTitle();
    await addToWatchlist(result.id, result.kind, note.trim() || undefined);
    setAdded('watchlist');
    setNoting(false);
  }

  /**
   * Log a film as watched without opening its page.
   *
   * Research doc 4 §2.2: *"I try to avoid seeing reviews and ratings of movies before
   * I see them for myself. It's a little hard to do that when I have to go to the page
   * to add it."* Recording a watch does not require reading anybody's opinion of it
   * first, so this deliberately does not navigate. The web has had it since Search
   * shipped; the phone made you open the film.
   */
  async function log() {
    // Search results carry no runtime and stats are runtime-weighted, so a film logged
    // without one would count as the 30-minute default. cacheTitle fetches the detail;
    // if that fails the watch is still recorded, just unweighted.
    await cacheTitle();
    const detail = await db.titles.get(result.id);
    await markWatched({ targetId: result.id, runtimeMin: detail?.runtimeMin });
    await addToLibrary(result.id, result.kind, 'completed');
    setAdded('logged');
  }

  return (
    <BaseRow
      title={result.name}
      meta={`${result.kind === 'show' ? COPY.kinds.show : COPY.kinds.film}${result.year ? ` · ${result.year}` : ''}`}
      lead={
        <Poster url={result.posterUrl} name={result.name} />
      }
      open={{
        // The poster was the only target and the words beside it were not one.
        name: `Open ${result.name}`,
        to: `/title/${encodeURIComponent(result.id)}`,
      }}
      under={
        noting ? (
          <View style={styles.editor}>
            {/*
              `size="row"`, not `page`: this is the note beside a result rather than the
              search box at the top of the screen, and a note field wearing the page density
              read as a second place to search.
            */}
            <Field
              size="row"
              label={COPY.controls.noteFor(result.name)}
              value={note}
              onChange={setNote}
              placeholder={COPY.watchlist.notePlaceholder}
              autoFocus
              onSubmitEditing={watchlist}
              style={styles.grow}
            />
            <Button
              size="inline"
              tone="primary"
              label="Save"
              name={COPY.controls.saveToWatchlist(result.name)}
              onPress={watchlist}
            />
          </View>
        ) : (
        <View style={styles.under}>
          {/* Three actions, each naming its own row. The direction's "one action" is a
              naming rule rather than a counting one — see `Row`'s `under` — and each of
              these was added deliberately for a reason doc 4 records.

              Labelled with the title, because "Watchlist" on its own is what the tab bar
              also says: ambiguous to a screen reader working down the page, and ambiguous
              to anything else trying to name one particular control. */}
          <Button
            onPress={track}
            disabled={shelf === 'library'}
            tone="primary"
            label={shelf === 'library' ? COPY.controls.tracking : COPY.controls.track}
            name={COPY.controls.trackTitle(result.name)}
          />
          <Button
            onPress={() => setNoting(true)}
            disabled={shelf === 'watchlist'}
            tone="secondary"
            label={shelf === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
            name={COPY.controls.addToWatchlist(result.name)}
          />
          {/* Films only: "watched" is not a thing you can say about a whole series in
              one tap without lying about which episodes. */}
          {result.kind === 'film' && (
            <Button
              onPress={log}
              disabled={added === 'logged'}
              tone="secondary"
              label={added === 'logged' ? COPY.controls.logged : COPY.controls.seenIt}
              name={`Log that you have seen ${result.name}`}
            />
          )}

          {/* The web's result row has offered this since lists shipped; the phone's made
              you open the title first. Not a route and not a core call from this file — it
              is a component, which is why §6.50's guard could not see it and §6.63's,
              which compares what each screen renders, could. */}
          <AddToList titleId={result.id} kind={result.kind} />
        </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  /** A field that shares its row with a button. Layout, which the call site owns. */
  grow: { flex: 1, minWidth: 0 },
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: SCREEN.edge, gap: 12 },
  // The watchlist screen's note field, because it is the same field.
  editor: { gap: 6, flexDirection: 'row', alignItems: 'center' },
  loading: { marginTop: 12 },
  failed: { gap: 12, alignItems: 'flex-start' },
  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },

  under: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
