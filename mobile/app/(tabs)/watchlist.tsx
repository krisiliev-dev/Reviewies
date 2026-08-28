import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COPY } from '@reviewies/core/copy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@reviewies/core/data/db';
import { removeFromWatchlist, setWatchlistNote } from '@reviewies/core/data/repo';
import { Poster } from '../../src/ui/Poster';
import { Row as BaseRow } from '../../src/ui/Row';
import { ROW } from '@reviewies/core/ui/row';
import { radius, tap, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';
import { Button } from '../../src/ui/Button';

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
        <Text accessibilityRole="header" style={styles.heading}>Watchlist</Text>

        {items?.length === 0 && (
          <View style={styles.emptyBlock}>
            <Text style={styles.empty}>{COPY.watchlist.empty}</Text>
            {/* Naming Search and then not going there is the dead end doc 10 §8 found on
                the web's Calendar: the screen knows exactly what you should do next and
                makes you find it yourself. The web's empty watchlist has had this
                button since it shipped. */}
            <Button to="/search" tone="primary" size="page" label="Find something" name="Find something" />
          </View>
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
    <BaseRow
      title={name}
      meta={year ? String(year) : undefined}
      lead={
        <Poster url={posterUrl} name={name} width={ROW.lead.width} height={ROW.lead.height} />
      }
      open={{
        // Was `Open ${name}` on a `button` role wrapping only the poster, so the words
        // beside it were not a target at all and the role said "does something" rather
        // than "goes somewhere".
        name: `Open ${name}`,
        run: () => router.push(`/title/${encodeURIComponent(titleId)}`),
      }}
      trailing={
        /* The web's slot for a row-level action, which this screen was not using: Remove
           sat under the note, stacked, in the same secondary underline the note affordance
           uses — two row controls in one slot with nothing telling them apart. See the
           web's copy of this for why the tone is `quiet` and not `destructive`. */
        <Button
          size="inline"
          tone="quiet"
          label="Remove"
          name={COPY.controls.removeFromWatchlist(name)}
          onPress={() => removeFromWatchlist(titleId)}
        />
      }
      under={
        <View style={styles.rowBody}>

        {editing ? (
          <View style={styles.editor}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={COPY.watchlist.notePlaceholder}
              placeholderTextColor={theme.inkSecondary}
              style={styles.input}
              multiline
              autoFocus
              onSubmitEditing={save}
              accessibilityLabel={`Note for ${name}`}
            />
            <Button
              size="inline"
              tone="primary"
              label="Save"
              name={`Save note for ${name}`}
              onPress={save}
            />
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

        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: 16, gap: 12 },
  heading: { color: theme.ink, fontSize: 30, fontWeight: '700', marginBottom: 8 },
  empty: { color: theme.inkSecondary, fontSize: 15, lineHeight: 22 },
  emptyBlock: { gap: 16, alignItems: 'flex-start' },
  /*
   * `cta`/`ctaText` were here — a filled pill "the same shape as Up Next's", said a
   * comment, for an empty-state button this screen stopped rendering when it moved to
   * `Button`. Nothing referenced either. A dead style is invisible until something greps
   * for what it contains, which is how these two survived the migration that replaced
   * them and turned up in the sprint that swept the accent fill.
   */
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  note: { color: theme.ink, fontSize: 13, fontStyle: 'italic' },
  addNote: { color: theme.inkSecondary, fontSize: 13, textDecorationLine: 'underline' },
  editor: { gap: 6 },
  input: {
    color: theme.ink,
    fontSize: 14,
    backgroundColor: theme.groundWell,
    borderRadius: radius.none,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
});
