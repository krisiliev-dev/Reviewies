import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { formatTimecode, usePlaybackClock } from '@reviewies/core/watching/usePlaybackClock';
import { forget, remember, resumeFor } from '@reviewies/core/watching/resume';
import { ReactionStream } from '../watching/ReactionStream';
import { EMOJI_PAD, loadEmojiIndex, searchEmoji } from '@reviewies/core/watching/emoji';
import { addReaction, estimateDriftMs, fetchRemoteReactions } from '@reviewies/core/watching/reactions';
import {
  isStale,
  matchesEpisode,
  subscribeToPlayback,
  type PlaybackUpdate,
} from '../watching/extensionBridge';
import { ListenSync } from '../watching/ListenSync';
import { COPY } from '@reviewies/core/copy';
import {
  DEFAULT_REACTION_DENSITY,
  REACTION_DENSITY_CHOICES,
} from '@reviewies/core/watching/reactions';

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
    <div className="flex h-full flex-col bg-ink">
      {/* Wraps, and the title is allowed more than one line. Close, the title and the
          timecode in one nowrap row fits a phone once; at twice the text size the show
          came out as "The L…" and the episode as "S1E2 · …", which is not a truncation
          so much as the screen refusing to say what you are watching. */}
      <header className="safe-top flex flex-wrap items-center gap-x-3 px-4 pt-3 pb-1">
        {/* Two things on this screen say "Close": this and the remote drawer. */}
        <button
          onClick={() => navigate(-1)}
          className="tap text-sm text-muted"
          aria-label="Leave Watching Mode"
        >
          Close
        </button>
        <div className="min-w-0 flex-1 text-center">
          {/* Two lines before it gives up, rather than one character. */}
          <p className="line-clamp-2 text-sm font-medium">{series?.name ?? 'Watching'}</p>
          {episode && (
            <p className="line-clamp-2 text-xs text-muted">
              S{episode.season}E{episode.number} · {episode.name}
            </p>
          )}
        </div>
        <span className="min-w-12 text-right font-mono text-sm tabular-nums text-muted">
          {formatTimecode(clock.positionMs)}
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
            <p className="px-4 pb-1 text-xs text-muted">
              Synced automatically from your browser.
            </p>
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
      <div className="grid flex-1 grid-cols-4 content-start gap-2 overflow-y-auto p-3">
        {(results.length ? results : EMOJI_PAD).map((e) => (
          <button
            key={e.emoji + e.label}
            onClick={() => react(e.emoji)}
            disabled={!clock.running && clock.positionMs === 0 && !autoSynced}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-surface text-3xl active:scale-90 disabled:opacity-30"
            // The emoji is aria-hidden, so this is the whole name — "Funny" alone does
            // not say it is something you do.
            aria-label={`React with ${e.label.toLowerCase()}`}
          >
            <span aria-hidden="true">{e.emoji}</span>
            <span className="text-[0.5625rem] leading-none text-muted">{e.label}</span>
          </button>
        ))}
      </div>

      <div className="safe-bottom border-t border-edge p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any emoji…"
          className="w-full rounded-xl bg-surface px-4 py-3 text-base outline-none placeholder:text-muted"
          aria-label="Search emoji"
        />
      </div>
    </div>
  );
}

function StartPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="px-4 pb-3">
      <button
        onClick={onStart}
        className="w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-ink active:scale-[0.98]"
      >
        Start watching
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Tap the moment you press play. You can nudge the timing at any point.
      </p>
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
      <button
        onClick={clock.toggle}
        aria-label={clock.running ? 'Pause the clock' : 'Resume the clock'}
        className="rounded-lg bg-surface-2 px-3 py-2 text-sm"
      >
        {clock.running ? 'Pause' : 'Resume'}
      </button>
      {/* Manual drift correction, always available. The crowd-derived estimate
          above handles the common case; these cover the rest. */}
      {/* "−5s" is a minus sign, a digit and a letter; what it does is a sentence. */}
      <button
        onClick={() => clock.nudge(-5000)}
        aria-label="Move the clock back 5 seconds"
        className="rounded-lg bg-surface-2 px-3 py-2 text-sm"
      >
        −5s
      </button>
      <button
        onClick={() => clock.nudge(5000)}
        aria-label="Move the clock forward 5 seconds"
        className="rounded-lg bg-surface-2 px-3 py-2 text-sm"
      >
        +5s
      </button>
      <button
        onClick={() => onStreamPaused(!streamPaused)}
        aria-pressed={streamPaused}
        aria-label={
          streamPaused ? 'Let other people’s reactions move again' : 'Hold other people’s reactions still'
        }
        className={`rounded-lg px-3 py-2 text-sm ${
          streamPaused ? 'bg-accent text-ink' : 'bg-surface-2'
        }`}
      >
        {streamPaused ? 'Held' : 'Hold'}
      </button>
      {/* Three choices, the phone's, rather than a slider from a quarter to all. A
          proportion is not a promise anybody can act on — a quarter of a quiet episode
          is nothing — and the two platforms meant different things by the same word
          until §6.55. */}
      <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        {COPY.watching.densityLabel}
        <div role="radiogroup" aria-label={COPY.watching.densityLabel} className="flex gap-1">
          {REACTION_DENSITY_CHOICES.map((value) => (
            <button
              key={value}
              onClick={() => onDensity(value)}
              role="radio"
              aria-checked={density === value}
              // "8", "24", "60" on their own are three numbers next to each other.
              aria-label={COPY.watching.densityChoice(value)}
              className={`min-h-6 rounded-full px-3 py-1 ${
                density === value ? 'bg-accent text-ink' : 'bg-surface-2 text-muted'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
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
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
      <span className="flex-1 text-muted">
        Looks like you&rsquo;re {seconds}s {behind ? 'behind' : 'ahead of'} everyone else.
      </span>
      <button
        onClick={onApply}
        aria-label={`Move the clock ${seconds} seconds ${behind ? 'forward' : 'back'}`}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
      >
        Fix
      </button>
      <button
        onClick={onDismiss}
        aria-label="Ignore the drift correction"
        className="px-2 py-1.5 text-xs text-muted"
      >
        Ignore
      </button>
    </div>
  );
}
