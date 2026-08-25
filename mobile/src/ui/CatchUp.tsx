import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { airedSeasonSizes, catchUpTo } from '@reviewies/core/data/repo';
import { radius, theme } from './theme';

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
    <Modal visible transparent animationType="slide" onRequestClose={onDone}>
      {/* Tapping the dimmed area closes it, which is what a sheet on a phone does. */}
      <Pressable
        style={styles.backdrop}
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Close catching up"
      />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.title}>
            {seriesName}
          </Text>
          <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button">
            <Text style={styles.done}>{marked === undefined ? 'Cancel' : 'Done'}</Text>
          </Pressable>
        </View>

        {marked !== undefined ? (
          <Text style={styles.result}>
            {marked === 0
              ? 'Already up to date — nothing to mark.'
              : `Marked ${marked} episode${marked === 1 ? '' : 's'} as watched.`}
          </Text>
        ) : seasons === undefined ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : seasons.length === 0 ? (
          <Text style={styles.muted}>No episodes have aired yet.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.muted}>
              How far have you got? Nothing here shows episode names, so you cannot be
              spoiled by catching up.
            </Text>

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
                <Text style={styles.footnote}>
                  Everything up to and including that episode is logged as watched today.
                </Text>
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
      <Text style={styles.gridLabel}>{label}</Text>
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
            <Text style={styles.cellText}>{value}</Text>
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
    backgroundColor: theme.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { color: theme.text, fontSize: 17, fontWeight: '600', flexShrink: 1 },
  done: { color: theme.muted, fontSize: 15 },
  result: { color: theme.text, fontSize: 15, paddingVertical: 16 },
  muted: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  body: { gap: 14, paddingBottom: 8 },
  grid: { gap: 8 },
  gridLabel: {
    color: theme.muted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gridCells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    minWidth: 46,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: theme.surface2,
  },
  cellText: { color: theme.text, fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  link: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
  footnote: { color: theme.muted, fontSize: 12, lineHeight: 17 },
});
