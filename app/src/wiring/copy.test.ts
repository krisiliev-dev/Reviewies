import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';
import { NOTIFY_OPTIONS, UPCOMING_DAYS } from '@reviewies/core/calendar/upcoming';
import { componentPairs, PAIRS, ROOT } from './pairs';
import { stripComments } from '@reviewies/core/test/source';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The same screen, saying two different things.
 *
 * §6.49 measured four states whose wording had drifted between the platforms and fixed
 * two, parking the rest on the grounds that the fix was *a decision about who owns the
 * words*. §6.50 then showed what happens when nothing owns a comparison: a dead end was
 * found on the web's Calendar, fixed there, and left standing on the phone.
 *
 * `core/src/copy.ts` is that owner for sentences a person meets on both platforms. This
 * guard is what stops new ones being written twice: it reads the prose out of each pair
 * of screens and fails when one side says something *nearly* the same as the other.
 *
 * Nearly, not differently — two screens saying unrelated things is normal, and a phone
 * that has one control the web does not should say so in its own words. What is caught
 * is the recognisable case: the same sentence, reworded, which is what drift looks like
 * before anybody notices it is drift.
 */

/**
 * Divergences that are deliberate, one line each saying why.
 *
 * Keyed by the web's version, which is enough to identify the pair and reads as the
 * thing being exempted.
 */
const EXEMPT: Record<string, string> = {};

/** One copy, in the core, since §6.72. */
const strip = stripComments;

/**
 * Sentences a person reads: JSX text, and the props that become text — placeholders and
 * the labels a screen reader says out loud.
 *
 * Three words minimum, and nothing containing the punctuation of code, because the text
 * between a `>` and a `<` is only prose about half the time in a file like this.
 */
export function sentences(source: string): string[] {
  const src = strip(source);
  const found = new Set<string>();
  const keep = (raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!/[a-z]{2}/i.test(text)) return;
    if (text.split(' ').length < 3) return;
    if (/[(){}[\];=<>|&$`_]|=>|\bconst\b|\buseState\b|\breturn\b/.test(text)) return;
    if (!/^[A-Za-z“"']/.test(text)) return;
    found.add(text);
  };
  for (const m of src.matchAll(/>([^<>{}]{6,})</g)) keep(m[1]);
  for (const m of src.matchAll(
    /\b(?:placeholder|aria-label|accessibilityLabel|accessibilityHint|title|label)=["']([^"']{6,})["']/g,
  )) {
    keep(m[1]);
  }
  for (const m of src.matchAll(/\{\s*['"]([^'"]{6,})['"]\s*\}/g)) keep(m[1]);

  /**
   * And the names built out of a template, which is where a control's name usually lives.
   *
   * These props are read above only as quoted literals, and a name that includes the
   * title is not one: it is `` name={`Add ${result.name} to watchlist`} ``. So the two
   * search screens announced the same button as *"Add X to watchlist"* and *"Add X to
   * your watchlist"* for as long as both have existed, and this guard — whose whole
   * subject is the same sentence written twice — could not see either of them. §6.98
   * gave the words one owner and then compared only half of them.
   *
   * The interpolations become one constant word so the comparison is about the prose
   * around them rather than about what was substituted in.
   */
  for (const m of src.matchAll(
    /\b(?:placeholder|aria-label|accessibilityLabel|accessibilityHint|title|label|name)=\{`([^`]{6,})`\}/g,
  )) {
    keep(m[1].replace(/\$\{[^}]*\}/g, 'something'));
  }
  for (const m of src.matchAll(/['"]([A-Z][^'"]{15,})['"]/g)) keep(m[1]);

  /**
   * And the shared sentences, resolved.
   *
   * Without this the guard has a hole exactly where the fix went: a screen that has
   * moved its wording into `COPY` has no literal left to compare, so the *other*
   * platform could quietly keep — or grow — its own version and nothing would notice.
   * Checked by planting that case: reverting one phone screen to its old literal has to
   * fail this suite, and does.
   */
  for (const m of src.matchAll(/\bCOPY\.([A-Za-z]+)\.([A-Za-z]+)/g)) {
    const group = (COPY as Record<string, Record<string, unknown>>)[m[1]];
    const value = group?.[m[2]];
    if (typeof value === 'string') keep(value);
    /*
     * And the ones that take an argument, which is most of the names.
     *
     * Resolving only strings left the hole this block exists to close, one type across:
     * move a name into `COPY.controls.addToWatchlist(name)` and the *web* stops
     * contributing a sentence at all, so the phone can keep its own spelling and nothing
     * pairs with it. Planted exactly that — reverted the phone's search row to
     * `` `Add ${name} to watchlist` `` after both sides had been moved into the owner —
     * and this suite passed. A guard that stops seeing a thing once it has been fixed is
     * a guard that only works until it has done its job once.
     *
     * Called with a placeholder per parameter. What comes back may read oddly for a
     * numeric one; it reads *identically* oddly on both sides, which is all a comparison
     * needs.
     */
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => unknown;
      try {
        const out = fn(...Array.from({ length: fn.length }, () => 'something'));
        if (typeof out === 'string') keep(out);
      } catch {
        // A shared sentence that cannot be built from placeholders tells us nothing here.
      }
    }
  }
  return [...found];
}

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );

