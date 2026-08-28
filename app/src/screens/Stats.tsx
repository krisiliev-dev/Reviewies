import { useState } from 'react';
import { Choice } from '../ui/Choice';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  availableYears,
  DEFAULT_STATS_WINDOW,
  formatDuration,
  getSummary,
  type StatsSummary,
  type Window,
} from '@reviewies/core/stats/compute';
import { COPY } from '@reviewies/core/copy';
import { splitFigure } from '@reviewies/core/ui/data';
import { formatDay } from '@reviewies/core/time';

/**
 * Stats and Year in Review.
 *
 * TV Time's annual REWIND was one of the most-loved things about it, and the
 * stats screen generally. Two research constraints shape this: everything is
 * runtime-weighted, and windows other than all-time are first-class rather than an
 * afterthought.
 */

const WINDOWS: Array<{ key: Window; label: string }> = [
  { key: '30d', label: '30 days' },
  { key: 'ytd', label: 'This year' },
  { key: 'all', label: 'All time' },
];

export function Stats() {
  const [window, setWindow] = useState<Window>(DEFAULT_STATS_WINDOW);
  const [year, setYear] = useState<number>();

  const years = useLiveQuery(() => availableYears(), [], []);
  const summary = useLiveQuery(
    () => (year ? getSummary('year', { year }) : getSummary(window)),
    [window, year],
    undefined,
  );

  /*
   * The windows and the years as one list of options, because they are one choice: picking
   * a year clears the window and vice versa, which is what a radio group *is*. The year
   * keys are strings so the whole group has one key type; `Your 2024` stays the announced
   * name rather than a bare number beside three phrases.
   */
  const PERIODS = WINDOWS.map((w) => ({ key: w.key as string, label: w.label }));
  const YEARS = years.map((y) => ({ key: String(y), label: String(y), hint: `your ${y}` }));

  return (
    <div className="p-4">
      <h1 className="mb-4 px-1 text-s24 font-title font-semibold">Stats</h1>

      {/*
       * Two groups since §6.109, because they are two questions.
       *
       * "How far back" has three fixed answers; "which year" has as many as the person has
       * history, and on a decade of imported TV Time that was ten more chips in the same
       * radiogroup, unlabelled, carrying the same weight as the three that matter most.
       * Measured at 148px of control with the first figure at y=236 of an 844px screen.
       * Two groups with the years scrolling: 88px, figures at 222, and Year in Review —
       * the thing TV Time's REWIND made people love — finally says its own name.
       *
       * `Choice` draws being chosen as a rule and a weight step rather than the accent
       * fill, which is the app's one filled shape and belongs to the thing worth pressing.
       */}
      <div className="mb-5">
        <Choice
          name="Which stretch of time these figures cover"
          options={PERIODS}
          value={year === undefined ? window : ''}
          onChange={(next) => {
            setWindow(next as Window);
            setYear(undefined);
          }}
        />
      </div>

      {YEARS.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 px-1 text-s12 font-title font-semibold tracking-t83 text-ink-secondary uppercase">
            Year in review
          </h2>
          {/* Bleeding to the screen edge, so the row that scrolls looks like one — a
              scroller that stops short of the margin reads as a clipped list. */}
          <div className="-mx-4 px-4">
            <Choice
              name="Which year to review"
              options={YEARS}
              scroll
              value={year === undefined ? '' : String(year)}
              onChange={(next) => setYear(Number(next))}
            />
          </div>
        </div>
      )}

      {summary === undefined ? (
        <p className="text-s14 text-ink-secondary">Loading…</p>
      ) : summary.episodes === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-s14 text-ink-secondary">{COPY.stats.empty}</p>
          {/* There is history, just not in this window. Saying "nothing" to somebody
              with ten years in the app reads as a lost library rather than an empty
              period, and the years above are not an obvious answer to it. §6.54. */}
          {years.length > 0 && (window !== 'all' || year !== undefined) && (
            <button
              onClick={() => {
                setYear(undefined);
                setWindow('all');
              }}
              className="rounded-pill border border-stroke-signal px-4 py-2 text-s14"
            >
              {COPY.stats.showAllTime}
            </button>
          )}
        </div>
      ) : (
        <Summary summary={summary} isYearReview={year !== undefined} year={year} />
      )}
    </div>
  );
}

function Summary({
  summary,
  isYearReview,
  year,
}: {
  summary: StatsSummary;
  isYearReview: boolean;
  year?: number;
}) {
  const maxMinutes = summary.topTitles[0]?.minutes ?? 1;
  const watched = splitFigure(formatDuration(summary.minutes));

  return (
    <div className="flex flex-col gap-5">
      {isYearReview && (
        <div className="rounded-plate bg-ground-raised p-4">
          <p className="text-s14 text-ink-secondary">Your {year}</p>
          {/* Split, for the reason `Tile` records below: mono on the whole string sets the
              unit in a typewriter face too, and `7  days` is what that looks like. */}
          <p className="mt-1 text-s30">
            <span className="font-data font-medium tabular-nums">{watched.figure}</span>
            {watched.unit && <span> {watched.unit}</span>}
          </p>
          <p className="mt-1 text-s14 text-ink-secondary">
            across {summary.episodes} episodes and {summary.distinctTitles}{' '}
            {summary.distinctTitles === 1 ? 'title' : 'titles'}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2">
        <Tile label="Watched" value={formatDuration(summary.minutes)} />
        <Tile label="Episodes" value={String(summary.episodes)} />
        <Tile label="Titles" value={String(summary.distinctTitles)} />
        <Tile
          label="Longest streak"
          value={`${summary.longestStreakDays} ${summary.longestStreakDays === 1 ? 'day' : 'days'}`}
        />
      </dl>

      {summary.busiestDay && (
        <p className="px-1 text-s14 text-ink-secondary">
          {COPY.stats.busiestDay(formatDay(summary.busiestDay.date), summary.busiestDay.episodes)}
        </p>
      )}

      <section>
        {/* s12, not s14: an uppercase eyebrow with letter-spacing reads a step larger than
            its number, and the phone has drawn this at 12 since it was written. */}
        <h2 className="mb-2 px-1 text-s12 font-title font-semibold tracking-t83 text-ink-secondary uppercase">
          Most watched
        </h2>
        <ul className="flex flex-col gap-1.5">
          {summary.topTitles.map((t) => (
            <li key={t.titleId} className="rounded-plate bg-ground-raised p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-s14">{t.name}</span>
                <span className="shrink-0 text-s14 text-ink-secondary">{formatDuration(t.minutes)}</span>
              </div>
              {/* Bar length is time, not episode count — the whole point of
                  runtime weighting. */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-pill border border-stroke-signal">
                <div
                  className="h-full rounded-pill bg-working-fill"
                  style={{ width: `${Math.max(4, (t.minutes / maxMinutes) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-s12 text-ink-secondary">
                {t.episodes} {t.episodes === 1 ? 'episode' : 'episodes'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  /*
   * The figure in mono, the unit in the body face.
   *
   * Putting `font-data` on the whole value printed **`7  days`** — a word at monospace
   * letter spacing, which is a typewriter rather than a tabular figure. Mono is for the
   * numeral run: predictable column widths are the reason the direction asks for it.
   */
  const { figure, unit } = splitFigure(value);
  return (
    <div className="rounded-plate bg-ground-raised px-3 py-3">
      <dt className="text-s12 text-ink-secondary">{label}</dt>
      <dd className="text-s20">
        <span className="font-data font-medium tabular-nums">{figure}</span>
        {unit && <span> {unit}</span>}
      </dd>
    </div>
  );
}
