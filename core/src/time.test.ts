import { describe, expect, it } from 'vitest';
import { dayHasArrived, dayKey, daysUntil, formatDay, startOfDay, todayKey } from './time.ts';
import { COPY } from './copy.ts';

/**
 * These run in whatever timezone the runner is in, and the suite is run twice — see the
 * `test:tz` script, which repeats it at UTC+14 where every UTC assumption breaks.
 *
 * So nothing here may hardcode an instant and expect a particular date out of it. That
 * is the mistake this whole sprint was about: the old `busiest day` test asserted
 * `2026-06-15` for `2026-06-15T20:00:00Z`, which is the 16th in Kiritimati and was
 * therefore a claim about the runner rather than about the code.
 */

/** The instant at a given local wall-clock time, whatever zone we are in. */
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('which day an instant belongs to', () => {
  it("is the day on the viewer's own wall", () => {
    expect(dayKey(at(2026, 8, 26, 9))).toBe('2026-08-26');
  });

  it('still is at one minute to midnight, which is where UTC used to disagree', () => {
    expect(dayKey(at(2026, 8, 26, 23, 59))).toBe('2026-08-26');
  });

  it('and at one minute past', () => {
    expect(dayKey(at(2026, 8, 27, 0, 1))).toBe('2026-08-27');
  });

  it('pads a single-digit month and day', () => {
    expect(dayKey(at(2026, 1, 2, 12))).toBe('2026-01-02');
  });

  it('reports today', () => {
    expect(todayKey(at(2026, 8, 26, 15))).toBe('2026-08-26');
  });
});

describe('when a calendar day begins', () => {
  it('round-trips through dayKey', () => {
    const noon = at(2026, 8, 26, 12);
    expect(dayKey(startOfDay(dayKey(noon)))).toBe(dayKey(noon));
  });

  it('is midnight locally, not 00:00Z', () => {
    expect(startOfDay('2026-08-26')).toBe(at(2026, 8, 26));
  });

  it('accepts a longer ISO string, since imports have produced them', () => {
    expect(startOfDay('2026-08-26T18:30:00Z')).toBe(at(2026, 8, 26));
  });

  it('reports NaN for something unreadable, so callers can still tell', () => {
    expect(Number.isFinite(startOfDay('soon'))).toBe(false);
    expect(Number.isFinite(startOfDay(''))).toBe(false);
  });
});

describe('whether a day has arrived', () => {
  it('is true from the first moment of that day', () => {
    expect(dayHasArrived('2026-08-26', at(2026, 8, 26, 0, 0))).toBe(true);
  });

  it('is false a minute before it', () => {
    expect(dayHasArrived('2026-08-26', at(2026, 8, 25, 23, 59))).toBe(false);
  });

  /**
   * The bug this sprint was for, from the west.
   *
   * `Date.parse('2026-08-27')` is UTC midnight, which in Los Angeles is 5pm on the 26th.
   * Up Next therefore offered tomorrow's episode from teatime today — on the evening
   * people actually open this app.
   */
  it('does not let tomorrow arrive during this evening', () => {
    for (const hour of [17, 20, 23]) {
      expect(dayHasArrived('2026-08-27', at(2026, 8, 26, hour))).toBe(false);
    }
  });

  /**
   * And from the east: at UTC+14, `Date.parse('2026-08-26')` lands at 2pm local, so
   * today's episode stayed hidden all morning.
   */
  it('lets today arrive in the morning', () => {
    for (const hour of [0, 6, 9, 13]) {
      expect(dayHasArrived('2026-08-26', at(2026, 8, 26, hour))).toBe(true);
    }
  });

  it('is false for an unreadable date rather than throwing', () => {
    expect(dayHasArrived('', at(2026, 8, 26, 12))).toBe(false);
  });
});

describe('counting calendar days', () => {
  it('counts today as zero from any hour of it', () => {
    expect(daysUntil('2026-08-26', at(2026, 8, 26, 23, 59))).toBe(0);
  });

  it('counts tomorrow as one from any hour of today', () => {
    expect(daysUntil('2026-08-27', at(2026, 8, 26, 0, 1))).toBe(1);
  });

  it('goes negative for the past', () => {
    expect(daysUntil('2026-08-24', at(2026, 8, 26, 12))).toBe(-2);
  });

  it('crosses a month end', () => {
    expect(daysUntil('2026-09-01', at(2026, 8, 31, 12))).toBe(1);
  });

  it('crosses a year end', () => {
    expect(daysUntil('2027-01-01', at(2026, 12, 31, 23, 30))).toBe(1);
  });

  it('counts a leap day', () => {
    expect(daysUntil('2028-03-01', at(2028, 2, 28, 12))).toBe(2);
  });

  /**
   * A day that is 23 or 25 hours long.
   *
   * Subtracting instants and flooring would report 0 across a spring-forward and 1 twice
   * across a fall-back. Rounding between two local midnights survives both. Asserted for
   * every transition of a year in one zone that has them, rather than one hand-picked
   * date, because which weekend it falls on differs by country and by year.
   */
  it('still counts one day across every daylight-saving change of the year', () => {
    const zone = 'America/New_York';
    const offset = (ms: number) => {
      const s = new Date(ms).toLocaleString('en-US', { timeZone: zone, timeZoneName: 'shortOffset' });
      return s.slice(s.lastIndexOf('GMT'));
    };
    let transitions = 0;
    for (let d = 1; d <= 365; d++) {
      const a = Date.UTC(2026, 0, 1) + (d - 1) * 86_400_000;
      const b = a + 86_400_000;
      if (offset(a) === offset(b)) continue;
      transitions++;
      const from = new Date(b).toLocaleDateString('en-CA', { timeZone: zone });
      // The day after a transition is still exactly one day after the day before it.
      const before = new Date(a).toLocaleDateString('en-CA', { timeZone: zone });
      expect(Math.round((Date.parse(from) - Date.parse(before)) / 86_400_000)).toBe(1);
    }
    // Two a year. If this ever reads 0 the loop stopped testing anything.
    expect(transitions).toBe(2);
  });
});