/** Dice coefficient over words: 1 is the same sentence, 0 shares nothing. */
export function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/**
 * 0.45 of the words in common. Measured rather than guessed: every real divergence this
 * found scored 0.60 or above, and the highest-scoring false positive — two unrelated
 * Watching Mode controls that both talk about the clock — scored 0.44. The gap is
 * comfortable because reworded copy keeps most of its nouns.
 */
const NEARLY = 0.45;

/** Every near-match between a pair of screens, as an EXEMPT key would spell it. */
function drifted(route: string): Array<{ key: string; web: string; phone: string; score: number }> {
  const { web, phone } = PAIRS[route];
  const webText = sentences(read(`app/src/screens/${web}`));
  const phoneText = sentences(phone.map((file) => read(`mobile/app/${file}`)).join('\n'));

  const out: Array<{ key: string; web: string; phone: string; score: number }> = [];
  const claimed = new Set<string>();
  for (const a of webText) {
    if (phoneText.includes(a)) continue;
    let best: string | undefined;
    let score = 0;
    for (const b of phoneText) {
      const s = similarity(a, b);
      if (s > score) {
        score = s;
        best = b;
      }
    }
    // One phone sentence answers for one web sentence: without this a single reworded
    // line pairs with three neighbours and reports three findings.
    if (best && score >= NEARLY && !claimed.has(best)) {
      claimed.add(best);
      out.push({ key: `${route} · ${a}`, web: a, phone: best, score });
    }
  }
  return out;
}

/** The same comparison between two same-named components. §6.147. */
function driftedComponent(name: string): Array<{ key: string; phone: string; score: number }> {
  const webText = sentences(read(`app/src/ui/${name}`));
  const phoneText = sentences(read(`mobile/src/ui/${name}`));
  const out: Array<{ key: string; phone: string; score: number }> = [];
  const claimed = new Set<string>();
  for (const a of webText) {
    if (phoneText.includes(a)) continue;
    let best: string | undefined;
    let score = 0;
    for (const b of phoneText) {
      const s = similarity(a, b);
      if (s > score) {
        score = s;
        best = b;
      }
    }
    if (best && score >= NEARLY && !claimed.has(best)) {
      claimed.add(best);
      out.push({ key: `ui/${name} · ${a}`, phone: best, score });
    }
  }
  return out;
}

/**
 * Sentences nothing reads, and why that is allowed.
 *
 * Empty, and it should stay that way: a sentence in this file that no screen renders is
 * either dead or a screen that forgot it. §6.73.
 */
/** Every source file under a tree, skipping tests and build output. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const UNREAD_ON_PURPOSE: string[] = [];

/**
 * Where a person can be spoken to, discovered rather than listed.
 *
 * §6.157's lesson, and `emptyStates.test.ts` had the other half of it: a clause that reads
 * four hand-named files cannot see a fifth, and the fifth is always the one somebody added
 * last. These are trees, so a new screen is swept the day it is written.
 */
const WEB_TREES = ['app/src'];
const PHONE_TREES = ['mobile/app', 'mobile/src'];

function screenFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-real', '.expo'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) screenFiles(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/**
 * A sentence, as distinct from a label.
 *
 * The line is the full stop. Something ending in `.`, `?` or `!` is the product *speaking*
 * — an explanation, a refusal, a reassurance — and that is what `copy.ts` is the owner of.
 * A control's name is a different kind of text with a different owner (`COPY.controls`,
 * and `labelSet.test.ts` holds those), so it is not swept here.
 *
 * That line is a floor, not a finish. §6.175 measured **67** shorter pieces of text still
 * typed on both platforms after this sprint moved the twenty-five sentences — *"Create
 * account"*, *"Change poster"*, *"Leave Watching Mode"* — every one of them the same defect
 * at a smaller size. Lowering this threshold is how they get found; it is written as one
 * constant so that a later sprint can lower it and read off the damage.
 */
