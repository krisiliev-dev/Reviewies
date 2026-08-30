import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COPY } from '@reviewies/core/copy';
import type { MediaKind } from '@reviewies/core/domain/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@reviewies/core/data/db';
import { removeFromWatchlist, setWatchlistNote, startWatching } from '@reviewies/core/data/repo';
import { Poster } from '../../src/ui/Poster';
import { Row as BaseRow } from '../../src/ui/Row';

import { REACH, tap, theme } from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { useLive } from '../../src/useLive';
import { Button } from '../../src/ui/Button';
import { Note } from '../../src/ui/Note';
import { Field } from '../../src/ui/Field';
import { Masthead } from '../../src/ui/Masthead';

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
        <Masthead>{COPY.screens.watchlist}</Masthead>

        {items?.length === 0 && (
          <View style={styles.emptyBlock}>
            <Note>{COPY.watchlist.empty}</Note>
            {/* Naming Search and then not going there is the dead end doc 10 §8 found on
                the web's Calendar: the screen knows exactly what you should do next and
                makes you find it yourself. The web's empty watchlist has had this
                button since it shipped. */}
            <Button to="/search" tone="primary" size="page" label={COPY.controls.findSomething} name={COPY.controls.findSomething} />
          </View>
        )}

        {items?.map(({ item, title }) => (
          <Row
            key={item.titleId}
            titleId={item.titleId}
            kind={item.kind}
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
  kind,
  name,
  year,
  posterUrl,
  note,
}: {
  titleId: string;
  kind: MediaKind;
  name: string;
  year?: number;
  posterUrl?: string;
  note?: string;
}) {
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
        <Poster url={posterUrl} name={name} />
      }
      open={{
        // Was `Open ${name}` on a `button` role wrapping only the poster, so the words
        // beside it were not a target at all and the role said "does something" rather
        // than "goes somewhere".
        name: `Open ${name}`,
        to: `/title/${encodeURIComponent(titleId)}`,
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
            {/* Not `multiline`, which it was, and which made `onSubmitEditing` below dead:
                React Native gives a multiline input the Return key for a newline, so the
                one gesture that saves a note without aiming at a button did nothing. It
                was also the only one of the four note fields in the product that was
                multiline — the web's watchlist and both search screens are single-line —
                so the outlier was the one carrying a prop that could not fire. §6.129. */}
            <Field
              size="row"
              label={COPY.controls.noteFor(name)}
              value={draft}
              onChange={setDraft}
              placeholder={COPY.watchlist.notePlaceholder}
              autoFocus
              onSubmitEditing={save}
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
            hitSlop={REACH.inline}
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

        {/*
          The verb the list exists for. The web's copy of this has the reasoning: until
          §6.167 the only element on a watchlist row wearing a control's shape was
          *Remove*, on the screen whose whole subject is things you want to watch.
        */}
        <View style={styles.act}>
          <Button
            tone="secondary"
            label={COPY.controls.track}
            name={COPY.controls.trackTitle(name)}
            onPress={() => startWatching(titleId, kind)}
          />
        </View>

        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: SCREEN.edge, gap: 12 },
  emptyBlock: { gap: 16, alignItems: 'flex-start' },
  /*
   * `cta`/`ctaText` were here — a filled pill "the same shape as Up Next's", said a
   * comment, for an empty-state button this screen stopped rendering when it moved to
   * `Button`. Nothing referenced either. A dead style is invisible until something greps
   * for what it contains, which is how these two survived the migration that replaced
   * them and turned up in the sprint that swept the accent fill.
   */
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  /** `alignItems` so the pill is the width of its words, not the width of the row. */
  act: { alignItems: 'flex-start', marginTop: 4 },
  note: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.proseItalic.name },
  addNote: { color: theme.inkSecondary, fontSize: text.s14, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  editor: { gap: 6 },
});
