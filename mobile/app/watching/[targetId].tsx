import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@reviewies/core/data/db';
import { EMOJI_PAD, loadEmojiIndex, searchEmoji } from '@reviewies/core/watching/emoji';
import {
  addReaction,
  estimateDriftMs,
  fetchRemoteReactions,
} from '@reviewies/core/watching/reactions';
import { formatTimecode, usePlaybackClock } from '@reviewies/core/watching/usePlaybackClock';
import { ReactionStream } from '../../src/ui/ReactionStream';
import { ListenSync } from '../../src/watching/ListenSync';
import { radius, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';

/**
 * Watching Mode. The reason this app exists rather than another tracker.
 *
 * You are watching on a television, or a laptop, or a tablet. This is the second
 * screen in your hand: big targets, dark, no reading required. You tap how you feel at
 * a moment, and the moments other people tapped drift past the top as you reach them.
 */
export default function WatchingScreen() {
  // Started when the screen opens, so the long tail of emoji is parsed before anybody
  // reaches for the search bar. Until then search answers from the curated pad.
  useEffect(() => {
    void loadEmojiIndex();
  }, []);

  const { targetId: raw } = useLocalSearchParams<{ targetId: string }>();
  const targetId = decodeURIComponent(raw ?? '');
  const router = useRouter();

  const clock = usePlaybackClock();
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState(24);

  const episode = useLive(() => db.episodes.get(targetId), [targetId]);
  const series = useLive(
    async () => (episode?.seriesId ? db.titles.get(episode.seriesId) : undefined),
    [episode?.seriesId],
  );
  const reactions = useLive(
    () => db.reactions.where('targetId').equals(targetId).sortBy('tMs'),
    [targetId],
  );

  // A phone suspends timers outright when backgrounded, so returning without this
  // shows a timecode frozen at whenever you left.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') clock.resync();
    });
    return () => subscription.remove();
  }, [clock]);

  useEffect(() => {
    void fetchRemoteReactions(targetId);
  }, [targetId]);

  /**
   * How far off the crowd you are.
   *
   * People react to the same moments — a reveal, a punchline — so the offset between
   * your taps and everyone else's is a usable estimate of how badly the manual start
   * was timed. Silent below two seconds, because nudging someone who is already right
   * is worse than saying nothing.
   */
  const drift = useMemo(() => {
    const mine = (reactions ?? []).filter((r) => r.mine);
    const others = (reactions ?? []).filter((r) => !r.mine);
    return estimateDriftMs(mine, others);
  }, [reactions]);

  const pad = query.trim() ? searchEmoji(query) : EMOJI_PAD;

  async function react(emoji: string) {
    await addReaction(targetId, clock.positionMs, emoji);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
          <View style={styles.headerMiddle}>
            <Text numberOfLines={1} style={styles.series}>
              {series?.name ?? 'Watching'}
            </Text>
            {episode && (
              <Text numberOfLines={1} style={styles.episode}>
                S{episode.season}E{episode.number} · {episode.name}
              </Text>
            )}
          </View>
          <Text style={styles.clock}>{formatTimecode(clock.positionMs)}</Text>
        </View>

        {/* The stream sits at the top, per the brief: reactions appear as you reach
            their moment and fade off to the left. */}
        <ReactionStream
          reactions={reactions ?? []}
          positionMs={clock.positionMs}
          density={density}
        />

        {!clock.running && clock.positionMs === 0 ? (
          <View style={styles.startBlock}>
            <Text style={styles.startBlurb}>
              Press start when the episode starts. You can nudge the clock any time.
            </Text>
            <Pressable style={styles.start} onPress={() => clock.start()}>
              <Text style={styles.startText}>Start watching</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controls}>
            <Control label={clock.running ? 'Pause' : 'Resume'} onPress={clock.toggle} />
            <Control label="−5s" onPress={() => clock.nudge(-5000)} />
            <Control label="+5s" onPress={() => clock.nudge(5000)} />
            <View style={styles.densityBlock}>
              <Text style={styles.densityLabel}>Density</Text>
              <View style={styles.densityRow}>
                {[8, 24, 60].map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setDensity(value)}
                    style={[styles.densityChip, density === value && styles.densityChipOn]}
                  >
                    <Text
                      style={[styles.densityText, density === value && styles.densityTextOn]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Listening sits below the controls rather than above them: starting the
            clock by hand is the reliable path, and this is the thing that keeps it
            right afterwards. */}
        <ListenSync
          targetId={targetId}
          positionMs={clock.positionMs}
          clockRunning={clock.running}
          onCorrection={(ms) =>
            // Hearing the episode is itself proof it is playing, so a match on a clock
            // that was never started begins it rather than setting a paused timecode.
            clock.running ? clock.seek(ms) : clock.start(ms)
          }
        />

        {drift !== undefined && (
          <Pressable style={styles.drift} onPress={() => clock.nudge(drift)}>
            <Text style={styles.driftText}>
              You look {drift > 0 ? 'behind' : 'ahead of'} the crowd by{' '}
              {Math.abs(Math.round(drift / 1000))}s — tap to correct
            </Text>
          </Pressable>
        )}

        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <View style={styles.padGrid}>
            {pad.map((item) => (
              <Pressable
                key={item.emoji}
                onPress={() => react(item.emoji)}
                // Big targets: this is tapped in the dark without looking down for long.
                style={({ pressed }) => [styles.padButton, pressed && styles.padPressed]}
              >
                <Text style={styles.padEmoji}>{item.emoji}</Text>
                <Text style={styles.padLabel}>{item.label}</Text>
              </Pressable>
            ))}
            {pad.length === 0 && <Text style={styles.noMatch}>No emoji matches that.</Text>}
          </View>
        </ScrollView>

        {/* Search is deliberately a small part of the screen. Most of it is the pad,
            because picking from a grid is what you can do without reading. */}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search any emoji…"
          placeholderTextColor={theme.muted}
          style={styles.search}
          autoCorrect={false}
        />
      </SafeAreaView>
    </>
  );
}

function Control({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.control}>
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  headerMiddle: { flex: 1, alignItems: 'center' },
  close: { color: theme.muted, fontSize: 15 },
  series: { color: theme.text, fontSize: 15, fontWeight: '600' },
  episode: { color: theme.muted, fontSize: 12 },
  clock: { color: theme.text, fontSize: 15, fontVariant: ['tabular-nums'] },

  startBlock: { padding: 16, gap: 12 },
  startBlurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  start: {
    backgroundColor: theme.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startText: { color: theme.ink, fontWeight: '700', fontSize: 17 },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  control: {
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  controlText: { color: theme.text, fontSize: 14 },
  densityBlock: { marginLeft: 'auto', alignItems: 'flex-end', gap: 3 },
  densityLabel: { color: theme.muted, fontSize: 10 },
  densityRow: { flexDirection: 'row', gap: 4 },
  densityChip: {
    backgroundColor: theme.surface2,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  densityChipOn: { backgroundColor: theme.accent },
  densityText: { color: theme.muted, fontSize: 11 },
  densityTextOn: { color: theme.ink, fontWeight: '600' },

  drift: {
    marginHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: 10,
  },
  driftText: { color: theme.muted, fontSize: 12 },

  pad: { padding: 12 },
  padGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  padButton: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  padPressed: { backgroundColor: theme.surface2, transform: [{ scale: 0.94 }] },
  padEmoji: { fontSize: 30 },
  padLabel: { color: theme.muted, fontSize: 9, textAlign: 'center' },
  noMatch: { color: theme.muted, fontSize: 13, padding: 8 },

  search: {
    margin: 12,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 15,
  },
});
