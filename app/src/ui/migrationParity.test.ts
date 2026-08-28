import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';

/**
 * The migration, offered in the same places on both platforms.
 *
 * Both ends are checked end-to-end now. `app/smoke.mjs` imports a history into a fresh
 * profile and walks the whole journey; `mobile/smoke.mjs` does the same since §6.80.
 * This used to say the phone's end *could not* be driven, because importing goes
 * through the system document picker — which turned out to be a hidden file input on
 * web, answerable with `page.on('filechooser')`. An excuse that outlived the thing it
 * excused, which §6.59 is entirely about.
 *
 * What this still adds is a source-level comparison the browser cannot make cheaply:
 * that both platforms offer the same things in the same places. This is the pair that
 * has drifted before — four parity gaps in one sweep once, and the one that mattered
 * was a control the web had and the phone quietly did not.
 */
const ROOT = resolve(__dirname, '../../..');

const web = () => readFileSync(resolve(ROOT, 'app/src/screens/UpNext.tsx'), 'utf8');
const phone = () => readFileSync(resolve(ROOT, 'mobile/app/(tabs)/index.tsx'), 'utf8');

describe('the first run, on both platforms', () => {
  it('offers the import before it offers a search box', () => {
    for (const [name, source] of [['web', web()], ['phone', phone()]] as const) {
      expect(source, name).toContain('<ImportFiles');

      // Within the first-run block, not within the file: the caught-up screen offers a
      // search too and happens to be written first. Reading source order as screen
      // order is how this test failed the first time it ran.
      const firstRun = source.slice(source.indexOf('<ImportFormats'));
      // The premise of the app is that TV Time shut down. Leading with a search box
      // asks somebody holding years of history to start again.
      expect(firstRun.indexOf('<ImportFiles'), name).toBeLessThan(
        firstRun.indexOf('Find something to watch'),
      );
    }
  });

  it('offers to match what was imported, in all three places it is felt', () => {
    /*
     * This clause said *two*, and the two it named were the wrong two: "once on the
     * screen that follows an import, and once on the Up Next that has nothing to show
     * because of it".
     *
     * The second of those is the empty branch, and putting the only real offer there
     * means the offer disappears the moment it starts working. The first show to match
     * produces an Up Next entry, the screen leaves the empty branch, the panel unmounts,
     * and every show still waiting has nowhere in the app to be matched from. The comment
     * beside the original placement had already said what that costs — "matching what has
     * landed so far leaves the rest of the import behind it, unmatched and unoffered" —
     * and this clause pinned the arrangement that guarantees it.
     *
     * Measured (§6.101): after importing the demo library, the calendar read "2 imported
     * shows still need matching" and Up Next showed one matched show and no way to reach
     * the other two. Those two were *asks* — ambiguous matches — which is not a race that
     * resolves itself but a state that lasts until somebody answers it, and an unmatched
     * row is invisible to the calendar, to Discover and to everything keyed by a
     * provider ID.
     *
     * Three now: the post-import panel (which explains rather than offers, and carries
     * `autoStart={false}` for that reason), the empty Up Next, and the Up Next with a
     * list in it. The last two are conditioned on there being something unmatched.
     */
    for (const [name, source] of [['web', web()], ['phone', phone()]] as const) {
      expect(source.split('<MatchImports').length - 1, name).toBe(3);
      // And the two that are offers are guarded by the count, not by emptiness. An
      // unconditional one would render on a library that has nothing to match.
      expect(
        source.split('{unmatched && !importing ? <MatchImports').length - 1,
        `${name}: an offer not conditioned on anything being unmatched`,
      ).toBe(2);
    }
  });

  /**
   * The sentence itself moved into `COPY` in §6.80, so looking for the words in a screen
   * stopped proving anything about the screen. What matters was never where the string
   * lives — it is that neither platform reaches the caught-up sentence without first
   * asking whether anything is unmatched, and that the sentence still says what this
   * guard is named after.
   */
  it('does not promise a caught-up library it has not matched', () => {
    expect(COPY.upNext.allCaughtUp).toContain('All caught up');
    for (const [name, source] of [['web', web()], ['phone', phone()]] as const) {
      expect(source, name).toContain('COPY.upNext.allCaughtUp');
      expect(source, name).toContain('unmatched');
    }
  });

  /**
   * And the third state, which is neither of those. §6.80 watched the phone offer a
   * repair action over a library still being written, with a count that grew from 7 to
   * 12 while it was on screen.
   */
  it('says an import is still running rather than describing a settled library', () => {
    for (const [name, source] of [['web', web()], ['phone', phone()]] as const) {
      expect(source, name).toContain('COPY.upNext.stillImporting');
      // The repair is withheld while the import is in flight, on both platforms.
      expect(source, name).toMatch(/unmatched && !importing \? <MatchImports/);
    }
  });
});
