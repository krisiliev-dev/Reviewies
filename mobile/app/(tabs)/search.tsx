import { useEffect, useState } from 'react';
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
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import {
  getEpisodesCached,
  getTitleCached,
  getProvider,
} from '@reviewies/core/metadata/index';
import type { SearchResult } from '@reviewies/core/metadata/provider';
import { Poster } from '../../src/ui/Poster';
import { radius, theme } from '../../src/ui/theme';

export default function SearchScreen() {
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
    // Debounced so typing does not fire a request per keystroke.
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(undefined);
      try {
        setResults(await getProvider().search(q, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Search failed');
        }
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
        {error && <Text style={styles.error}>{error}</Text>}

        {results.map((result) => (
          <ResultRow key={result.id} result={result} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  const router = useRouter();
  const [added, setAdded] = useState<'library' | 'watchlist'>();

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
        </View>
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

  actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
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