describe('naming a day to a person', () => {
  const now = at(2026, 8, 26, 15);

  it('says Today', () => {
    expect(formatDay('2026-08-26', now)).toBe(COPY.calendar.today);
  });

  it('says Tomorrow', () => {
    expect(formatDay('2026-08-27', now)).toBe(COPY.calendar.tomorrow);
  });

  it('names the weekday within the week', () => {
    // Not the date, and not "Today"/"Tomorrow" either.
    const said = formatDay('2026-08-29', now);
    expect(said).not.toMatch(/\d/);
    expect(said).not.toBe(COPY.calendar.today);
    expect(said).not.toBe(COPY.calendar.tomorrow);
  });

  it('gives a date once a week is too far to picture', () => {
    expect(formatDay('2026-09-20', now)).toMatch(/\d/);
  });

  /**
   * Both edges of "within the week", which nothing pinned.
   *
   * §6.75 mutated `diff > 1 && diff < 7` in every direction and four of the five changes
   * survived the suite. The two tests above sit at three days and twenty-five, so the
   * boundaries at each end were free to move: the day after tomorrow could be pushed out
   * to a date, and a week away could be pulled in to a weekday.
   *
   * The second one is the reason the range exists. "Tuesday" seven days from a Tuesday
   * names today's weekday for something a whole week off — the exact ambiguity the
   * comment on `formatDay` says the date is there to avoid.
   */
  it('names the weekday from the day after tomorrow to six days out', () => {
    // now is Wednesday 2026-08-26: +2 is the first day past "Tomorrow", +6 the last
    // before a weekday name would start repeating.
    expect(formatDay('2026-08-28', now)).not.toMatch(/\d/);
    expect(formatDay('2026-09-01', now)).not.toMatch(/\d/);
  });

  it('and switches to a date exactly a week out, before a weekday name repeats', () => {
    expect(formatDay('2026-09-02', now)).toMatch(/\d/);
  });

  it('hands back anything it cannot read, rather than showing "Invalid Date"', () => {
    expect(formatDay('TBA', now)).toBe('TBA');
  });

  it('still says Today at one minute to midnight', () => {
    // The case the old web implementation got right and the phone never had at all.
    expect(formatDay('2026-08-26', at(2026, 8, 26, 23, 59))).toBe(COPY.calendar.today);
  });
});

/**
 * The other half of the number line, which nothing above ever looked at.
 *
 * Every case in the block above is today or later, because `formatDay` was written for
 * the calendar and the calendar only looks forward. The title page lists an episode
 * *history*, and pointing it at this formatter turned the 2005 premiere of *It's Always
 * Sunny* into **"Thu, Aug 4"** — a weekday and a day-and-month for something twenty-one
 * years old, which is a worse answer than the ISO string it replaced. The suite was green
 * throughout: not one assertion above ever passed a past date in.
 *
 * So the rule this pins is **distance decides how much date, direction decides only the
 * words that must have one**. "Yesterday" is the one past day English has a word for that
 * cannot be misread; a bare weekday going backwards can be — "Friday" three days ago and
 * "Friday" three days ahead are the same string — so the past does not get one. And the
 * year is written down whenever it is not this one, in either direction, because an
 * unqualified "Aug 4" is itself a claim: that the date is near enough not to need saying.
 */
describe('naming a day that has already happened', () => {
  const now = at(2026, 8, 26, 15);

  it('says Yesterday', () => {
    expect(formatDay('2026-08-25', now)).toBe(COPY.calendar.yesterday);
  });

  it('does not name a past day by a weekday alone, which reads as the coming one', () => {
    // Three days back. A bare "Sunday" here is the same string as three days forward.
    expect(formatDay('2026-08-23', now)).toMatch(/\d/);
  });

  it('keeps the year on a date that is not in this one', () => {
    // The photographed case: It's Always Sunny in Philadelphia, S1E1, 4 August 2005.
    expect(formatDay('2005-08-04', now)).toContain('2005');
    expect(formatDay('2025-12-31', now)).toContain('2025');
  });

  it('keeps it going forward too, where the same silence is the same lie', () => {
    // A show announced for next year is as badly served by a bare "Sun, Jan 10".
    expect(formatDay('2027-01-10', now)).toContain('2027');
  });

  it('does not spend the year on a date in the year we are in', () => {
    // Both directions, so the rule is about the year and not about the past.
    expect(formatDay('2026-01-04', now)).not.toContain('2026');
    expect(formatDay('2026-12-20', now)).not.toContain('2026');
  });

  it('still says Today and Tomorrow, which are nearer than any rule about years', () => {
    expect(formatDay('2026-08-26', now)).toBe(COPY.calendar.today);
    expect(formatDay('2026-08-27', now)).toBe(COPY.calendar.tomorrow);
  });

  /**
   * The boundary the year rule creates, in the one place it could surprise somebody.
   *
   * On the 1st of January, yesterday is in a different year — and the answer is still
   * "Yesterday" rather than a year-stamped date, because a person standing on the 1st
   * knows what yesterday was. The near words are nearer than any rule about years.
   */
  it('does not stamp a year onto Yesterday across New Year', () => {
    expect(formatDay('2025-12-31', at(2026, 1, 1, 10))).toBe(COPY.calendar.yesterday);
  });
});
