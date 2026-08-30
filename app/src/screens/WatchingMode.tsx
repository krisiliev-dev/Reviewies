import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { formatTimecode, usePlaybackClock } from '@reviewies/core/watching/usePlaybackClock';
import { forget, remember, resumeFor } from '@reviewies/core/watching/resume';
import { ReactionStream } from '../watching/ReactionStream';
import { EMOJI_PAD, loadEmojiIndex, searchEmoji } from '@reviewies/core/watching/emoji';
import { padLive } from '@reviewies/core/ui/padCell';
import { PadCell, PadGrid } from '../ui/PadCell';
import { addReaction, estimateDriftMs, fetchRemoteReactions } from '@reviewies/core/watching/reactions';
import { Data } from '../ui/Data';
import {
  isStale,
  matchesEpisode,
  subscribeToPlayback,
  type PlaybackUpdate,
} from '../watching/extensionBridge';
import { ListenSync } from '../watching/ListenSync';
import { COPY } from '@reviewies/core/copy';
import { Choice } from '../ui/Choice';
import { Button } from '../ui/Button';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import {
  DEFAULT_REACTION_DENSITY,
  REACTION_DENSITY_CHOICES,
} from '@reviewies/core/watching/reactions';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';

/**
 * Watching Mode — timestamped reactions to moments, on a second screen.
 *
 * The research case for this: what people actually missed about TV Time was not
 * tracking, it was reacting to moments together. A tap is far cheaper than writing a
 * comment, which also makes the cold-start problem much easier.
 *
 * Spoiler safety is structural rather than policed — you only ever see reactions for
 * timestamps you have already reached.
 */
