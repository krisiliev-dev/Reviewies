import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSuggestions, type Suggestion } from '@reviewies/core/discover/recommend';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { db } from '@reviewies/core/data/db';
import { COPY } from '@reviewies/core/copy';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import { TMDB_ATTRIBUTION } from '@reviewies/core/metadata/provider';
import { Poster } from '../../src/ui/Poster';
import { radius, theme } from '../../src/ui/theme';
import { Button } from '../../src/ui/Button';

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
        <Text accessibilityRole="header" style={styles.heading}>Discover</Text>
        <Text style={styles.blurb}>{COPY.discover.blurb}</Text>

        {items === undefined && !error && <ActivityIndicator color={theme.workingFill} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {items?.length === 0 && (
          <Text style={styles.blurb}>{COPY.discover.empty}</Text>
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
      {/* One target, not two. The poster and the title were separate `link`s to the same
          route with the same name, so the card announced "Open Quiet Harbour" twice and a
          screen reader had to try both to learn they were the same place. Doc 6 §5's rule
          is that a row exposes at most one navigation target; the web's copy of this card
          has always had one. Wrapping both makes the target bigger, too. */}
      <Pressable
        onPress={() => router.push(`/title/${encodeURIComponent(item.id)}`)}
        accessibilityRole="link"
        accessibilityLabel={`Open ${item.name}`}
        style={styles.open}
      >
        <Poster url={item.posterUrl} name={item.name} />
        <View style={styles.opened}>
          <Text numberOfLines={1} style={styles.title}>
            {item.name}
          </Text>
          <Text style={styles.year}>
            {item.kind === 'show' ? 'Series' : 'Film'}
            {item.year ? ` · ${item.year}` : ''}
          </Text>
          {/* Saying why is what separates a recommendation from an advert. Inside the
              link because it is about the show; the announced name comes from
              `accessibilityLabel`, so this does not lengthen it. */}
          <Text numberOfLines={2} style={styles.because}>
            {COPY.discover.because(item.because)}
          </Text>
        </View>
      </Pressable>

      <View style={styles.rowBody}>
        {/* Doc 10, second evening: a suggestion here was a link and nothing else, so
            the screen whose whole job is getting something into your library made you
            open the show to do it. The web has offered both since Discover shipped. */}
        <View style={styles.actions}>
          {/* `disabled` on the component drops the fill for an outline and steps the
              label to the tertiary ink. It does NOT fade: `styles.disabled` here was
              `opacity: 0.5`, which is the exact thing `appearance.test.ts` has banned on
              the web since it "gave a maroon block with dark red lettering — it read as
              broken rather than as waiting". The phone had eight of these and no guard. */}
          <Button
            onPress={track}
            disabled={added === 'library'}
            tone="primary"
            label={added === 'library' ? 'Tracking' : 'Track'}
            name={`Track ${item.name}`}
          />
          <Button
            onPress={save}
            disabled={added === 'watchlist'}
            tone="secondary"
            label={added === 'watchlist' ? 'On watchlist' : 'Watchlist'}
            name={`Add ${item.name} to your watchlist`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: 16, gap: 12 },
  heading: { color: theme.ink, fontSize: 30, fontWeight: '700' },
  blurb: { color: theme.inkSecondary, fontSize: 14, marginBottom: 4 },
  error: { color: theme.trouble, fontSize: 14 },
  // A column now: the one link holds the poster and everything about the show, and the
  // two actions sit under it. It was a row of poster-plus-body, with the poster its own
  // link to the same place under the same name.
  row: {
    gap: 8,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    padding: 12,
  },
  open: { flexDirection: 'row', gap: 12 },
  opened: { flex: 1, minWidth: 0, gap: 4 },
  rowBody: { gap: 4 },
  title: { color: theme.ink, fontSize: 16, fontWeight: '600' },
  year: { color: theme.inkSecondary, fontSize: 12 },
  because: { color: theme.inkSecondary, fontSize: 12 },
  attribution: { color: theme.inkSecondary, fontSize: 10, marginTop: 12 },
});
