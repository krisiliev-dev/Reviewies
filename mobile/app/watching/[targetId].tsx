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
import { forget, remember, resumeFor } from '@reviewies/core/watching/resume';
import { ReactionStream } from '../../src/ui/ReactionStream';
import { ListenSync } from '../../src/watching/ListenSync';
import { RemoteDrawer } from '../../src/devices/RemoteDrawer';
import { radius, tap, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';
import {
  DEFAULT_REACTION_DENSITY,
  REACTION_DENSITY_CHOICES,
} from '@reviewies/core/watching/reactions';

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
  const [density, setDensity] = useState<number>(DEFAULT_REACTION_DENSITY);
  // Separate from the clock: the timecode can keep running while the top of the screen
  // holds still, which is what WCAG 2.2.2 asks for and what someone who finds the
  // drift distracting actually wants.
  const [streamHeld, setStreamHeld] = useState(false);

  /**
   * Pick up where you left off — the same as the web, and it matters more here.
   *
   * A phone puts this screen away every time you answer a message, and the position was
   * held in React state and nowhere else. Doc 10 §2. A clock that was running comes back
   * advanced by the time that passed, because the episode kept playing.
   */
  useEffect(() => {
    const saved = resumeFor(targetId);
    if (!saved) return;
    /**
     * Restore *whether it was running*, not only where it had got to.
     *
     * `seek` moves the anchors and the position and says nothing about running, and a
     * freshly-mounted clock is stopped — so a running episode came back showing the
     * right timecode with the clock dead. The number looked plausible, which is what
     * made it invisible: the *first* return still read further on, because `resumeFor`
     * had already advanced it once. The effect below then wrote `running: false`, and
     * from that moment the position never moved again for the rest of the episode, with
     * every reaction landing on the same frozen timestamp.
     *
     * Step away twice and the flagship feature is quietly broken. One round trip is all
     * anything here had ever done. §6.69.
     */
    if (saved.running) clock.start(saved.positionMs);
    else clock.seek(saved.positionMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [targetId]);

  useEffect(() => {
    // Stopped at the beginning is worth forgetting rather than storing: it is what the
    // screen looks like before you have started.
    if (!clock.running && clock.positionMs === 0) {
      forget();
      return;
    }
    remember({ targetId, positionMs: clock.positionMs, running: clock.running, at: Date.now() });
  }, [targetId, clock.positionMs, clock.running]);

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
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            // Named, because this screen now holds two things that say "Close": this,
            // and the remote drawer. Ambiguous to a screen reader and ambiguous to a
            // test, which is how the ambiguity got noticed.
            accessibilityLabel="Leave Watching Mode"
            style={tap}
          >
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
          paused={streamHeld}
        />

        {!clock.running && clock.positionMs === 0 ? (
          <View style={styles.startBlock}>
            <Text style={styles.startBlurb}>
              Tap the moment you press play. You can nudge the timing at any point.
            </Text>
            <Pressable
              style={styles.start}
              onPress={() => clock.start()}
              accessibilityRole="button"
            >
              <Text style={styles.startText}>Start watching</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controls}>
            <Control label={clock.running ? 'Pause' : 'Resume'} onPress={clock.toggle} />
            <Control
              label={streamHeld ? 'Held' : 'Hold'}
              name={
                streamHeld
                  ? 'Let other people’s reactions move again'
                  : 'Hold other people’s reactions still'
              }
              selected={streamHeld}
              onPress={() => setStreamHeld(!streamHeld)}
            />
            {/* "−5s" is a minus sign, a digit and a letter. Named, because what it does
                is a sentence and what it shows is three characters. */}
            <Control
              label="−5s"
              name="Move the clock back 5 seconds"
              onPress={() => clock.nudge(-5000)}
            />
            <Control
              label="+5s"
              name="Move the clock forward 5 seconds"
              onPress={() => clock.nudge(5000)}
            />
            <View style={styles.densityBlock}>
              <Text style={styles.densityLabel}>{COPY.watching.densityLabel}</Text>
              <View style={styles.densityRow}>
                {REACTION_DENSITY_CHOICES.map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setDensity(value)}
                    style={[styles.densityChip, density === value && styles.densityChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: density === value }}
                    // "8", "24", "60" on their own are three numbers next to each other.
                    // The sentence used to say "a minute", which the code never did:
                    // twenty-four inside a four-second window is three hundred and sixty
                    // a minute. §6.55.
                    accessibilityLabel={COPY.watching.densityChoice(value)}
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
          <Pressable
            style={styles.drift}
            onPress={() => clock.nudge(drift)}
            accessibilityRole="button"
          >
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
                accessibilityRole="button"
                // Without this the emoji is read by its Unicode name and then the label
                // underneath it: "face with tears of joy, Funny". One name, and the one
                // a person would say.
                accessibilityLabel={`React with ${item.label.toLowerCase()}`}
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
          accessibilityLabel="Search any emoji"
        />
  
      {/* "Hidden in a drawer to the side" — and here rather than only on its own screen,
          because reaching for the remote should not cost you the clock and the stream. */}
      <RemoteDrawer />
    </SafeAreaView>
    </>
  );
}

function Control({
  label,
  name,
  selected,
  onPress,
}: {
  label: string;
  name?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.control, selected && styles.controlOn]}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={name ?? label}
    >
      <Text style={[styles.controlText, selected && styles.controlTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Clips. The remote drawer is 300 wide, absolute against this, and parked at
  // `translateX(300)` while closed — so with nothing clipping it the page measured 690
  // in a 390 viewport and could be scrolled sideways to reveal a drawer that is supposed
  // to be shut. True at any text size; the 200% check is simply what looked.
  screen: { flex: 1, backgroundColor: theme.ink, overflow: 'hidden' },
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

  // Wraps. Five controls and a density picker fit a phone once and not at twice the
  // text size, where the row measured 690px in a 390px viewport and pushed all three
  // density chips off the edge. The web's copy of this row was fixed the same way in
  // §6.31; the phone kept it because nothing had ever rendered the phone large.
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  control: {
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  controlOn: { backgroundColor: theme.accent },
  controlText: { color: theme.text, fontSize: 14 },
  controlTextOn: { color: theme.ink, fontWeight: '600' },
  // `marginLeft: 'auto'` pushes this to the far end of the row, which is right on one
  // line and is what carried it past the edge once the row wrapped.
  densityBlock: { alignItems: 'flex-end', gap: 3 },
  densityLabel: { color: theme.muted, fontSize: 10 },
  densityRow: { flexDirection: 'row', gap: 4 },
  densityChip: {
    backgroundColor: theme.surface2,
    borderRadius: 999,
    // 24x24 is the floor WCAG 2.5.8 sets, and three numbers in a row is exactly the
    // shape that ends up under it.
    minWidth: 26,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
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
