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
});
