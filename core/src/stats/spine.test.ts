import { describe, expect, it } from 'vitest';
import { spineYears } from './compute.ts';
import {
  PLOT_FILL,
  SPINE,
  SPINE_MONTHS,
  spineColumns,
  spinePeak,
  spineScale,
} from '../ui/spine.ts';
import type { WatchEvent } from '../domain/types.ts';

/**
 * The year spine, and the one cell on it that is still open.
 *
 * `docs/design/calm.md` argues that this object is the product's reward system and that a
 * streak is what it exists instead of. That argument only holds while three things stay
 * true, and each of them is a line here rather than a sentence in a document:
 *
 * 1. **The open cell is on the year you are in**, not on the newest year you happen to have
 *    watched anything in. Get that wrong and somebody returning after two years away is
 *    handed an open cell in 2024 — the app telling them where they stopped, which is the
 *    *"you are behind"* framing the document refuses by name.
 * 2. **The busiest month in the record cannot draw over the cell.** The plot is the fill
 *    area plus the gap plus the cell, exactly; scale a fill against the whole plot instead
 *    and the one object the component exists for disappears on precisely the person who has
 *    used the app most.
 * 3. **A month with nothing in it draws nothing.** `progress.ts` made the opposite mistake
 *    once — a floor applied to zero, so a bar measuring nothing drew 4% — and on an almanac
 *    the gap in a year is information, not a rendering artefact.
 */

const at = (iso: string, over: Partial<WatchEvent> = {}): WatchEvent => ({
  id: crypto.randomUUID(),
  targetId: 'tmdb:ep:1',
  seriesId: 'tmdb:tv:1',
  watchedAt: new Date(iso).getTime(),
  runtimeMin: 45,
  source: 'manual',
  ...over,
});

/** A local-time instant, so the assertions below do not depend on the runner's zone. */
const local = (year: number, month: number, day = 15, hour = 20): WatchEvent =>
  at(new Date(year, month, day, hour).toISOString());

const NOW = new Date(2026, 7, 31, 12).getTime();

describe('the year spine', () => {
  it('gives the current year a row whether or not anything is in it', () => {
    const rows = spineYears([], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].year).toBe(2026);
    expect(rows[0].episodes).toBe(0);
    expect(rows[0].months).toHaveLength(SPINE_MONTHS);
    // The first-run picture: an empty almanac with one cell open in it. If this row
    // disappears, so does the whole argument for building the object before year two.
    expect(rows[0].open).toBe(7);
  });

  it('runs newest first', () => {
    const rows = spineYears([local(2019, 0), local(2024, 5), local(2026, 2)], NOW);
    expect(rows.map((r) => r.year)).toEqual([2026, 2024, 2019]);
  });

  it('puts the open cell on the year you are in, not on the last year you watched anything', () => {
    /*
     * Somebody who stopped in 2024 and opened the app tonight. The newest *row with watches*
     * is 2024 and the open cell is not on it: an open cell in 2024 is the app pointing at
     * where you stopped, and `docs/design/calm.md` refuses that framing in the same breath
     * as it refuses streaks. 2026 is a row here only because the current year always is.
     */
    const rows = spineYears([local(2024, 3), local(2024, 9)], NOW);
    expect(rows.map((r) => r.year)).toEqual([2026, 2024]);
    expect(rows.filter((r) => r.open !== undefined).map((r) => r.year)).toEqual([2026]);
    expect(rows[0].open).toBe(7);
    expect(rows[1].open).toBeUndefined();
  });

  it('reads a watch in the viewer’s own calendar, at both ends of a year', () => {
    // 23:00 on 31 December belongs to the year the person was in when they watched it, and
    // 00:30 on 1 January to the next one. `core/src/time.ts` is the standing rule; this is
    // the one place a spine can get it wrong without any other figure noticing.
    const rows = spineYears([at(new Date(2025, 11, 31, 23).toISOString()), local(2026, 0, 1, 0)], NOW);
    const twentyFive = rows.find((r) => r.year === 2025);
    const twentySix = rows.find((r) => r.year === 2026);
    expect(twentyFive?.months[11]).toBe(1);
    expect(twentySix?.months[0]).toBe(1);
  });

  it('counts episodes and runtime-weighted minutes per year', () => {
    const rows = spineYears([local(2026, 1), local(2026, 1), local(2026, 4, 2)], NOW);
    expect(rows[0].episodes).toBe(3);
    expect(rows[0].minutes).toBe(135);
    expect(rows[0].months[1]).toBe(2);
    expect(rows[0].months[4]).toBe(1);
  });

  it('assumes a runtime rather than dropping a watch that carries none', () => {
    // Same rule as `summarise`, and it has to be the same number: a year whose minutes are
    // computed one way and whose tiles are computed another is two answers to one question.
    const rows = spineYears([local(2026, 1), at(new Date(2026, 1, 16, 20).toISOString(), { runtimeMin: undefined })], NOW);
    expect(rows[0].minutes).toBe(45 + 30);
  });
});

