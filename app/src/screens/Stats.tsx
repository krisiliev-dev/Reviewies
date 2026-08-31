import { useState } from 'react';
import { Choice } from '../ui/Choice';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  availableYears,
  DEFAULT_STATS_WINDOW,
  formatDuration,
  getSpine,
  getSummary,
  type StatsSummary,
  type Window,
} from '@reviewies/core/stats/compute';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';
import { Section } from '../ui/Section';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Progress } from '../ui/Progress';
import { Masthead } from '../ui/Masthead';
import { Button } from '../ui/Button';
import { YearSpine } from '../ui/YearSpine';
import { useWaitedLongEnough } from '../ui/waiting';

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
  { key: 'ytd', label: COPY.stats.thisYear },
  { key: 'all', label: COPY.stats.allTime },
];

export function Stats() {
  const [window, setWindow] = useState<Window>(DEFAULT_STATS_WINDOW);
  const [year, setYear] = useState<number>();

  const years = useLiveQuery(() => availableYears(), [], undefined);
  const spine = useLiveQuery(() => getSpine(), [], undefined);
  const summary = useLiveQuery(
    () => (year ? getSummary('year', { year }) : getSummary(window)),
    [window, year],
    undefined,
  );

  /**
   * The two queries that draw **above** the figures, and why they are one condition.
   *
   * `design/between.mjs` measured a press on *Stats* from /more shifting the period
   * control **283px down** at +187ms — the largest genuine shift in the app, and not a
   * disclosure: the reader had asked for a screen, not for a banner to arrive over the
   * top of the one they were reading. The mechanism is the ordering. Both queries are
   * local and both answer in a microtask, but the render does not wait for them: the
   * period control and the figures paint first, and then the spine — a decade of
   * television, 283px of it — is inserted above them and pushes everything down.
   *
   * `years` is the same defect one size smaller and was invisible next to it: its default
   * was `[]`, so the second row of the period control was absent, then present, which
   * moves the figures under a reader for the same reason. `undefined` is the honest
   * initial value — *not asked yet* — and `yearList` is what the render uses.
   *
   * So: the head paints before the tail, or neither does. The wait is the same wait
   * either way; what it no longer does is spend it drawing an answer in the wrong order.
   */
  const headKnown = spine !== undefined && years !== undefined;
  const yearList = years ?? [];
  const headWaited = useWaitedLongEnough(!headKnown);
  const summaryWaited = useWaitedLongEnough(summary === undefined);

  /*
   * The windows and the years as one list of options, because they are one choice: picking
   * a year clears the window and vice versa, which is what a radio group *is*. The year
   * keys are strings so the whole group has one key type; `Your 2024` stays the announced
   * name rather than a bare number beside three phrases.
   */
  const PERIODS = WINDOWS.map((w) => ({ key: w.key as string, label: w.label }));
  /**
   * The one answer, for the one group. A window key or a year, never both and never
   * neither — which is exactly what `getSummary` takes below.
   */
  const chosen = year === undefined ? (window as string) : String(year);
  const YEARS = yearList.map((y) => ({ key: String(y), label: String(y), hint: `your ${y}` }));

  /*
   * The head, alone, until it is a head.
   *
   * Not `null`: the screen's name is not a query result and there is no honest reason to
   * withhold it — a press that lands on a page with no name has not been answered, which
   * is the other bound `design/response.mjs` measures. What waits is everything whose
   * arrival could move something already on the screen.
   */
  if (!headKnown) {
    return (
      <div className="p-s16">
        <Masthead level="page" className="px-1">{COPY.screens.stats}</Masthead>
        {headWaited && <Note>{COPY.waiting.loading}</Note>}
      </div>
    );
  }

  return (
    <div className="p-s16">
      <Masthead level="page" className="px-1">{COPY.screens.stats}</Masthead>

      {/*
       * The record, above the question about it.
       *
       * The spine is all-time by construction — a row is a year — so it sits outside the
       * period control rather than under it, and it is the first thing on the screen
       * because it is what the screen is a picture of. The figures below answer *how much,
       * in which stretch*; this answers *what have I watched*, which is the question
       * `docs/design/architecture.md` says a surface has to be nameable by.
       *
       * It renders before the empty branch as well as after it, and that is deliberate:
       * somebody who has marked nothing gets one row for this year with one cell open in
       * it, which is `docs/design/calm.md`'s whole argument arriving on day one instead of
       * in year two.
       */}
      {/* Unconditional now. `headKnown` above is what decides whether this screen has a
          body at all, so a second `spine !== undefined` here would be a guard against a
          state this line can no longer be reached in. */}
      <div className="mb-5"><YearSpine years={spine} /></div>

      {/*
       * One question, drawn on two rows.
       *
       * §6.109 split the drawing for a measured reason: "how far back" has three fixed
       * answers and "which year" has as many as the person has history, so on a decade of
       * imported TV Time the single group was thirteen chips in three rows — 148px of
       * control with the first figure at y=236 of an 844px screen. Two rows with the years
       * scrolling: 88px, figures at 222, and Year in Review — the thing TV Time's REWIND
       * made people love — says its own name.
       *
       * It split the *meaning* by accident, and this file said so in two comments nine
       * lines apart: "one list of options, because they are one choice … which is what a
       * radio group *is*", then "two groups … because they are two questions". The render
       * followed the second and the state followed the first, so whichever row did not
       * hold the answer got `value=''` — **a radiogroup announcing nothing selected, on
       * every visit, permanently**. §6.138.
       *
       * One `radiogroup` now, two rows inside it, one answer: `chosen`. `continues` is
       * what lets the second row draw the same and declare nothing.
       *
       * `Choice` draws being chosen as a rule and an ink step rather than the accent fill,
       * which is the app's one filled shape and belongs to the thing worth pressing.
       */}
      <div role="radiogroup" aria-label={COPY.stats.period}>
        <div className="mb-5">
          <Choice
            continues
            name={COPY.stats.period}
            options={PERIODS}
            value={chosen}
            onChange={(next) => {
              setWindow(next as Window);
              setYear(undefined);
            }}
          />
        </div>

        {YEARS.length > 0 && (
          <div className="mb-5">
            {/* A footnote labelling the second row of one control, not a `Section`
                dividing the screen in the middle of one radiogroup. §6.167. */}
            <Note level="footnote" className="px-1">
              {COPY.stats.yearInReview}
            </Note>
            {/* Bleeding to the screen edge, so the row that scrolls looks like one — a
                scroller that stops short of the margin reads as a clipped list. */}
            <div className="-mx-4 px-4">
              <Choice
                continues
                name={COPY.stats.period}
                options={YEARS}
                scroll
                value={chosen}
                onChange={(next) => setYear(Number(next))}
              />
            </div>
          </div>
        )}
      </div>

      {/* The figures are the last thing on the screen, so their arrival appends rather
          than inserts and moves nothing. This one only has to not flicker — see
          `core/src/ui/waiting.ts` for why the word waits 200ms for its turn. */}
      {summary === undefined ? (
        summaryWaited ? <Note>{COPY.waiting.loading}</Note> : null
      ) : summary.episodes === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <Note>{COPY.stats.empty}</Note>
          {/* There is history, just not in this window. Saying "nothing" to somebody
              with ten years in the app reads as a lost library rather than an empty
              period, and the years above are not an obvious answer to it. §6.54. */}
          {yearList.length > 0 && (window !== 'all' || year !== undefined) && (
            <Button
              onPress={() => {
                setYear(undefined);
                setWindow('all');
              }}
              label={COPY.stats.showAllTime}
              name={COPY.stats.showAllTime}
            />
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

  return (
    <div className="flex flex-col gap-5">
      {/*
        The headline. It used to carry a third line — "across 50 episodes and 3 titles" —
        which is two of the tiles below it written out in prose, and the tiles then repeated
        its figure as well. §6.171: a review that opens by restating its own contents is not
        a review. Headline here, breakdown below, neither saying the other's part.
      */}
      {isYearReview && year !== undefined && (
        <div className="rounded-plate bg-ground-raised p-4">
          <Note>{COPY.stats.yourYear(year)}</Note>
          <p className="mt-1">
            <Data value={formatDuration(summary.minutes)} size="s30" />
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2">
        {/* Not while the card is up: it just said this at s30, and a headline restated one
            size down is the same repetition a step quieter. */}
        {!isYearReview && <Tile label={COPY.stats.watched} value={formatDuration(summary.minutes)} />}
        <Tile label={COPY.stats.episodes} value={String(summary.episodes)} />
        <Tile label={COPY.stats.titles} value={String(summary.distinctTitles)} />
        <Tile
          label={COPY.stats.longestStreak}
          value={`${summary.longestStreakDays} ${summary.longestStreakDays === 1 ? 'day' : 'days'}`}
        />
      </dl>

      {summary.busiestDay && (
        <Note className="px-1">
          {COPY.stats.busiestDay(formatDay(summary.busiestDay.date), summary.busiestDay.episodes)}
        </Note>
      )}

      <section>
        {/* s12, not s14: an uppercase eyebrow with letter-spacing reads a step larger than
            its number, and the phone has drawn this at 12 since it was written. */}
        <Section className="px-1">{COPY.stats.mostWatched}</Section>
        <ul className="flex flex-col gap-1.5">
          {summary.topTitles.map((t) => (
            <li key={t.titleId} className="rounded-plate bg-ground-raised p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-s14">{t.name}</span>
                <Note as="span" className="shrink-0">{formatDuration(t.minutes)}</Note>
              </div>
              {/* Bar length is time, not episode count — the whole point of
                  runtime weighting. */}
              <Progress
                className="mt-2"
                value={t.minutes}
                max={maxMinutes}
                label={`${t.name}, ${formatDuration(t.minutes)} of your ${formatDuration(maxMinutes)} most-watched`}
              />
              <Note level="footnote" className="mt-1">
                {t.episodes} {t.episodes === 1 ? 'episode' : 'episodes'}
              </Note>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-plate bg-ground-raised px-3 py-3">
      <Note level="footnote" as="dt">{label}</Note>
      <dd>
        <Data value={value} size="s20" />
      </dd>
    </div>
  );
}
