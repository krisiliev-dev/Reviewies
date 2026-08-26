import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { db } from '@reviewies/core/data/db';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import { TMDB_ATTRIBUTION } from '@reviewies/core/metadata/provider';
import { Poster } from '../../src/ui/Poster';
import { radius, theme } from '../../src/ui/theme';

/**
 * Suggestions that exclude what you have already seen.
 *
 * Exclusion is the module's purpose rather than a filter on top of it — being
 * recommended something you finished last week was the single most repeated complaint
 * on Trakt's roadmap.
 */
export default function DiscoverScreen() {
  const [items, setItems] = useState<Suggestion[]>();
  const [error, setError] = useState<string>();

  /**
   * Reloaded after acting, so something you have just tracked leaves the feed.
   *
   * The whole point of this screen is that it excludes what you have seen; a suggestion
   * that stays put after you take it makes the screen look like it did not hear you.
   */
  const [round, setRound] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void getSuggestions().then(
      (result: Suggestion[]) => !cancelled && setItems(result),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load'),
    );
    return () => {
      cancelled = true;
    };
  }, [round]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Discover</Text>
        <Text style={styles.blurb}>Nothing you have already watched.</Text>

        {items === undefined && !error && <ActivityIndicator color={theme.accent} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {items?.length === 0 && (
          <Text style={styles.blurb}>Track something first and suggestions will follow.</Text>
        )}

        {items?.map((item) => <Row key={item.id} item={item} onActed={() => setRound((n) => n + 1)} />)}

        <Text style={styles.attribution}>{TMDB_ATTRIBUTION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ item, onActed }: { item: Suggestion; onActed: () => void }) {
  const router = useRouter();
  const [added, setAdded] = useState<'library' | 'watchlist'>();

  /**
   * A suggestion carries everything a title row needs, and nothing has stored it.
   *
   * Acting on one has to write the title first or the library gains an id with no name
   * — the same cache step the web's Discover does.
   */
  async function cache() {
    await db.titles.put({
      id: item.id,
      kind: item.kind,
      name: item.name,
      year: item.year,
      overview: item.overview,
      posterUrl: item.posterUrl,
      fetchedAt: Date.now(),
    });
  }

  async function track() {
    await cache();
    await addToLibrary(item.id, item.kind);
    if (item.kind === 'show') await getEpisodesCached(item.id);
    setAdded('library');
    onActed();
  }

  async function save() {
    await cache();
    await addToWatchlist(item.id, item.kind, `Suggested by ${item.because[0]}`);
    setAdded('watchlist');
    onActed();
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push(`/title/${encodeURIComponent(item.id)}`)}
        accessibilityRole="link"
        accessibilityLabel={`Open ${item.name}`}
      >
        <Poster url={item.posterUrl} name={item.name} />
      </Pressable>

      <View style={styles.rowBody}>
        <Pressable
          onPress={() => router.push(`/title/${encodeURIComponent(item.id)}`)}
          accessibilityRole="link"
          accessibilityLabel={`Open ${item.name}`}
        >
          <Text numberOfLines={1} style={styles.title}>
            {item.name}
          </Text>
          <Text style={styles.year}>
            {item.kind === 'show' ? 'Series' : 'Film'}
            {item.year ? ` · ${item.year}` : ''}
          </Text>
        </Pressable>
        {/* Saying why is what separates a recommendation from an advert. */}
        <Text numberOfLines={2} style={styles.because}>
          Because you watched {item.because.join(' and ')}
        </Text>

        {/* Doc 10, second evening: a suggestion here was a link and nothing else, so
            the screen whose whole job is getting something into your library made you
            open the show to do it. The web has offered both since Discover shipped. */}
        <View style={styles.actions}>
          <Pressable
            onPress={track}
            disabled={added === 'library'}
            accessibilityRole="button"
            accessibilityLabel={`Track ${item.name}`}
            style={[styles.primary, added === 'library' && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {added === 'library' ? 'Tracking' : 'Track'}
            </Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={added === 'watchlist'}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name} to your watchlist`}
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 24,
    justifyContent: 'center',
  },
  primaryText: { color: theme.ink, fontSize: 13, fontWeight: '600' },
  secondary: {
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 24,
    justifyContent: 'center',
  },
  secondaryText: { color: theme.muted, fontSize: 13 },
  disabled: { opacity: 0.5 },
  screen: { flex: 1, backgroundColor: theme.ink },
  content: { padding: 16, gap: 10 },
  heading: { color: theme.text, fontSize: 30, fontWeight: '700' },
  blurb: { color: theme.muted, fontSize: 14, marginBottom: 4 },
  error: { color: theme.accent, fontSize: 14 },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: radius.xl,
    padding: 10,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: theme.text, fontSize: 16, fontWeight: '600' },
  year: { color: theme.muted, fontSize: 12 },
  because: { color: theme.muted, fontSize: 12 },
  attribution: { color: theme.muted, fontSize: 10, marginTop: 12 },
});
