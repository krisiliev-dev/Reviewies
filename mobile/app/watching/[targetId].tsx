import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { PadCell, PadGrid } from '../../src/ui/PadCell';
import { padLive } from '@reviewies/core/ui/padCell';
import { ListenSync } from '../../src/watching/ListenSync';
import { RemoteDrawer } from '../../src/devices/RemoteDrawer';
import { radius, space, tap, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';
import {
  DEFAULT_REACTION_DENSITY,
  REACTION_DENSITY_CHOICES,
} from '@reviewies/core/watching/reactions';
import { Button } from '../../src/ui/Button';
import { Choice } from '../../src/ui/Choice';
import { text, type } from '@reviewies/core/tokens';
import { Data } from '../../src/ui/Data';
import { Note } from '../../src/ui/Note';
import { Field } from '../../src/ui/Field';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';

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
  /** The remote's trigger lives in the control row below, so its state lives here. */
  const [remoteOpen, setRemoteOpen] = useState(false);
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
  const padReady = padLive(clock.running || clock.positionMs > 0);

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
            accessibilityLabel={COPY.controls.leaveWatching}
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
                {[
                  episodeCode(episode.season, episode.number),
                  episodeName(episode.name, episode.number),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </View>
          <Data value={formatTimecode(clock.positionMs)} style={styles.clock} />
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
            <Note>{COPY.watching.startHint}</Note>
            <Button
              onPress={() => clock.start()}
              tone="primary"
              size="page"
              label={COPY.controls.startWatching}
              name={COPY.controls.startWatching}
            />
          </View>
        ) : (
          <View style={styles.controls}>
            <Button
              label={clock.running ? 'Pause' : 'Resume'}
              name={clock.running ? COPY.controls.pauseClock : COPY.controls.resumeClock}
              onPress={clock.toggle}
            />
            <Button
              label={streamHeld ? 'Held' : 'Hold'}
              name={
                streamHeld
                  ? COPY.controls.moveReactions
                  : COPY.controls.holdReactions
              }
              selected={streamHeld}
              onPress={() => setStreamHeld(!streamHeld)}
            />
            {/* "−5s" is a minus sign, a digit and a letter. Named, because what it does
                is a sentence and what it shows is three characters. */}
            <Button
              label="−5s"
              name={COPY.controls.seek(-5)}
              onPress={() => clock.nudge(-5000)}
            />
            <Button
              label="+5s"
              name={COPY.controls.seek(5)}
              onPress={() => clock.nudge(5000)}
            />
            {/* Among its siblings rather than over the pad. The tab this replaces sat at
                `top: '45%'` under a comment claiming it was "never in the way of the pad",
                and `23-watching-live.png` shows it covering the fourth column between
                *Cliffhanger* and *Dead*. §6.167. */}
            <Button
              label="Remote"
              name={COPY.controls.openRemote}
              onPress={() => setRemoteOpen(true)}
            />
            {/* A control label, beside its control — the web's spelling, which the phone
                stacked and right-aligned into the middle of a wrapped row.
                `23-watching-live` is what that looked like: "Density" centred over the
                first chip, the only label of its kind on the screen.
                
                Not `Block`. That was tried first and the photograph refused it: `Block`
                is a section label above a block of content, so it stacks at `BLOCK.gap`
                with `Section`'s tracked caps, and the twenty extra points pushed the pad's
                last row under the search box — costing the running state the one property
                this screen is built around. Three chips in a control row are not a block,
                and forcing the component there was applying a rule outside its subject.
                §6.130. */}
            <View style={styles.densityBlock}>
              <Text style={styles.densityLabel}>{COPY.watching.densityLabel}</Text>
              {/* "8", "24", "60" on their own are three numbers next to each other. The
                  sentence used to say "a minute", which the code never did: twenty-four
                  inside a four-second window is three hundred and sixty a minute. §6.55.
                  `Choice` carries that as the option's hint, which is part of the
                  announced name rather than a second node to arrow past. */}
              <Choice<number>
                name={COPY.watching.densityLabel}
                value={density}
                onChange={setDensity}
                options={REACTION_DENSITY_CHOICES.map((value) => ({
                  key: value,
                  label: String(value),
                  hint: COPY.watching.densityChoice(value),
                }))}
              />
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
          {/* Inert until the clock is going: a reaction is a timestamp, and there is no
              moment to attach one to before you press play. The web has always disabled
              these and the phone never did — `22-watching-start` was twenty live-looking
              cells above an unpressed "Start watching". The start block above is the
              explanation; the pad does not repeat it. §6.130. */}
          <PadGrid>
            {pad.map((item) => (
              <PadCell
                key={item.emoji}
                emoji={item.emoji}
                label={item.label}
                disabled={!padReady}
                onPress={() => react(item.emoji)}
              />
            ))}
            {pad.length === 0 && <Text style={styles.noMatch}>No emoji matches that.</Text>}
          </PadGrid>
        </ScrollView>

        {/* Search is deliberately a small part of the screen. Most of it is the pad,
            because picking from a grid is what you can do without reading. */}
        <Field
            label={COPY.fields.emoji}
            value={query}
            onChange={setQuery}
            placeholder={COPY.fields.emojiPlaceholder}
            autoCorrect={false}
            style={styles.searchBox}
          />
  
      {/* "Hidden in a drawer to the side" — and here rather than only on its own screen,
          because reaching for the remote should not cost you the clock and the stream.
          The trigger is the `Remote` button in the control row above, not a tab floating
          over the pad: `RemoteDrawer` has the reasoning and `23-watching-live.png` is the
          photograph. */}
      <RemoteDrawer open={remoteOpen} onClose={() => setRemoteOpen(false)} />
    </SafeAreaView>
    </>
  );
}

/*
 * `Control` was here — a local button with a `selected` state, its own box, and the accent
 * fill for on. `Button` is that control: `selected` is drawn now rather than only
 * announced, in `Choice`'s spelling (a rule and a weight step), so the app's one filled
 * shape keeps meaning "worth pressing" instead of "already on".
 */

const styles = StyleSheet.create({
  /** The emoji search sits inside the pad sheet with a margin of its own. */
  searchBox: { margin: 12 },
  // Clips. The remote drawer is 300 wide, absolute against this, and parked at
  // `translateX(300)` while closed — so with nothing clipping it the page measured 690
  // in a 390 viewport and could be scrolled sideways to reveal a drawer that is supposed
  // to be shut. True at any text size; the 200% check is simply what looked.
  screen: { flex: 1, backgroundColor: theme.ground, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  headerMiddle: { flex: 1, alignItems: 'center' },
  close: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.title.name },
  series: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  episode: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  clock: { color: theme.ink },

  startBlock: { padding: 16, gap: 12 },

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

  // Inline, not stacked: the label sits with its chips on one line, which is what the
  // web has always done and what keeps the pad's fifth row above the search box.
  densityBlock: { flexDirection: 'row', alignItems: 'center', gap: space.s6 },
  densityLabel: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },

  drift: {
    marginHorizontal: 16,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    padding: 12,
  },
  driftText: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },

  pad: { padding: 12 },
  noMatch: { color: theme.inkSecondary, fontSize: text.s14, padding: 8, fontFamily: type.family.body.name },

});
