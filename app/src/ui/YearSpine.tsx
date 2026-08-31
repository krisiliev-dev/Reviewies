import { formatDuration, type SpineYear } from '@reviewies/core/stats/compute';
import { PLOT_FILL, SPINE, spineColumns, spinePeak, spineScale } from '@reviewies/core/ui/spine';
import { COPY } from '@reviewies/core/copy';
import { monthName } from '@reviewies/core/time';
import { Data } from './Data';
import { Note } from './Note';
import { Section } from './Section';

/**
 * The Tailwind renderer of `core/src/ui/spine.ts`. The decisions are there, and
 * `docs/design/calm.md` is why this exists at all.
 *
 * ## One row is one `role="img"`
 *
 * A year is twelve blocks, and twelve blocks is twelve nodes a screen reader would read
 * one at a time — the shape of the data rather than the sense of it, which is the same
 * failure as a bar with no figure beside it (§6.62), a step further out. So the whole row
 * is an image with one sentence for its alt text, and everything inside it — the year, the
 * figures, the blocks — is presentational by the role's own rules, which is why nothing is
 * announced twice.
 *
 * The sentence names the busiest month, and that is the *only* thing the picture says that
 * the figures beside it do not. `COPY.stats.spineYear` has the argument.
 *
 * ## The heights are inline and the colours are not
 *
 * Tailwind v4 compiles from source text, so a class built from a number at runtime is a
 * class that is never generated — the reason every component in this directory writes its
 * classes as literals. A month's fill is a measurement, so it goes in `style`, exactly as
 * `Progress` puts its percentage there; the three colours are token classes, because a hex
 * in a component is a hex that cannot follow the table.
 *
 * ## The open cell rides on the fill
 *
 * `bottom` is the fill's own height plus the gap, so the cell sits directly on top of the
 * mark and moves up as the month fills, which is what makes marking an episode read as
 * striking *into* it rather than as a box that happens to be nearby. `PLOT_FILL` is what
 * guarantees it still fits when the month is the busiest in the record: the plot is the
 * fill area plus the gap plus the cell, exactly, and `yearSpine.test.ts` holds that
 * arithmetic rather than trusting three constants to keep agreeing.
 */
export function YearSpine({ years }: { years: SpineYear[] }) {
  const busiest = spineScale(years);
  return (
    <section>
      <Section className="px-1">{COPY.stats.yourYears}</Section>
      <ul className="flex flex-col gap-s12">
        {years.map((year) => (
          <YearRow key={year.year} year={year} busiest={busiest} />
        ))}
      </ul>
      {/*
        The caption, once, for the one cell that is open — not once per row, because there
        is only ever one. It is a fact about the object and not an instruction: the
        difference between "the next episode you mark goes here" and "mark an episode to
        fill it" is the difference between a record and a streak, and `copy.ts` owns both
        halves of that sentence.
      */}
      <Note level="footnote" className="mt-s8 px-1">{COPY.stats.openSlot}</Note>
    </section>
  );
}

function YearRow({ year, busiest }: { year: SpineYear; busiest: number }) {
  const columns = spineColumns(year.months, busiest, year.open);
  const peak = spinePeak(year.months);
  return (
    <li
      role="img"
      aria-label={
        year.episodes === 0
          ? COPY.stats.spineYearNothing(year.year)
          : COPY.stats.spineYear(
              year.year,
              year.episodes,
              formatDuration(year.minutes),
              monthName(peak),
            )
      }
    >
      <div className="flex items-baseline justify-between gap-s8 px-1">
        <Data value={String(year.year)} />
        {year.episodes > 0 && (
          <Note as="span">
            {year.episodes} {year.episodes === 1 ? 'episode' : 'episodes'} ·{' '}
            {formatDuration(year.minutes)}
          </Note>
        )}
      </div>

      <div className="mt-s4 flex items-end gap-s2" style={{ height: SPINE.plot }}>
        {columns.map((column) => (
          <div key={column.month} className="relative flex-1" style={{ height: SPINE.plot }}>
            {/*
              The track is a ground, not an outline — `progress.ts` measured what drawing it
              as a border costs, on both platforms at once, and the unfilled part of a month
              is a colour rather than a hole.
            */}
            <div
              className="absolute inset-x-0 bottom-0 bg-stroke-hairline"
              style={{ height: PLOT_FILL }}
            />
            <div
              className="absolute inset-x-0 bottom-0 bg-mark-cross-off"
              style={{ height: column.height }}
            />
            {column.open && (
              <div
                className="absolute inset-x-0 border-hairline border-stroke-signal"
                style={{ height: SPINE.slot, bottom: column.height + SPINE.gap }}
              />
            )}
          </div>
        ))}
      </div>
    </li>
  );
}
