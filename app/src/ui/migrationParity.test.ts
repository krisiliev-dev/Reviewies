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

  it('offers to match what was imported, in both places it is felt', () => {
    for (const [name, source] of [['web', web()], ['phone', phone()]] as const) {
      // Once on the screen that follows an import, and once on the Up Next that has
      // nothing to show because of it.
      expect(source.split('<MatchImports').length - 1, name).toBe(2);
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
