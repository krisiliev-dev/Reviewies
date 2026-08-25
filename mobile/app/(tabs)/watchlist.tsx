import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@reviewies/core/data/db';
import { removeFromWatchlist, setWatchlistNote } from '@reviewies/core/data/repo';
import { Poster } from '../../src/ui/Poster';
import { radius, tap, theme } from '../../src/ui/theme';
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
            Nothing saved yet. Add something from Search, then say why you saved it.
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');

  async function save() {
    await setWatchlistNote(titleId, draft.trim());
    setEditing(false);
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push(`/title/${encodeURIComponent(titleId)}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}`}
      >
        <Poster url={posterUrl} name={name} />
      </Pressable>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        {year ? <Text style={styles.year}>{year}</Text> : null}

        {editing ? (
          <View style={styles.editor}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Why did you save this?"
              placeholderTextColor={theme.muted}
              style={styles.input}
              multiline
              autoFocus
              onSubmitEditing={save}
              accessibilityLabel={`Note for ${name}`}
            />
            <Pressable
              onPress={save}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Save note for ${name}`}
              style={tap}
            >
              <Text style={styles.save}>Save</Text>
            </Pressable>
          </View>
        ) : (
          // Tappable whether or not there is a note yet. The reason for saving
          // something is the whole value of a watchlist — "I have ZERO memory for why
          // they're there" — and a note you can read but never write is a note nobody
          // has. Until now the phone could only display what the web wrote.
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={8}
            accessibilityRole="button"
            // Every row on this screen says "Add a note". Which show is only knowable
            // from what is above it, which a screen reader does not read along with it.
            accessibilityLabel={note ? `Edit note for ${name}` : `Add a note for ${name}`}
            style={tap}
          >
            <Text style={note ? styles.note : styles.addNote}>
              {note || 'Add a note'}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => removeFromWatchlist(titleId)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name} from your watchlist`}
          style={tap}
        >
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
  addNote: { color: theme.muted, fontSize: 13, textDecorationLine: 'underline' },
  editor: { gap: 6 },
  input: {
    color: theme.text,
    fontSize: 14,
    backgroundColor: theme.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  save: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  remove: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline', marginTop: 2 },
});
