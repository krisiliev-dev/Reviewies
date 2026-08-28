import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@reviewies/core/data/db';
import { addToLibrary, addToWatchlist, markWatched } from '@reviewies/core/data/repo';
import {
  getEpisodesCached,
  getTitleCached,
  getProvider,
} from '@reviewies/core/metadata/index';
import { SEARCH_TIMEOUT_MS, type SearchResult } from '@reviewies/core/metadata/provider';
import { AddToList } from '../../src/social/AddToList';
import { Poster } from '../../src/ui/Poster';
import { border, radius, theme } from '../../src/ui/theme';
import { Button } from '../../src/ui/Button';
import { Row as BaseRow } from '../../src/ui/Row';
import { ROW } from '@reviewies/core/ui/row';
import { alreadyHave, shelfFor, type AlreadyHave } from '@reviewies/core/data/already';
import { COPY } from '@reviewies/core/copy';
import { useLive } from '../../src/useLive';

export default function SearchScreen() {
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.heading}>Search</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Shows, films, anime…"
          placeholderTextColor={theme.inkSecondary}
          style={styles.input}
          autoFocus
          autoCorrect={false}
        />

        {busy && <ActivityIndicator color={theme.workingFill} style={styles.loading} />}
        {error && (
          <View style={styles.failed}>
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
            {/* Something to press. A message with no action is only a nicer way of
                being stuck, which is what a spinner that never stops already was. */}
            <Pressable
              onPress={() => setAttempt((n) => n + 1)}
              style={styles.retry}
              accessibilityRole="button"
              accessibilityLabel="Try that search again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {results.map((result) => (
          <ResultRow key={result.id} result={result} have={have} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultRow({ result, have }: { result: SearchResult; have?: AlreadyHave }) {
  const router = useRouter();
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
      fetchedAt: Date.now(),
    });
  }

  async function track() {
    await cacheTitle();
    await addToLibrary(result.id, result.kind);
    // Episodes are needed before Up Next can offer anything for this show.
    if (result.kind === 'show') await getEpisodesCached(result.id);
    setAdded('library');
  }

  /**
   * Saved *with* the reason, which this screen could not do.
   *
   * The web's search row has opened a note field since the watchlist shipped and the
   * phone's called `addToWatchlist` with nothing — so the phone's own empty watchlist
   * said "Add something from Search, then say why you saved it" over a screen with no
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
      meta={`${result.kind === 'show' ? 'Series' : 'Film'}${result.year ? ` · ${result.year}` : ''}`}
      lead={
        <Poster url={result.posterUrl} name={result.name} width={ROW.lead.width} height={ROW.lead.height} />
      }
      open={{
        // The poster was the only target and the words beside it were not one.
        name: `Open ${result.name}`,
        run: () => router.push(`/title/${encodeURIComponent(result.id)}`),
      }}
      under={
        noting ? (
          <View style={styles.editor}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={COPY.watchlist.notePlaceholder}
              placeholderTextColor={theme.inkSecondary}
              // Not `styles.input`, which is the search box at the top of this screen —
              // a note field wearing it would read as a second place to search.
              style={styles.noteInput}
              autoFocus
              onSubmitEditing={watchlist}
              accessibilityLabel={`Note for ${result.name}`}
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
            label={shelf === 'library' ? 'Tracking' : 'Track'}
            name={`Track ${result.name}`}
          />
          <Button
            onPress={() => setNoting(true)}
            disabled={shelf === 'watchlist'}
            tone="secondary"
            label={shelf === 'watchlist' ? 'On watchlist' : 'Watchlist'}
            name={COPY.controls.addToWatchlist(result.name)}
          />
          {/* Films only: "watched" is not a thing you can say about a whole series in
              one tap without lying about which episodes. */}
          {result.kind === 'film' && (
            <Button
              onPress={log}
              disabled={added === 'logged'}
              tone="secondary"
              label={added === 'logged' ? 'Logged' : 'Seen it'}
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
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: 16, gap: 12 },
  heading: { color: theme.ink, fontSize: 30, fontWeight: '700' },
  input: {
    backgroundColor: theme.groundRaised,
    borderRadius: radius.none,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: theme.ink,
    fontSize: 16,
  },
  // The watchlist screen's note field, because it is the same field.
  editor: { gap: 6, flexDirection: 'row', alignItems: 'center' },
  noteInput: {
    flex: 1,
    color: theme.ink,
    fontSize: 14,
    backgroundColor: theme.groundWell,
    borderRadius: radius.none,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  loading: { marginTop: 12 },
  failed: { gap: 12, alignItems: 'flex-start' },
  retry: {
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  retryText: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  error: { color: theme.trouble, fontSize: 14 },


  under: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