const PROSE_FLOOR = 25;
const isProse = (text: string) =>
  text.length >= PROSE_FLOOR && /\s/.test(text) && /^[A-Z]/.test(text) && /[.?!]$/.test(text);

/**
 * The prose a file **types**, as opposed to the prose it reads.
 *
 * Deliberately not `sentences()`: that one resolves `COPY.x.y` into its text, which is
 * right for comparing what two screens *say* and exactly wrong for finding who *owns* the
 * words. A sentence reached through `COPY.` is not in the file. One typed into the file is,
 * and that is the whole subject here.
 */
export function typedLiterals(source: string): Set<string> {
  const src = strip(source);
  const found = new Set<string>();
  const keep = (raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (isProse(text)) found.add(text);
  };
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) keep(m[1]);
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) keep(m[1]);
  for (const m of src.matchAll(/>([^<>{}]+)</g)) keep(m[1]);
  return found;
}

/** Every typed sentence on each platform, with the files that type it. */
function typedProse(): { web: Map<string, string[]>; phone: Map<string, string[]> } {
  const side = (trees: string[]) => {
    const out = new Map<string, string[]>();
    for (const tree of trees) {
      for (const file of screenFiles(tree)) {
        for (const text of typedLiterals(read(file))) {
          out.set(text, [...(out.get(text) ?? []), file]);
        }
      }
    }
    return out;
  };
  return { web: side(WEB_TREES), phone: side(PHONE_TREES) };
}

/** Every sentence `copy.ts` already owns, as text. */
function ownedSentences(): Set<string> {
  const out = new Set<string>();
  for (const group of Object.values(COPY)) {
    for (const value of Object.values(group as Record<string, unknown>)) {
      if (typeof value === 'string' && isProse(value)) out.add(value);
    }
  }
  return out;
}

/**
 * A sentence with more than one owner, in either of the two shapes that takes.
 *
 * The first shape is the one §6.175 measured: both platforms typing it, nothing owning it.
 * The second is what the fix for the first *creates* — once the web reads `COPY`, it has no
 * literal left to be compared against, so the phone can keep or grow its own copy and an
 * intersection rule sees nothing. `sentences()` names that hole in its own comment about
 * resolving `COPY.x.y`; this is the same hole one layer out, and a plant walked straight
 * through the first version of this clause because of it.
 *
 * So the rule is not "the same on both sides". It is: **a sentence `copy.ts` owns may not
 * be typed anywhere**, and on top of that, a sentence typed on both platforms is duplicated
 * whether or not anybody has moved it yet. The first half is what fails on a regression;
 * the second is what fails on a new pair written from scratch.
 */
function duplicatedProse(): Array<{ text: string; where: string; why: string }> {
  const { web, phone } = typedProse();
  const owned = ownedSentences();
  const out: Array<{ text: string; where: string; why: string }> = [];
  for (const [text, files] of [...web, ...phone]) {
    if (owned.has(text)) {
      out.push({ text, where: files.join(', '), why: 'copy.ts already owns this sentence' });
    }
  }
  for (const [text, files] of web) {
    if (!owned.has(text) && phone.has(text)) {
      out.push({
        text,
        where: `${files.join(', ')} + ${phone.get(text)!.join(', ')}`,
        why: 'typed on both platforms, owned by neither',
      });
    }
  }
  return out;
}