export function WatchingMode() {
  // Fetched here rather than when someone starts typing: the chunk is a hundred and
  // twenty kilobytes and the search bar is two taps away, so it arrives long before it
  // is wanted. Search falls back to the curated pad until it does.
  useEffect(() => {
    void loadEmojiIndex();
  }, []);

  const { targetId = '' } = useParams();
  const navigate = useNavigate();
  const clock = usePlaybackClock();

  // The hook no longer listens for this itself — it has no business knowing it is in
  // a browser — so the web app supplies its own source. Timers are throttled in a
  // background tab, and a returning user should not be shown a stale timecode.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') clock.resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [clock]);
  const [density, setDensity] = useState<number>(DEFAULT_REACTION_DENSITY);
  // Separate from the clock on purpose: wanting the timecode to keep running while the
  // top of the screen holds still is a reasonable thing to want, and WCAG 2.2.2 asks
  // for a way to stop anything that moves by itself for longer than five seconds.
  const [streamPaused, setStreamPaused] = useState(false);
  const [query, setQuery] = useState('');
  const [dismissedDrift, setDismissedDrift] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  /*
   * `autoSynced` counts as started, and that is why this is a value rather than a repeat
   * of the condition. Hearing the episode is proof it is playing, so a match sets a clock
   * the person never pressed — and a pad still off at that point would be off during the
   * episode. The phone has no equivalent flag because `ListenSync`'s correction starts the
   * clock outright there.
   */
  const padReady = padLive(clock.running || clock.positionMs > 0 || autoSynced);

  /**
   * Pick up where you left off.
   *
   * This screen used to keep its position in React state and nowhere else, so leaving it
   * — a phone call, checking who that actor is — came back to 0:00 and "Start watching".
   * Doc 10 §2. A clock that was running is restored advanced by the time that passed,
   * because the episode did not stop when you looked away.
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

  // Written on every tick rather than on the way out, because "the way out" includes
  // closing the tab, which runs nothing reliably.
  useEffect(() => {
    // Stopped at the beginning is the one state worth forgetting rather than storing:
    // it is what the screen looks like before you have started, and offering to resume
    // it would put "Resume 0:00" in front of somebody who has watched nothing.
    if (!clock.running && clock.positionMs === 0) {
      forget();
      return;
    }
    remember({ targetId, positionMs: clock.positionMs, running: clock.running, at: Date.now() });
  }, [targetId, clock.positionMs, clock.running]);

  const episode = useLiveQuery(() => db.episodes.get(targetId), [targetId]);
  const series = useLiveQuery(
    async () => (episode?.seriesId ? db.titles.get(episode.seriesId) : undefined),
    [episode?.seriesId],
  );

  // Every reaction ever left on this episode, replayed as the clock reaches it.
  /**
   * Deliberately without an initial value, so `undefined` means "not read yet".
   *
   * It used to default to `[]`, which made "the query has not come back" and "this
   * episode has no reactions" the same value — and `ReactionStream` needs to tell them
   * apart to know which reactions are history. §6.78.
   */
  const loadedReactions = useLiveQuery(
    () => db.reactions.where('targetId').equals(targetId).toArray(),
    [targetId],
  );
  const reactions = loadedReactions ?? [];

  // Keep the screen awake — an episode is far longer than any sleep timer.
  useEffect(() => {
    if (!clock.running) return;
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;

    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (cancelled) void s.release();
        else sentinel = s;
      })
      .catch(() => {
        /* Wake Lock is unsupported or blocked; the feature still works. */
      });

    return () => {
      cancelled = true;
      void sentinel?.release().catch(() => {});
    };
  }, [clock.running]);

  // The browser extension, when present, reports the real playback position. It
  // supersedes the manual clock entirely: exact, continuous, no drift. Absent an
  // extension nothing changes and manual sync stands.
  useEffect(() => {
    return subscribeToPlayback((update: PlaybackUpdate) => {
      if (isStale(update)) return;
      if (!matchesEpisode(update, { season: episode?.season, episode: episode?.number })) return;

      clock.seek(update.positionMs);
      if (update.paused) clock.pause();
      setAutoSynced(true);
    });
  }, [clock, episode?.season, episode?.number]);

  // Pull everyone's reactions for this episode as soon as the screen opens, so the
  // replay is populated before playback starts.
  useEffect(() => {
    void fetchRemoteReactions(targetId);
  }, [targetId]);

  // Offer a correction when your taps consistently trail or lead the crowd.
  const drift = useMemo(() => {
    const mine = reactions.filter((r) => r.mine);
    const others = reactions.filter((r) => !r.mine);
    return estimateDriftMs(mine, others);
  }, [reactions]);

  const results = useMemo(() => (query.trim() ? searchEmoji(query) : []), [query]);

  async function react(emoji: string) {
    await addReaction(targetId, clock.positionMs, emoji);
    navigator.vibrate?.(8);
    setQuery('');
  }

  return (
    <div className="flex h-full flex-col bg-ground">
      {/* Wraps, and the title is allowed more than one line. Close, the title and the
          timecode in one nowrap row fits a phone once; at twice the text size the show
          came out as "The L…" and the episode as "S1E2 · …", which is not a truncation
          so much as the screen refusing to say what you are watching. */}
      <header className="safe-top flex flex-wrap items-center gap-x-3 px-4 pt-3 pb-1">
        {/* Two things on this screen say "Close": this and the remote drawer. */}
        <button
          onClick={() => navigate(-1)}
          className="tap text-s14 text-ink-secondary"
          aria-label={COPY.controls.leaveWatching}
        >
          Close
        </button>
        <div className="min-w-0 flex-1 text-center">
          {/* Two lines before it gives up, rather than one character. */}
          <p className="line-clamp-2 text-s14 font-title font-semibold">{series?.name ?? COPY.screens.watching}</p>
          {episode && (
            <Note level="footnote" className="line-clamp-2">
              {[episodeCode(episode.season, episode.number), episodeName(episode.name, episode.number)]
                .filter(Boolean)
                .join(' · ')}
            </Note>
          )}
        </div>
        <span className="min-w-s48 text-right">
          <Data value={formatTimecode(clock.positionMs)} className="text-ink-secondary" />
        </span>
      </header>

      {/* Other viewers' reactions, drifting right to left as you reach their moments. */}
      <ReactionStream
        reactions={loadedReactions}
        positionMs={clock.positionMs}
        density={density}
        paused={streamPaused}
      />

      {!clock.running && clock.positionMs === 0 && !autoSynced ? (
        <StartPanel onStart={() => clock.start(0)} />
      ) : (
        <>
          {autoSynced && (
            <Note level="footnote" className="px-4 pb-1">
              Synced automatically from your browser.
            </Note>
          )}
          {/* Drift correction is meaningless when the position is exact. */}
          {!autoSynced && drift !== undefined && (
            <DriftHint
              driftMs={drift}
              onApply={() => {
                clock.nudge(drift);
                setDismissedDrift(true);
              }}
              onDismiss={() => setDismissedDrift(true)}
              dismissed={dismissedDrift}
            />
          )}
          <SyncBar
            clock={clock}
            density={density}
            onDensity={setDensity}
            streamPaused={streamPaused}
            onStreamPaused={setStreamPaused}
          />
          {/* Hidden when the extension already reports an exact position — there is
              nothing for listening to improve. */}
          {!autoSynced && (
            <ListenSync
              targetId={targetId}
              positionMs={clock.positionMs}
              onSynced={(ms) => clock.seek(ms)}
            />
          )}
        </>
      )}

      {/* Most of the screen is big preselected buttons — this gets used in the dark,
          without looking away from the television. */}
      {/* Off until there is a clock, which this screen already did — and drew as
          `disabled:opacity-30`, twenty cells of a pad that reads as a failed render.
          `PadCell` owns both the rule and its treatment now, and the phone reads the
          same rule instead of leaving every cell live. §6.130. */}
      <PadGrid>
        {(results.length ? results : EMOJI_PAD).map((e) => (
          <PadCell
            key={e.emoji + e.label}
            emoji={e.emoji}
            label={e.label}
            disabled={!padReady}
            onPress={() => react(e.emoji)}
          />
        ))}
      </PadGrid>

      <div className="safe-bottom border-t border-stroke-hairline p-3">
        <Field
          label="Search emoji"
          value={query}
          onChange={setQuery}
          placeholder={COPY.fields.emojiPlaceholder}
        />
      </div>
    </div>
  );
}

function StartPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="px-4 pb-3">
      {/* `active:scale-[0.98]` was here and is not: the component's press feedback is a
          thickening and a ground step at 0ms, which is identical with Reduce Motion on.
          A scale is a transform and needs a `reduced ?` branch to be honest. */}
      <Button
        size="page"
        tone="primary"
        label={COPY.controls.startWatching}
        name={COPY.controls.startWatching}
        onPress={onStart}
        className="w-full"
      />
      <Note level="footnote" className="mt-2 text-center">{COPY.watching.startHint}</Note>
    </div>
  );
}

function SyncBar({
  clock,
  density,
  onDensity,
  streamPaused,
  onStreamPaused,
}: {
  clock: ReturnType<typeof usePlaybackClock>;
  density: number;
  onDensity: (v: number) => void;
  streamPaused: boolean;
  onStreamPaused: (v: boolean) => void;
}) {
  return (
    // Five controls and a density picker in one row, which fits a phone once and not at
    // twice the text size. Wrapping keeps Hold reachable; it was running off the edge.
    <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
      {/* `Button`s. These three were the transport, hand-drawn as
          `rounded-plate bg-ground-well` — a plate wearing the *sunken* ground, which
          §6.122 established is where a press *goes*, so the resting state of the web's
          transport was the pressed state of everything else in the app. The phone's
          equivalents have been `Button`s since sprint 9 and nobody compared them. §6.131. */}
      <Button
        onPress={clock.toggle}
        label={clock.running ? COPY.controls.pause : COPY.controls.resume}
        name={clock.running ? COPY.controls.pauseClock : COPY.controls.resumeClock}
      />
      {/* Manual drift correction, always available. The crowd-derived estimate
          above handles the common case; these cover the rest. */}
      {/* "−5s" is a minus sign, a digit and a letter; what it does is a sentence. */}
      <Button onPress={() => clock.nudge(-5000)} label="−5s" name={COPY.controls.seek(-5)} />
      <Button onPress={() => clock.nudge(5000)} label="+5s" name={COPY.controls.seek(5)} />
      {/* A toggle, and `selected` draws it now — it announced `aria-pressed` and painted
          the accent fill, which is the app's one filled shape and means "worth pressing"
          rather than "already on". */}
      <Button
        label={streamPaused ? COPY.controls.held : COPY.controls.hold}
        name={
          streamPaused ? COPY.controls.moveReactions : COPY.controls.holdReactions
        }
        selected={streamPaused}
        onPress={() => onStreamPaused(!streamPaused)}
      />
      {/* Three choices, the phone's, rather than a slider from a quarter to all. A
          proportion is not a promise anybody can act on — a quarter of a quiet episode
          is nothing — and the two platforms meant different things by the same word
          until §6.55. */}
      {/* A control label beside its control, which is what this always was — the phone
          stacked and right-aligned it into a wrapped row and now matches this.
          
          Deliberately not `Block`: it stacks at `BLOCK.gap` under `Section`'s tracked
          caps, and on the phone those twenty points pushed the pad's last row off screen.
          `Block` labels a block of content; three chips in a control row are not one.
          §6.130. */}
      <div className="ml-auto flex items-center gap-1.5">
        <Note level="footnote" as="span">{COPY.watching.densityLabel}</Note>
        {/* `min-h-6` was 24px — WCAG 2.5.8's floor rather than the house standard of 44,
            on the flagship screen. The phone's version of this control was worse still at
            26×24 and wearing a button's role. `Choice` is 44 on both. */}
        <Choice<number>
          name={COPY.watching.densityLabel}
          value={density}
          onChange={onDensity}
          options={REACTION_DENSITY_CHOICES.map((value) => ({
            key: value,
            label: String(value),
            hint: COPY.watching.densityChoice(value),
          }))}
        />
      </div>
    </div>
  );
}

/**
 * Crowd-derived drift correction.
 *
 * If your reactions consistently trail everyone else's by the same amount, your
 * manual sync started late. This is offered rather than applied automatically —
 * silently moving someone's clock is disorienting, and the estimate can be wrong
 * when few people have watched an episode.
 */
function DriftHint({
  driftMs,
  onApply,
  onDismiss,
  dismissed,
}: {
  driftMs: number;
  onApply: () => void;
  onDismiss: () => void;
  dismissed: boolean;
}) {
  if (dismissed) return null;
  const seconds = Math.round(Math.abs(driftMs) / 1000);
  const behind = driftMs < 0;

  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-plate border border-stroke-signal px-3 py-2 text-s14">
      <Note as="span" className="flex-1">
        Looks like you&rsquo;re {seconds}s {behind ? 'behind' : 'ahead of'} everyone else.
      </Note>
      <Button
        size="inline"
        tone="primary"
        label="Fix"
        name={COPY.controls.seek(behind ? seconds : -seconds)}
        onPress={onApply}
      />
      <Button
        size="inline"
        tone="quiet"
        label="Ignore"
        name="Ignore the drift correction"
        onPress={onDismiss}
      />
    </div>
  );
}
