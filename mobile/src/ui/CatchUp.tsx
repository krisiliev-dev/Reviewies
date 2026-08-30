import { useEffect, useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { airedSeasonSizes, catchUpTo } from '@reviewies/core/data/repo';
import { radius, tap, theme } from './theme';
import { useReducedMotion } from './useReducedMotion';
import { text, type } from '@reviewies/core/tokens';
import { Section } from './Section';
import { Data } from './Data';
import { Note } from './Note';

/**
 * Catch up to a point in a series without seeing anything you have not watched.
 *
 * Research doc 4 §2.2: *"I try to avoid seeing reviews and ratings of movies before I
 * see them for myself. It's a little hard to do that when I have to go to the page to
 * add it."* The same problem is worse for television — the show page lists the names
 * and synopses of every episode ahead of you.
 *
 * So this picker renders numbers and nothing else. No titles, no descriptions, no air
 * dates, no artwork. It is the whole point of the control, not an aesthetic choice, and
 * it is why the numbers come from `airedSeasonSizes` rather than from the episode rows.
 *
 * It is rendered by the *screen*, not by the row it belongs to. The web version was
 * first written inside its row, and the row unmounts the moment the catch-up completes —
 * so the confirmation telling you what had just happened vanished before anyone could
 * read it. A sheet that disappears at the instant it has something to say is worse than
 * no sheet.
 */
export function CatchUp({
  seriesId,
  seriesName,
  onDone,
}: {
  seriesId: string;
  seriesName: string;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [seasons, setSeasons] = useState<Array<{ season: number; episodes: number }>>();
  const [season, setSeason] = useState<number>();
  const [marked, setMarked] = useState<number>();

  useEffect(() => {
    void airedSeasonSizes(seriesId).then((s) => {
      setSeasons(s);
      // One season means there is nothing to choose; skip straight to episodes.
      if (s.length === 1) setSeason(s[0].season);
    });
  }, [seriesId]);

  async function pick(episode: number) {
    if (season === undefined) return;
    setMarked(await catchUpTo(seriesId, season, episode));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const chosen = seasons?.find((s) => s.season === season);

  return (
    <Modal
      visible
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onDone}
    >
      {/*
        Tapping the dimmed area closes it, which is what a sheet on a phone does — and it
        is a gesture, not a control. It was a named `button` covering the whole screen, so
        a reader met "Close catching up" as a full-screen target sitting in front of the
        sheet, a second name for what Cancel already does. Hidden, as the web's backdrop
        is: there it is a bare `div` with an `onClick`, which is in no accessibility tree
        at all. The route out without a pointer is the header's Cancel. §6.147.
      */}
      <Pressable
        style={styles.backdrop}
        onPress={onDone}
        /* The scrim, which is deliberately not a control: naming it would put a second
           "Close" in the reading order. It was hidden only by the two React Native props
           that `createDOMProps` does not read, so in the export it was an **unnamed
           pressable** in a sheet's reading order — the worst of the three §6.173 found,
           because a reader meets a button that says nothing at all. `Pressable` renders a
           `View`, which expands `aria-hidden` into those two on a device. */
        aria-hidden
      />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.title}>
            {seriesName}
          </Text>
          <Pressable
            onPress={onDone}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={marked === undefined ? COPY.catchUp.cancel : COPY.catchUp.done}
            style={tap}
          >
            <Text style={styles.done}>{marked === undefined ? 'Cancel' : COPY.controls.done}</Text>
          </Pressable>
        </View>

        {marked !== undefined ? (
          <Text style={styles.result}>
            {marked === 0
              ? 'Already up to date — nothing to mark.'
              : `Marked ${marked} episode${marked === 1 ? '' : 's'} as watched.`}
          </Text>
        ) : seasons === undefined ? (
          <Note>Loading…</Note>
        ) : seasons.length === 0 ? (
          <Note>No episodes have aired yet.</Note>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <Note>
              How far have you got? Nothing here shows episode names, so you cannot be
              spoiled by catching up.
            </Note>

            {season === undefined ? (
              <Grid label="Season" values={seasons.map((s) => s.season)} onPick={setSeason} />
            ) : (
              <>
                <Grid
                  label={`Last episode you watched in season ${season}`}
                  values={Array.from({ length: chosen?.episodes ?? 0 }, (_, i) => i + 1)}
                  onPick={pick}
                />
                {seasons.length > 1 && (
                  <Pressable
                    onPress={() => setSeason(undefined)}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.link}>Pick a different season</Text>
                  </Pressable>
                )}
                {/* Said plainly: the app cannot know when these were really watched, and
                    inventing plausible past dates would be worse. */}
                <Note level="footnote">
                  Everything up to and including that episode is logged as watched today.
                </Note>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Grid({
  label,
  values,
  onPick,
}: {
  label: string;
  values: number[];
  onPick: (value: number) => void;
}) {
  return (
    <View style={styles.grid}>
      <Section>{label}</Section>
      <View style={styles.gridCells}>
        {values.map((value) => (
          <Pressable
            key={value}
            onPress={() => onPick(value)}
            // Big enough to hit one-handed; this is a grid of small numbers.
            style={styles.cell}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value}`}
          >
            <Data value={value} style={styles.cellText} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,11,15,0.7)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: theme.groundRaised,
    borderTopLeftRadius: radius.none,
    borderTopRightRadius: radius.none,
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { color: theme.ink, fontSize: text.s16, flexShrink: 1, fontFamily: type.family.title.name },
  done: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.title.name },
  result: { color: theme.ink, fontSize: text.s14, paddingVertical: 16, fontFamily: type.family.body.name },
  body: { gap: 16, paddingBottom: 8 },
  grid: { gap: 8 },
  gridCells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    minWidth: 46,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.plate,
    backgroundColor: theme.groundWell,
  },
  cellText: { color: theme.ink },
  link: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
});
