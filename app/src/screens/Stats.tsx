import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  availableYears,
  formatDuration,
  getSummary,
  type StatsSummary,
  type Window,
} from '@reviewies/core/stats/compute';

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
  const [window, setWindow] = useState<Window>('ytd');
  const [year, setYear] = useState<number>();

  const years = useLiveQuery(() => availableYears(), [], []);
  const summary = useLiveQuery(
    () => (year ? getSummary('year', { year }) : getSummary(window)),
    [window, year],
    undefined,
  );

  return (
    <div className="p-4">
      <h1 className="mb-4 px-1 text-2xl font-semibold">Stats</h1>

      <div
        role="radiogroup"
        aria-label="Which stretch of time these figures cover"
        className="mb-5 flex flex-wrap gap-1.5"
      >
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => {
              setWindow(w.key);
              setYear(undefined);
            }}
            role="radio"
            aria-checked={!year && window === w.key}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              !year && window === w.key ? 'bg-accent text-ink' : 'bg-surface-2 text-muted'
            }`}
          >
            {w.label}
          </button>
        ))}
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            role="radio"
            aria-checked={year === y}
            aria-label={`Your ${y}`}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              year === y ? 'bg-accent text-ink' : 'bg-surface-2 text-muted'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {summary === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : summary.episodes === 0 ? (
        <p className="text-muted">Nothing watched in this period yet.</p>
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

  return (
    <div className="flex flex-col gap-5">
      {isYearReview && (
        <div className="rounded-2xl bg-gradient-to-br from-accent/25 to-surface p-4">
          <p className="text-sm text-muted">Your {year}</p>
          <p className="mt-1 text-3xl font-semibold">{formatDuration(summary.minutes)}</p>
          <p className="mt-1 text-sm text-muted">
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
        <p className="px-1 text-sm text-muted">
          Busiest day was {new Date(summary.busiestDay.date).toLocaleDateString()} with{' '}
          {summary.busiestDay.episodes}{' '}
          {summary.busiestDay.episodes === 1 ? 'episode' : 'episodes'}.
        </p>
      )}

      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">
          Most watched
        </h2>
        <ul className="flex flex-col gap-1.5">
          {summary.topTitles.map((t) => (
            <li key={t.titleId} className="rounded-xl bg-surface p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{t.name}</span>
                <span className="shrink-0 text-sm text-muted">{formatDuration(t.minutes)}</span>
              </div>
              {/* Bar length is time, not episode count — the whole point of
                  runtime weighting. */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(4, (t.minutes / maxMinutes) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
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
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
