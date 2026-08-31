import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';
import { NOTIFY_OPTIONS } from '@reviewies/core/calendar/upcoming';
import { stripComments } from '@reviewies/core/test/source';

/**
 * The three refusals in `docs/design/calm.md` that are about something *not being there*.
 *
 * A refusal nothing holds is a wish, and this repository has the receipts on that: an
 * excuse that outlived its reason by a year (§6.59), a table stating a rule no renderer
 * read (§6.122), a duration nothing drew. The other five refusals in that document are
 * held elsewhere — the spine's placement by `yearSpine.test.ts`, the crowd score by
 * `browse.test.ts`, the capped past by `architecture.md`'s own clause — and these three
 * had nothing at all.
 *
 * The test each of them comes from is one sentence, from Deci and Ryan by way of that
 * document: **is this a fact about what happened, or a response to what you did?** The
 * three shapes below are the three ways the second answer gets into a tracker, and every
 * competitor in doc 08's field of fifteen has at least one of them.
 *
 * ## What this deliberately does not do
 *
 * It does not ban the *word* streak: `COPY.stats.longestStreak` stays, on
 * `direction.md`'s grounds that a longest streak is a true fact about a year that has
 * already happened. What is refused is a **running** one — a figure that is live, losable
 * and visible where you act — which is a different identifier and a different sentence.
 * A guard that could not tell those apart would fail on the correct version, which is the
 * failure this repository has now found six times in four sprints.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const PRODUCT = [
  ...sources('core/src'),
  ...sources('app/src'),
  ...sources('mobile/src'),
  ...sources('mobile/app'),
];

/** Every sentence `copy.ts` owns, flattened, so a sweep reads what a person reads. */
function sentences(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [section, group] of Object.entries(COPY)) {
    if (typeof group !== 'object' || group === null) continue;
    for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
      if (typeof value === 'string') out.push([`${section}.${key}`, value]);
      if (typeof value === 'function') {
        const fn = value as (...args: unknown[]) => unknown;
        try {
          const said = fn(...Array.from({ length: fn.length }, (_, i) => (i === 0 ? 1 : 'something')));
          if (typeof said === 'string') out.push([`${section}.${key}`, said]);
        } catch {
          /* A name that needs a shape rather than a scalar; the literal half is enough. */
        }
      }
    }
  }
  return out;
}

