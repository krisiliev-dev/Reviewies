import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './pairs';
import { blankLiterals, stripComments } from '@reviewies/core/test/source';

/**
 * The second signal, and whether anything is still listening to it.
 *
 * `matchSample` reports two things about a placement now: where it thinks the audio is,
 * and whether the same audio occurs somewhere else with an equally good claim on it.
 * `docs/research/12-what-a-match-knows.md` is why the second exists — 300 probes at known
 * offsets, and every probe that landed in a stretch of verbatim-repeated audio was placed
 * 725,995ms from where it actually was, at up to 93% sure. Confidence cannot see that and
 * never could; the runner-up can.
 *
 * **A signal computed and not consumed is the same as no signal, and costs more, because
 * the code looks fixed.** Every check in `continuous.test.ts` and `fingerprint.test.ts`
 * passes if `mobile/src/fingerprint/listen.ts` quietly stops handing the flag to
 * `shouldCorrect` — the guard would still be correct, still tested, and never asked. That
 * is the shape of the failure this repository has met over and over: `syncOnce` sat in the
 * core since the beginning while the phone's account screen advertised the feature and
 * nothing imported it. `coreWiring.test.ts` catches the symbol-level version of it; this
 * catches the argument-level one, which that scan cannot see because the symbol *is*
 * imported and called — just not told anything.
 *
 * Three threads, and each is a place the repair could rot without any other test noticing:
 *
 *  - the guard is told, wherever it is asked;
 *  - the web's one-shot carries the flag out of the matcher, since nothing downstream can
 *    recover it;
 *  - both screens can say the second thing, because on the one-shot path the sentence is
 *    the *only* consumer — there is no clock to check the placement against, so a screen
 *    that only knows the confident sentence places somebody twelve minutes wrong and tells
 *    them it went well.
 *
 * Comments and string literals are blanked before matching, for the reason §6.167 records:
 * a check that counts the word rather than the call cannot tell an explanation from a use,
 * and fails silently in the direction that marks dead wiring alive.
 */

const read = (path: string) => blankLiterals(stripComments(readFileSync(resolve(ROOT, path), 'utf8')));

/**
 * Where the guard is asked, outside the core that defines it — **found, not listed.**
 *
 * A hand-written list of call sites is the failure `pairs.ts` opens by describing: the
 * second call site gets added to the code and not to the list, and the guard reports
 * success over a file it never opened. There is exactly one caller today and it would be
 * very easy to write it down; deriving it is what makes a second one arrive already
 * covered.
 */
function callers(): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const entry of readdirSync(resolve(ROOT, at), { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (!/^(node_modules|dist|\.expo|\.tmp)$/.test(entry.name)) walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        if (/\bshouldCorrect\s*\(/.test(read(path))) out.push(path);
      }
    }
  };
  walk('app/src');
  walk('mobile/src');
  return out.sort();
}

describe('the runner-up reaches the things that can act on it', () => {
  it('finds the callers it is meant to be checking', () => {
    // A scan that silently matched nothing would pass every case below it, which is the
    // shape `coreWiring.test.ts` guards itself against in its first assertion.
    expect(callers()).toContain('mobile/src/fingerprint/listen.ts');
  });

  it.each(callers())('%s tells shouldCorrect whether the match named two places', (path) => {
    const source = read(path);
    // Every call, not merely one somewhere in the file: a second call site added later
    // without the flag is exactly the regression, and `.toContain` would not see it.
    const calls = [...source.matchAll(/shouldCorrect\s*\(/g)];
    expect(calls.length, `${path} no longer calls shouldCorrect at all`).toBeGreaterThan(0);

    for (const call of calls) {
      // From the call to the end of its argument list, by bracket depth — a regex for the
      // whole call cannot nest, and these arguments contain an object literal.
      let depth = 0;
      let end = call.index! + call[0].length - 1;
      for (; end < source.length; end++) {
        if (source[end] === '(') depth++;
        else if (source[end] === ')' && --depth === 0) break;
      }
      const args = source.slice(call.index!, end);
      expect(args, `${path} asks shouldCorrect without saying whether the match was ambiguous`)
        .toMatch(/\bambiguous\s*:/);
      expect(args, `${path} reports ambiguity without saying where the other place is, which refuses every ambiguous match`)
        .toMatch(/\balternativeGapMs\s*:/);
      /*
       * And the values have to come from somewhere, which is the half a plant walked
       * straight through: `ambiguous: false` mentions the word, satisfies the type, passes
       * every other test in the repository, and restores the defect exactly. A guard that
       * counts the word rather than the use marks dead wiring alive — §6.167 recorded that
       * for comments and then for string literals, and this is the same failure a third
       * time, in argument position.
       */
      expect(
        /\bambiguous\s*:\s*(true|false)\b/.test(args),
        `${path} hands shouldCorrect a hard-coded ambiguity instead of the match's`,
      ).toBe(false);
    }
  });

  it('the web one-shot carries the flag out of the matcher', () => {
    // `syncByListening` is the whole of the web's listening path, and `matchSample`'s
    // result does not survive it — whatever is not copied onto `CaptureResult` here is
    // gone before any screen sees it.
    //
    // What this cannot see is an expression that mentions the match and still throws the
    // answer away; `ambiguous: match.ambiguous && false` passes it. That is the line where
    // a source-level check stops, the same line `failureShown.test.ts` draws for itself —
    // it can tell whether the wire is connected, not whether current flows along it.
    // Closing it needs a behavioural test of `syncByListening`, which needs a microphone.
    const capture = read('app/src/fingerprint/capture.ts');
    expect(capture).toMatch(/ambiguous:\s*match\.ambiguous/);
    expect(
      /ambiguous:\s*(true|false)\b/.test(capture),
      'the web one-shot reports a hard-coded ambiguity rather than the matcher\'s',
    ).toBe(false);
  });

  it.each([
    ['app/src/watching/ListenSync.tsx', 'listenPlacedTwice'],
    ['mobile/src/watching/ListenSync.tsx', 'listenFollowingTwice'],
  ])('%s can say the sample might be somewhere else', (path, sentence) => {
    expect(read(path), `${path} only knows how to report a confident placement`).toContain(sentence);
  });
});
