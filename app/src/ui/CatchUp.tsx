import { useEffect, useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import { airedSeasonSizes, catchUpTo } from '@reviewies/core/data/repo';
import { useDialog } from './useDialog';
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
  const dialog = useDialog<HTMLDivElement>(true, onDone);
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
    <div
      style={{ zIndex: 'var(--z-sheet)' }}
      className="fixed inset-0 flex items-end bg-ground/70"
      onClick={onDone}
    >
      {/* The backdrop dismisses on click, which is what a sheet does; the sheet itself
          is the dialog, and Cancel is the route to the same place without a pointer. */}
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Catch up on ${seriesName}`}
        tabIndex={-1}
        className="safe-bottom max-h-[80%] w-full overflow-y-auto rounded-t-none bg-ground-raised p-4 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate text-s16 font-title font-semibold">{seriesName}</h2>
          <button
            onClick={onDone}
            aria-label={marked === undefined ? COPY.catchUp.cancel : COPY.catchUp.done}
            className="tap shrink-0 text-s14 text-ink-secondary"
          >
            {marked === undefined ? 'Cancel' : COPY.controls.done}
          </button>
        </div>

        {marked !== undefined ? (
          <p className="py-4 text-s14">
            {marked === 0 ? COPY.catchUp.nothingToMark : COPY.catchUp.marked(marked)}
          </p>
        ) : seasons === undefined ? (
          <Note>{COPY.waiting.loading}</Note>
        ) : seasons.length === 0 ? (
          <Note>{COPY.catchUp.nothingAired}</Note>
        ) : (
          <>
            <Note className="mb-3">
              {COPY.catchUp.spoilerFree}
            </Note>

            {season === undefined ? (
              <Grid
                label={COPY.controls.season}
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
                    className="tap mt-3 text-s12 text-ink-secondary underline"
                  >{COPY.catchUp.pickSeason}</button>
                )}
                <Note level="footnote" className="mt-3">
                  {/* Said plainly: the app cannot know when these were really watched,
                      and inventing plausible past dates would be worse. */}
                  Everything up to and including that episode is logged as watched today.
                </Note>
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
      <Section as="p">{label}</Section>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <button
            key={value}
            onClick={() => onPick(value)}
            // A grid of bare numbers: "3" says nothing about season or episode.
            aria-label={`${label}: ${value}`}
            // Big enough to hit one-handed; this is a grid of small numbers.
            className="min-w-11 rounded-pill border border-stroke-signal px-3 py-3"
          >
            <Data value={value} />
          </button>
        ))}
      </div>
    </>
  );
}