describe('the words, on both platforms', () => {
  it('does not say the same thing two ways', () => {
    const unexplained = Object.keys(PAIRS)
      .flatMap(drifted)
      .filter((d) => !EXEMPT[d.key])
      .map((d) => `${d.key}\n     phone: ${d.phone}`);
    // Read the failure as: these two sentences are the same sentence, written twice.
    // Move it to core/src/copy.ts and use it from both sides — or, if the difference is
    // deliberate, say why in EXEMPT above.
    expect(unexplained).toEqual([]);
  });

  it('does not say it two ways in a component either', () => {
    /*
     * The guard compared routes and stopped there, and the two platforms carry
     * twenty-three same-named components. Two divergences were sitting in them. §6.147.
     */
    const names = componentPairs();
    expect(names.length, 'no components are being compared at all').toBeGreaterThan(10);
    const unexplained = names
      .flatMap(driftedComponent)
      .filter((d) => !EXEMPT[d.key])
      .map((d) => `${d.key}\n     phone: ${d.phone}`);
    expect(unexplained).toEqual([]);
  });

  it('keeps no exemption that no longer describes a difference', () => {
    const live = new Set([
      ...Object.keys(PAIRS).flatMap(drifted).map((d) => d.key),
      ...componentPairs().flatMap(driftedComponent).map((d) => d.key),
    ]);
    expect(Object.keys(EXEMPT).filter((key) => !live.has(key))).toEqual([]);
  });

  it('reads prose, and enough of it to be comparing anything', () => {
    // Non-vacuity: every assertion above passes if the extractor returns nothing, which
    // is what a change in how these screens are written would cause, silently.
    const watching = sentences(read('app/src/screens/WatchingMode.tsx'));
    expect(watching.length).toBeGreaterThan(5);
    expect(watching).toContain('Tap the moment you press play. You can nudge the timing at any point.');
    // And that it does not simply call everything prose.
    expect(sentences(read('app/src/screens/WatchingMode.tsx')).join(' ')).not.toContain('useState');
  });

  it('is used, rather than being a file of strings nobody reads', () => {
    // A copy module the screens have stopped importing would leave every assertion
    // above passing while the words drift apart again in the screens themselves.
    const importers = [
      ...Object.values(PAIRS).map((p) => `app/src/screens/${p.web}`),
      ...Object.values(PAIRS).flatMap((p) => p.phone.map((f) => `mobile/app/${f}`)),
    ].filter((file) => read(file).includes('@reviewies/core/copy'));
    expect(importers.length).toBeGreaterThan(8);
  });

  /**
   * Every sentence is read by something, not just the file.
   *
   * The check above proves `copy.ts` is *imported* — nine paired screens reach for it —
   * and §6.73 found that is a weaker claim than its neighbours read as. A whole group
   * added to `COPY` and referenced by nothing passed every assertion in this file and
   * every other guard in the directory: the words sat there looking maintained.
   *
   * That matters more as the file grows. `COPY.sync.*` arrived in §6.71 and
   * `COPY.app.*` in §6.65; if a screen stopped rendering one, the sentence would stay,
   * and the next person to change it would be editing something nobody sees.
   *
   * The same shape as `coreWiring`'s unreached-export check, one layer down — and like
   * that one, it carries an explained-exemption map rather than a blanket allowance.
   */
  it('has no sentence that nothing anywhere reads', () => {
    /** Leaves of COPY, as `group.name`. */
    const leaves: string[] = [];
    for (const [group, entries] of Object.entries(COPY)) {
      for (const name of Object.keys(entries as Record<string, unknown>)) {
        leaves.push(`${group}.${name}`);
      }
    }
    expect(leaves.length).toBeGreaterThan(30);

    // Every place a sentence could legitimately be reached from. The core counts:
    // `time.ts` formats a day with `COPY.calendar.today`, and `sync/clock.ts` builds its
    // warning from `COPY.app.clockWrong`.
    const haystack = ['core/src', 'app/src', 'mobile/app', 'mobile/src']
      .flatMap((tree) => sources(resolve(ROOT, tree)))
      .filter((file) => !file.includes('copy.ts'))
      .map((file) => strip(readFileSync(file, 'utf8')))
      .join('\n');

    const unread = leaves.filter((leaf) => !haystack.includes(`COPY.${leaf}`));
    expect(unread, `nothing reads ${unread.join(', ')}`).toEqual(UNREAD_ON_PURPOSE);
  });

  it('keeps no reason for a sentence that is read after all', () => {
    // §6.41's rule again: an excuse outlives the thing it excuses unless something says.
    const leaves = new Set(
      Object.entries(COPY).flatMap(([group, entries]) =>
        Object.keys(entries as Record<string, unknown>).map((name) => `${group}.${name}`),
      ),
    );
    expect(UNREAD_ON_PURPOSE.filter((leaf) => !leaves.has(leaf))).toEqual([]);
  });

  it('says "two months" only while that is how far the calendar looks', () => {
    // The sentence names a horizon and the horizon is a number somewhere else, which is
    // the shape a copy file makes newly possible to get wrong. It was 60 days on the web
    // and 30 on the phone until §6.51 — the same screen showing a different amount of
    // the future — so the number is worth pinning to the words.
    expect(UPCOMING_DAYS).toBe(60);
    expect(COPY.calendar.empty).toContain('two months');
  });

  it('tells an imported library why the calendar is empty, on both screens', () => {
    /*
     * §6.56's rule one screen further on: an empty state is a claim about somebody's own
     * data, and this one was making the wrong claim. An imported show has no air dates
     * until matching gives it a provider ID — an export carries names and watch dates and
     * nothing else — so somebody who had just brought in eleven shows was told to "track a
     * show that is still running".
     *
     * Both screens, because a sentence that exists in the core and is read by one platform
     * is the drift §6.53 built this file to stop.
     */
    expect(COPY.calendar.emptyUnmatched(1)).toContain('One imported show');
    expect(COPY.calendar.emptyUnmatched(3)).toContain('3 imported shows');
    // It still says what is *also* true, so the sentence replaces the other rather than
    // leaving somebody wondering whether anything is airing.
    for (const n of [1, 3]) expect(COPY.calendar.emptyUnmatched(n)).toContain('two months');

    for (const path of ['app/src/screens/Calendar.tsx', 'mobile/app/calendar.tsx']) {
      const source = read(path);
      expect(source, `${path} does not use it`).toContain('COPY.calendar.emptyUnmatched');
      // And decides which sentence from the count rather than always showing one.
      expect(source, `${path} shows it unconditionally`).toContain('unmatched ?');
      expect(source, `${path} never asks how many are unmatched`).toContain(
        'unmatchedImportCount',
      );
    }
  });

  it('has no sentence both platforms type out for themselves', () => {
    /*
     * The hole in this file's own subject, and the one it was written to close.
     *
     * `drifted` above opens with `if (phoneText.includes(a)) continue;`, and it has to:
     * `sentences()` resolves `COPY.x.y` into its text, so a sentence properly owned by
     * `copy.ts` appears identically on both sides and would otherwise be reported as
     * drift by every screen that reads it. But the skip does not only pass over the
     * *fixed* case. It passes over the *unfixed* one too — two screens that each type the
     * same sentence out by hand score 1.0 and are skipped for the same reason. So this
     * guard, whose header says it "stops new ones being written twice", could only ever
     * see a sentence that had **already** been written twice and then edited on one side.
     * It caught drift. It never caught duplication, which is what drift starts as.
     *
     * §6.162 wrote the reason down — "the four literals agreed, by hand, for as long as
     * nobody edited one of them" — fixed the four empty states it had found by
     * enumerating them, and left the general case. §6.175 measured it: **95** pieces of
     * user-facing text appeared verbatim in both a web file and a phone file, twenty-five
     * of them whole sentences, including the entire spoiler gate on the comments screen
     * and the migration prose on the screen the product opens on.
     *
     * The distinction that makes this checkable is *literal versus reference*. A sentence
     * reached through `COPY.` is not in the file; a sentence typed into the file is. So
     * this reads only what is typed, and fails when the same typing appears on both
     * platforms — the shape §6.98 exists to prevent, stated as a sweep rather than as an
     * intention.
     */
    expect(
      duplicatedProse().map((d) => `${d.why}\n     ${d.text}\n     in: ${d.where}`),
      'a sentence has more than one owner — move it to core/src/copy.ts and read it',
    ).toEqual([]);
  });

  it('reads enough typed prose for that sweep to be looking at anything', () => {
    /*
     * §6.121's clause, and it is not hypothetical here: `duplicatedProse` returns nothing
     * if `PROSE` stops matching, if the trees move, or if a build directory starts being
     * walked and swamps the comparison. All three would leave the assertion above green
     * over a codebase that had gone back to typing everything twice.
     *
     * Both sides, separately, because a sweep that reads only the web would report an
     * empty intersection forever.
     */
    const seen = typedProse();
    expect(seen.web.size, 'no typed prose found on the web at all').toBeGreaterThan(8);
    expect(seen.phone.size, 'no typed prose found on the phone at all').toBeGreaterThan(6);
    // And that it is prose rather than everything: `useState` must not survive the sieve.
    expect([...seen.web.keys(), ...seen.phone.keys()].join(' ')).not.toContain('useState');
  });

  it('offers a notification hint for every choice, in one voice', () => {
    // Both screens had their own copy of this list and all three hints had drifted.
    expect(NOTIFY_OPTIONS.map((o) => o.key)).toEqual(['off', 'milestones', 'all']);
    for (const option of NOTIFY_OPTIONS) {
      expect(option.hint.length, option.key).toBeGreaterThan(10);
    }
  });
});
