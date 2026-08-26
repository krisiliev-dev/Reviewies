import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';
import { NOTIFY_OPTIONS, UPCOMING_DAYS } from '@reviewies/core/calendar/upcoming';
import { PAIRS, ROOT } from './pairs';
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

  it('keeps no exemption that no longer describes a difference', () => {
    const live = new Set(Object.keys(PAIRS).flatMap(drifted).map((d) => d.key));
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

  it('says "two months" only while that is how far the calendar looks', () => {
    // The sentence names a horizon and the horizon is a number somewhere else, which is
    // the shape a copy file makes newly possible to get wrong. It was 60 days on the web
    // and 30 on the phone until §6.51 — the same screen showing a different amount of
    // the future — so the number is worth pinning to the words.
    expect(UPCOMING_DAYS).toBe(60);
    expect(COPY.calendar.empty).toContain('two months');
  });

  it('offers a notification hint for every choice, in one voice', () => {
    // Both screens had their own copy of this list and all three hints had drifted.
    expect(NOTIFY_OPTIONS.map((o) => o.key)).toEqual(['off', 'milestones', 'all']);
    for (const option of NOTIFY_OPTIONS) {
      expect(option.hint.length, option.key).toBeGreaterThan(10);
    }
  });
});
