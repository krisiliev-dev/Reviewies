import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
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

  useEffect(() => {
    let cancelled = false;
    void getSuggestions().then(
      (result: Suggestion[]) => !cancelled && setItems(result),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load'),
    );
    return () => {
      cancelled = true;
    };
  }, []);

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

        {items?.map((item) => <Row key={item.id} item={item} />)}

        <Text style={styles.attribution}>{TMDB_ATTRIBUTION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ item }: { item: Suggestion }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/title/${encodeURIComponent(item.id)}`)}
      accessibilityRole="link"
      accessibilityLabel={`Open ${item.name}`}
    >
      <Poster url={item.posterUrl} name={item.name} />
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.title}>
          {item.name}
        </Text>
        <Text style={styles.year}>
          {item.kind === 'show' ? 'Series' : 'Film'}
          {item.year ? ` · ${item.year}` : ''}
        </Text>
        {/* Saying why is what separates a recommendation from an advert. */}
        <Text numberOfLines={2} style={styles.because}>
          Because you watched {item.because.join(' and ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
