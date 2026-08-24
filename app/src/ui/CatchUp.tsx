import { useEffect, useState } from 'react';
import { airedSeasonSizes, catchUpTo } from '../data/repo';

/**
 * Catch up to a point in a series without seeing anything you have not watched.
 *
 * Research doc 4 §2.2: *"I try to avoid seeing reviews and ratings of movies before I
 * see them for myself. It's a little hard to do that when I have to go to the page to
 * add it."* The same problem is worse for television — the show page lists the names
 * and synopses of every episode ahead of you.
 *
 * So this picker renders numbers and nothing else. No titles, no descriptions, no
 * air dates, no artwork. It is the whole point of the control, not an aesthetic
 * choice, and it is why the numbers come from `airedSeasonSizes` rather than from the
 * episode rows themselves.
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
    navigator.vibrate?.(10);
  }

  const chosen = seasons?.find((s) => s.season === season);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/70" onClick={onDone}>
      <div
        className="safe-bottom max-h-[80%] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate font-semibold">{seriesName}</h2>
          <button onClick={onDone} className="shrink-0 text-sm text-muted">
            {marked === undefined ? 'Cancel' : 'Done'}
          </button>
        </div>

        {marked !== undefined ? (
          <p className="py-4 text-sm">
            {marked === 0
              ? 'Already up to date — nothing to mark.'
              : `Marked ${marked} episode${marked === 1 ? '' : 's'} as watched.`}
          </p>
        ) : seasons === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-muted">No episodes have aired yet.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              How far have you got? Nothing here shows episode names, so you cannot be
              spoiled by catching up.
            </p>

            {season === undefined ? (
              <Grid
                label="Season"
                values={seasons.map((s) => s.season)}
                onPick={setSeason}
              />
            ) : (
              <>
                <Grid
                  label={`Last episode you watched in season ${season}`}
                  values={Array.from({ length: chosen?.episodes ?? 0 }, (_, i) => i + 1)}
                  onPick={pick}
                />
                {seasons.length > 1 && (
                  <button
                    onClick={() => setSeason(undefined)}
                    className="mt-3 text-xs text-muted underline"
                  >
                    Pick a different season
                  </button>
                )}
                <p className="mt-3 text-xs text-muted">
                  {/* Said plainly: the app cannot know when these were really watched,
                      and inventing plausible past dates would be worse. */}
                  Everything up to and including that episode is logged as watched today.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
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
    <>
      <p className="mb-2 text-xs tracking-wide text-muted uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <button
            key={value}
            onClick={() => onPick(value)}
            // Big enough to hit one-handed; this is a grid of small numbers.
            className="min-w-11 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium tabular-nums"
          >
            {value}
          </button>
        ))}
      </div>
    </>
  );
}