describe('the refusals in calm.md', () => {
  it('reads the product rather than an empty list', () => {
    expect(PRODUCT.length).toBeGreaterThan(150);
    expect(sentences().length).toBeGreaterThan(150);
    // And the one it is *not* about is present, so a sweep that banned the word outright
    // would be caught here rather than by somebody deleting a true figure to get green.
    expect(COPY.stats.longestStreak).toBe('Longest streak');
  });

  it('has no running streak — nothing live, losable and contingent', () => {
    /*
     * Refusal 1. A longest streak is retrospective and stays; a *current* one is the three
     * conditions cognitive evaluation theory names for an undermining reward, in one
     * figure — expected, tangible, contingent on engagement — and it is what TV Time ran on.
     * The shape is an identifier, because that is what a running streak is called before it
     * is ever printed.
     */
    const offenders: string[] = [];
    for (const file of PRODUCT) {
      for (const m of read(file).matchAll(
        /\b(currentStreak|runningStreak|streakDays|dayStreak|onFire|keepItUp|dontBreak)\b/g,
      )) {
        offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders, 'a running streak is a number somebody can lose').toEqual([]);

    /*
     * And the sentence half. Two things the first draft of this clause got wrong, both
     * caught by running it, and both worth writing down because they are the difference
     * between a rule and a ban:
     *
     * - It fired on `stats.longestStreak`, the one figure the document deliberately keeps.
     *   Exempted **by key**, so the exemption names the sentence it excuses rather than
     *   softening the pattern until the real thing slips through too.
     * - It fired on `discover.empty` — *"Track a few things and come back"* — for the words
     *   *come back*. That is an empty state naming the way out of itself, which is §6.50's
     *   rule, not a re-engagement nag. A sweep that cannot tell a way out from a summons is
     *   a sweep that will be answered by deleting good copy.
     */
    const said = sentences().filter(
      ([key, text]) =>
        key !== 'stats.longestStreak' &&
        /\b(streak|on a roll|don'?t break|keep it (up|going)|days since you)\b/i.test(text),
    );
    expect(said.map(([key]) => key), 'copy.ts has picked up streak language').toEqual([]);
    // And the exempted one is still the retrospective wording it was exempted for.
    expect(COPY.stats.longestStreak).toMatch(/^Longest/);
  });

  it('sends notifications about the world and never about the person', () => {
    /*
     * Refusal 3. Every notification this product can send is news that a thing aired. The
     * three options are the calendar's and there is deliberately no fourth, louder one —
     * `late-edition.md` said so in its own refusals and nothing had ever held it.
     */
    expect(NOTIFY_OPTIONS.map((o) => o.key)).toEqual(['off', 'milestones', 'all']);
    for (const option of NOTIFY_OPTIONS) {
      expect(
        /\byou (have not|haven'?t|are|left|forgot)\b|\bremind\b|\bstreak\b/i.test(option.hint),
        `the ${option.key} notification is about the person, not about a title: ${option.hint}`,
      ).toBe(false);
    }
  });

  it('never tells anybody they are behind', () => {
    /*
     * Refusal 6. A count of unwatched episodes is a fact; *"3 behind"* is a debt against a
     * broadcast schedule nobody agreed to. `ui/row.ts` already argues the narrow version —
     * "a count, not a vague NEW badge" — and this is the general one.
     *
     * "Catch up" survives, and that is the boundary rather than an oversight: it names a
     * thing you can choose to do, in a sheet you opened, and `copy.ts` already distinguishes
     * it from "the show has not started". A sentence that *measures* you is what is out.
     */
    const said = sentences().filter(([, text]) =>
      /\b(behind|falling behind|you'?re missing|you have missed|catch up or)\b/i.test(text),
    );
    expect(said.map(([key]) => key), 'copy.ts has grown a "you are behind" sentence').toEqual([]);
  });

  // Renamed with the clause below: "a duration nobody has measured" was true until the
  // calibration ran, and reads afterwards as though running it would settle the matter.
  // It did run, and it ruled the duration out rather than supplying one.
  it('says how sure the match is as a share, and never as a duration the calibration ruled out', () => {
    /*
     * Not a calm refusal — a **seam** one, and it is here because this file is where
     * refusals live rather than because it is about attention. `docs/design/seams.md` §7.
     *
     * The finding is that a percentage is the wrong shape: Chalmers & Galani's own
     * prescription for a sensed position is an *extent* rather than a point, and nobody
     * does anything different at 73% than at 62% while "within about two seconds" tells you
     * whether to nudge. So the obvious improvement is to convert it, and this clause exists
     * to stop that happening before it is true.
     *
     * `confidence` is the share of matched landmarks agreeing on one offset.
     * `core/src/fingerprint/agreement.ts` records the same audio measuring 0.46 one way and
     * 0.17 the other, "for no reason except which microphone was worse" — a number that
     * halves while the position is identical is not measuring the position. The only
     * derivable positional bound is one frame, HOP_SIZE / SAMPLE_RATE = 23.22ms, far below
     * perception. And `toleranceMs` of 5,000 in that same file is a trap: it bounds two
     * *contributors'* reaction times.
     *
     * So a duration here would be **fabricated**, which is worse than an honest number of
     * the wrong shape.
     *
     * **The clause said "what lifts this is the calibration: matches at known offsets
     * across a range of confidences, positional error recorded. Delete it then, not
     * before." The calibration has now been run. It does not lift this clause; it makes it
     * permanent, and that sentence was the wrong half of the rule.**
     * `design/calibrate.mjs`, written up in `docs/research/12-what-a-match-knows.md`: 300
     * probes at known offsets through the real matcher, and confidence and positional error
     * are **orthogonal**. Noise takes the number from 0.90 to 0.24 and never moves the
     * position; self-similar audio moves the position twelve minutes and never touches the
     * number. Every confidence band carries the same worst error, r = 0.030, and the single
     * worst placement in the run — 725,995ms out — reported **93%**. A derived tolerance
     * would therefore have been *anti-correlated with the truth in exactly the case that
     * matters*: "93% sure, within about 0.2 seconds" over a placement twelve minutes wrong.
     * Written as a condition to be met, the rule would have expired into the fabrication it
     * exists to prevent, the moment somebody ran the measurement and did not read the
     * answer. Nothing lifts it.
     *
     * **What the calibration did produce is a second state, and it is covered here too.**
     * The runner-up offset `matchSample` used to discard says when the audio occurs in two
     * places, so `listenPlacedTwice` and `listenFollowingTwice` can say *this could be the
     * other one* — the honest revelation §7 wanted, arrived at from the opposite end, and
     * not a duration. They are held to the same needle and want it more than the first two
     * do: a sentence that admits doubt invites quantifying the doubt, and the quantity
     * still does not exist. How far apart two copies of a title sequence sit is a fact
     * about that episode's editing, not about this match.
     *
     * The needle is the unit and not the wording — all four sentences are free to be
     * reworded, and none may start reporting seconds.
     */
    const said = [
      COPY.watching.listenPlaced(73),
      COPY.watching.listenFollowing(73),
      COPY.watching.listenPlacedTwice(73),
      COPY.watching.listenFollowingTwice(73),
    ];
    for (const text of said) {
      expect(text, `a listening sentence reports a share: ${text}`).toMatch(/73%/);
      expect(
        /\d+(\.\d+)?\s*(s|sec|second|ms|millisecond|minute)|within about|give or take|±/i.test(text),
        `a listening sentence reports a duration derived from an uncalibrated confidence: ${text}`,
      ).toBe(false);
    }
  });
});
