import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { formatTimecode, usePlaybackClock } from '@reviewies/core/watching/usePlaybackClock';
import { ReactionStream } from '../watching/ReactionStream';
import { EMOJI_PAD, searchEmoji } from '@reviewies/core/watching/emoji';
import { addReaction, estimateDriftMs, fetchRemoteReactions } from '@reviewies/core/watching/reactions';
import {
  isStale,
  matchesEpisode,
  subscribeToPlayback,
  type PlaybackUpdate,
} from '../watching/extensionBridge';
import { ListenSync } from '../watching/ListenSync';

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
  const [density, setDensity] = useState(1);
  const [query, setQuery] = useState('');
  const [dismissedDrift, setDismissedDrift] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);

  const episode = useLiveQuery(() => db.episodes.get(targetId), [targetId]);
  const series = useLiveQuery(
    async () => (episode?.seriesId ? db.titles.get(episode.seriesId) : undefined),
    [episode?.seriesId],
  );

  // Every reaction ever left on this episode, replayed as the clock reaches it.
  const reactions = useLiveQuery(
    () => db.reactions.where('targetId').equals(targetId).toArray(),
    [targetId],
    [],
  );

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
      <header className="safe-top flex items-center gap-3 px-4 pt-3 pb-1">
        <button onClick={() => navigate(-1)} className="text-sm text-muted" aria-label="Close">
          Close
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{series?.name ?? 'Watching'}</p>
          {episode && (
            <p className="truncate text-xs text-muted">
              S{episode.season}E{episode.number} · {episode.name}
            </p>
          )}
        </div>
        <span className="w-12 text-right font-mono text-sm tabular-nums text-muted">
          {formatTimecode(clock.positionMs)}
        </span>
      </header>

      {/* Other viewers' reactions, drifting right to left as you reach their moments. */}
      <ReactionStream reactions={reactions} positionMs={clock.positionMs} density={density} />

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
          <SyncBar clock={clock} density={density} onDensity={setDensity} />
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
            aria-label={e.label}
          >
            <span aria-hidden="true">{e.emoji}</span>
            <span className="text-[9px] leading-none text-muted">{e.label}</span>
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
}: {
  clock: ReturnType<typeof usePlaybackClock>;
  density: number;
  onDensity: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 pb-2">
      <button onClick={clock.toggle} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
        {clock.running ? 'Pause' : 'Resume'}
      </button>
      {/* Manual drift correction, always available. The crowd-derived estimate
          above handles the common case; these cover the rest. */}
      <button onClick={() => clock.nudge(-5000)} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
        −5s
      </button>
      <button onClick={() => clock.nudge(5000)} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
        +5s
      </button>
      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        Density
        <input
          type="range"
          min={0.25}
          max={1}
          step={0.25}
          value={density}
          onChange={(e) => onDensity(Number(e.target.value))}
          className="w-16"
        />
      </label>
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
      <button onClick={onApply} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink">
        Fix
      </button>
      <button onClick={onDismiss} className="px-2 py-1.5 text-xs text-muted">
        Ignore
      </button>
    </div>
  );
}