describe('the spine’s scale', () => {
  it('is the busiest month anywhere on it, not the busiest month in each row', () => {
    const rows = spineYears([...Array(40).fill(0).map(() => local(2019, 5)), local(2026, 2)], NOW);
    expect(spineScale(rows)).toBe(40);
    /*
     * Per-row scaling would draw the single-episode month of 2026 at the same height as the
     * forty-episode month of 2019, which is the one thing an almanac must not do — every
     * year normalised to itself draws the same picture.
     */
    const thin = spineColumns(rows[0].months, spineScale(rows), rows[0].open);
    const thick = spineColumns(rows[1].months, spineScale(rows), rows[1].open);
    expect(thin[2].height).toBeLessThan(thick[5].height);
    expect(thick[5].height).toBe(PLOT_FILL);
  });

  it('is zero on an empty history, and every month then draws nothing', () => {
    const rows = spineYears([], NOW);
    expect(spineScale(rows)).toBe(0);
    for (const column of spineColumns(rows[0].months, 0, rows[0].open)) {
      expect(column.height).toBe(0);
    }
  });
});

describe('a spine column', () => {
  it('leaves the open cell room even when the month is the busiest in the record', () => {
    /*
     * The arithmetic, stated rather than trusted. `plot = fill + gap + slot` is what makes
     * the cell fit on top of a full column; scale the fill against `plot` instead — which is
     * the obvious way to write it — and the busiest month in a decade pushes the cell off
     * the top of its own row.
     */
    expect(PLOT_FILL + SPINE.gap + SPINE.slot).toBe(SPINE.plot);
    const columns = spineColumns([0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0], 100, 2);
    expect(columns[2].height).toBe(PLOT_FILL);
    expect(columns[2].height + SPINE.gap + SPINE.slot).toBeLessThanOrEqual(SPINE.plot);
    for (const column of columns) expect(column.height).toBeLessThanOrEqual(PLOT_FILL);
  });

  it('draws nothing for a month with nothing in it, and the floor for a month with one', () => {
    const columns = spineColumns([0, 1, 400], 400, undefined);
    expect(columns[0].height).toBe(0);
    expect(columns[1].height).toBe(SPINE.floor);
    expect(columns[2].height).toBe(PLOT_FILL);
    // "Barely any" and "none" are different facts — `PROGRESS_FLOOR`'s own correction, one
    // component along.
    expect(columns[0].height).not.toBe(columns[1].height);
  });

  it('carries the count as height, so the picture survives greyscale', () => {
    const columns = spineColumns([2, 4, 8], 8, undefined);
    expect(columns[0].height).toBeLessThan(columns[1].height);
    expect(columns[1].height).toBeLessThan(columns[2].height);
    // One mark colour, so colour cannot be carrying anything on its own.
    expect(new Set(columns.map(() => 'mark')).size).toBe(1);
  });

  it('is twelve columns whatever it is handed', () => {
    expect(spineColumns([], 0, undefined)).toHaveLength(SPINE_MONTHS);
    expect(spineColumns([1, 2, 3], 3, undefined)).toHaveLength(SPINE_MONTHS);
    expect(spineColumns(Array(20).fill(1), 1, undefined)).toHaveLength(SPINE_MONTHS);
  });

  it('opens exactly one cell, on the month it was given', () => {
    const columns = spineColumns([1, 1, 1], 1, 7);
    expect(columns.filter((c) => c.open).map((c) => c.month)).toEqual([7]);
    expect(spineColumns([1, 1, 1], 1, undefined).filter((c) => c.open)).toEqual([]);
  });
});

describe('the month a year is remembered by', () => {
  it('is the tallest, and ties go to the earliest so both platforms say the same one', () => {
    expect(spinePeak([1, 9, 3])).toBe(1);
    expect(spinePeak([4, 4, 1])).toBe(0);
    expect(spinePeak([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])).toBe(11);
  });

  it('is nothing at all in a year with nothing in it', () => {
    // Not January. A year with no peak is not a year whose peak is the first month, and the
    // caller's cue to reach for `spineYearNothing` instead is this value.
    expect(spinePeak(Array(SPINE_MONTHS).fill(0))).toBe(-1);
  });
});
