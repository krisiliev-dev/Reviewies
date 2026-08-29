import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RUN_KIND_ORDER, runsOf, type UpcomingEntry } from '@reviewies/core/calendar/upcoming';
import { runCode } from '@reviewies/core/ui/episode';

/**
 * A season that drops at once is one event, not eight.
 *
 * §6.149 gave the fixtures a `drop` cadence and photographed the result: eight full-width
 * rows carrying the same poster and the same title, `S2E1` … `S2E8` the only thing that
 * varied, 1420 points of screen for one sentence.
 *
 * This is the finding #175 *claimed* and did not have. §6.146 retracted the repeated show
 * name because with two shows interleaved the name is what varies — and that reasoning is
 * exactly what condemns it here, where it does not vary. Same rule, two different days.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const entry = (
  seriesId: string,
  season: number,
  number: number,
  kind: UpcomingEntry['kind'] = 'regular',
): UpcomingEntry => ({
  episode: {
    id: `${seriesId}-${season}-${number}`,
    seriesId,
    season,
    number,
    name: `Episode ${number}`,
    airDate: '2026-09-22',
    fetchedAt: 0,
  },
  seriesId,
  seriesName: seriesId,
  kind,
  day: '2026-09-22',
});

describe('a day the whole season lands on', () => {
  it('is one row, not eight', () => {
    const runs = runsOf([
      entry('salt', 2, 1, 'premiere'),
      entry('salt', 2, 2),
      entry('salt', 2, 3),
      entry('salt', 2, 4, 'series-finale'),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].episodes.map((e) => e.number)).toEqual([1, 2, 3, 4]);
  });

  it('still gives two shows two rows', () => {
    // The case §6.146 built the calendar around, which this must not swallow.
    const runs = runsOf([entry('long', 3, 1), entry('hollow', 1, 94)]);
    expect(runs.map((r) => r.seriesId)).toEqual(['long', 'hollow']);
  });

  it('is named for the strongest milestone in it', () => {
    /*
     * A dropped final season holds both a premiere and a series finale, and a row has one
     * chip. Ending beats starting — the judgement `classify` already makes about a
     * one-episode season, applied to a run.
     */
    expect(RUN_KIND_ORDER).toEqual(['series-finale', 'finale', 'premiere', 'regular']);
    expect(runsOf([entry('salt', 2, 1, 'premiere'), entry('salt', 2, 2, 'series-finale')])[0].kind)
      .toBe('series-finale');
    expect(runsOf([entry('salt', 2, 1, 'premiere'), entry('salt', 2, 2)])[0].kind).toBe('premiere');
    // And order does not decide it: the finale arriving first must win just the same.
    expect(runsOf([entry('salt', 2, 1, 'series-finale'), entry('salt', 2, 2, 'premiere')])[0].kind)
      .toBe('series-finale');
  });

  it('says the span rather than the first of it', () => {
    expect(runCode(2, [1, 2, 3, 4, 5, 6, 7, 8])).toBe('S2E1–8');
    expect(runCode(2, [4])).toBe('S2E4');
    // An en dash, because it is a range. A hyphen would read as part of a code.
    expect(runCode(2, [1, 8])).toContain('–');
    expect(runCode(2, [1, 8])).not.toContain('-');
  });

  it('does not let a run invent a series finale', () => {
    /*
     * `RUN_KIND_ORDER` picks the strongest kind in the run, and `series-finale` is the
     * strongest. §6.150 made that kind require the show to be *known* over, so a run can
     * only carry one if `classify` was told — and a run of season finales must stay a
     * season finale however many of them there are.
     */
    const run = runsOf([entry('salt', 2, 1, 'premiere'), entry('salt', 2, 8, 'finale')])[0];
    expect(run.kind).toBe('finale');
  });

  it('is what both calendars draw', () => {
    for (const [name, file] of [
      ['web', 'app/src/screens/Calendar.tsx'],
      ['phone', 'mobile/app/calendar.tsx'],
    ] as const) {
      const source = withoutProse(read(file));
      expect(source, `${name} still maps a day to its entries`).toContain('runsOf(');
      expect(source, `${name} spells the row's code itself`).toContain('runCode(');
      expect(source, `${name} does not count the run`).toContain('run.episodes.length');
    }
  });
});
