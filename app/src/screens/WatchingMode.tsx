import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { formatTimecode, usePlaybackClock } from '../watching/usePlaybackClock';
import { ReactionStream } from '../watching/ReactionStream';
import { EMOJI_PAD, searchEmoji } from '../watching/emoji';

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
  const [density, setDensity] = useState(1);
  const [query, setQuery] = useState('');

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

  const results = useMemo(() => (query.trim() ? searchEmoji(query) : []), [query]);

  async function react(emoji: string) {
    await db.reactions.add({
      id: globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
      targetId,
      tMs: Math.round(clock.positionMs),
      emoji,
      createdAt: Date.now(),
      mine: true,
    });
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

      {!clock.running && clock.positionMs === 0 ? (
        <StartPanel onStart={() => clock.start(0)} />
      ) : (
        <SyncBar clock={clock} density={density} onDensity={setDensity} />
      )}

      {/* Most of the screen is big preselected buttons — this gets used in the dark,
          without looking away from the television. */}
      <div className="grid flex-1 grid-cols-4 content-start gap-2 overflow-y-auto p-3">
        {(results.length ? results : EMOJI_PAD).map((e) => (
          <button
            key={e.emoji + e.label}
            onClick={() => react(e.emoji)}
            disabled={!clock.running && clock.positionMs === 0}
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
      {/* Manual drift correction. Crowd-based auto-correction — detecting that your
          reactions land consistently after everyone else's — is the planned upgrade. */}
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
