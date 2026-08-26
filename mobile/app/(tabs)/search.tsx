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
import { radius, theme } from '../../src/ui/theme';

export default function SearchScreen() {
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
        <Text style={styles.heading}>Search</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Shows, films, anime…"
          placeholderTextColor={theme.muted}
          style={styles.input}
          autoFocus
          autoCorrect={false}
        />

        {busy && <ActivityIndicator color={theme.accent} style={styles.loading} />}
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
          <ResultRow key={result.id} result={result} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  const router = useRouter();
  const [added, setAdded] = useState<'library' | 'watchlist' | 'logged'>();

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

  async function watchlist() {
    await cacheTitle();
    await addToWatchlist(result.id, result.kind);
    setAdded('watchlist');
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
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push(`/title/${encodeURIComponent(result.id)}`)}
        accessibilityRole="link"
        accessibilityLabel={`Open ${result.name}`}
      >
        <Poster url={result.posterUrl} name={result.name} />
      </Pressable>

      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.title}>
          {result.name}
        </Text>
        <Text style={styles.subtitle}>
          {result.kind === 'show' ? 'Series' : 'Film'}
          {result.year ? ` · ${result.year}` : ''}
        </Text>

        <View style={styles.actions}>
          {/* Labelled with the title, because "Watchlist" on its own is what the tab
              bar also says — ambiguous to a screen reader working down the page, and
              ambiguous to anything else trying to name one particular control. */}
          <Pressable
            onPress={track}
            disabled={added === 'library'}
            accessibilityRole="button"
            accessibilityLabel={`Track ${result.name}`}
            style={[styles.primary, added === 'library' && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {added === 'library' ? 'Tracking' : 'Track'}
            </Text>
          </Pressable>
          <Pressable
            onPress={watchlist}
            disabled={added === 'watchlist'}
            accessibilityRole="button"
            accessibilityLabel={`Add ${result.name} to watchlist`}
            style={[styles.secondary, added === 'watchlist' && styles.disabled]}
          >
            <Text style={styles.secondaryText}>
              {added === 'watchlist' ? 'On watchlist' : 'Watchlist'}
            </Text>
          </Pressable>
          {/* Films only: "watched" is not a thing you can say about a whole series in
              one tap without lying about which episodes. */}
          {result.kind === 'film' && (
            <Pressable
              onPress={log}
              disabled={added === 'logged'}
              accessibilityRole="button"
              accessibilityLabel={`Log that you have seen ${result.name}`}
              style={[styles.secondary, added === 'logged' && styles.disabled]}
            >
              <Text style={styles.secondaryText}>
                {added === 'logged' ? 'Logged' : 'Seen it'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* The web's result row has offered this since lists shipped; the phone's made
            you open the title first. Not a route and not a core call from this file — it
            is a component, which is why §6.50's guard could not see it and §6.63's,
            which compares what each screen renders, could. */}
        <AddToList titleId={result.id} kind={result.kind} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  content: { padding: 16, gap: 10 },
  heading: { color: theme.text, fontSize: 30, fontWeight: '700' },
  input: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 16,
  },
  loading: { marginTop: 12 },
  failed: { gap: 10, alignItems: 'flex-start' },
  retry: {
    backgroundColor: theme.surface2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  error: { color: theme.accent, fontSize: 14 },

  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: radius.xl,
    padding: 10,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: theme.text, fontSize: 16, fontWeight: '600' },
  subtitle: { color: theme.muted, fontSize: 12 },

  actions: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  primary: {
    backgroundColor: theme.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  primaryText: { color: theme.ink, fontWeight: '600', fontSize: 14 },
  secondary: {
    backgroundColor: theme.surface2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  secondaryText: { color: theme.muted, fontSize: 14 },
  disabled: { opacity: 0.5 },
});
