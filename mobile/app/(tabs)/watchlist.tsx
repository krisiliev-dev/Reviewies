import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@reviewies/core/data/db';
import { removeFromWatchlist } from '@reviewies/core/data/repo';
import { Poster } from '../../src/ui/Poster';
import { radius, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';

/**
 * Things you mean to watch, and why.
 *
 * The note is the point: *"I have ZERO memory for why they're there"* (r/Letterboxd).
 * Nobody else ships it, and a watchlist without one is a list of names you will
 * eventually delete unread.
 */
export default function WatchlistScreen() {
  const items = useLive(async () => {
    const list = await db.watchlist.orderBy('addedAt').reverse().toArray();
    return Promise.all(
      list.map(async (item) => ({ item, title: await db.titles.get(item.titleId) })),
    );
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Watchlist</Text>

        {items?.length === 0 && (
          <Text style={styles.empty}>
            Nothing saved yet. Add something from Search, with a note about why.
          </Text>
        )}

        {items?.map(({ item, title }) => (
          <Row
            key={item.titleId}
            titleId={item.titleId}
            name={title?.name ?? item.titleId}
            year={title?.year}
            posterUrl={title?.posterUrl}
            note={item.note}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  titleId,
  name,
  year,
  posterUrl,
  note,
}: {
  titleId: string;
  name: string;
  year?: number;
  posterUrl?: string;
  note?: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.push(`/title/${encodeURIComponent(titleId)}`)}>
        <Poster url={posterUrl} name={name} />
      </Pressable>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        {year ? <Text style={styles.year}>{year}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Pressable onPress={() => removeFromWatchlist(titleId)} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  content: { padding: 16, gap: 10 },
  heading: { color: theme.text, fontSize: 30, fontWeight: '700', marginBottom: 8 },
  empty: { color: theme.muted, fontSize: 15, lineHeight: 22 },
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
  note: { color: theme.text, fontSize: 13, fontStyle: 'italic' },
  remove: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline', marginTop: 2 },
});
