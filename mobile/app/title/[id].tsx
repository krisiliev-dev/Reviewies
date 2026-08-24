import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { db } from '@reviewies/core/data/db';
import { Poster } from '../../src/ui/Poster';
import { theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';

/**
 * A deliberate placeholder while the screens port in order.
 *
 * Up Next and Search both link here, so a missing route is a dead end in the one flow
 * that has to work — which is exactly what happened when this file failed to write and
 * nothing noticed. The smoke check now opens it.
 */
export default function TitleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const titleId = decodeURIComponent(id ?? '');
  const title = useLive(() => db.titles.get(titleId), [titleId]);

  return (
    <>
      <Stack.Screen options={{ title: title?.name ?? 'Title' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Poster url={title?.posterUrl} name={title?.name ?? ''} width={96} height={144} />
          <View style={styles.headerBody}>
            <Text style={styles.title}>{title?.name ?? 'Loading…'}</Text>
            {title?.year ? <Text style={styles.year}>{title.year}</Text> : null}
          </View>
        </View>

        {title?.overview ? <Text style={styles.overview}>{title.overview}</Text> : null}

        <Text style={styles.note}>
          Episodes, ratings, where to watch and content warnings are next in the port.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, backgroundColor: theme.ink, flexGrow: 1 },
  header: { flexDirection: 'row', gap: 16 },
  headerBody: { flex: 1, gap: 4 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700' },
  year: { color: theme.muted, fontSize: 14 },
  overview: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  note: { color: theme.muted, fontSize: 12, fontStyle: 'italic' },
});
