import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The migration, offered in the same places on both platforms.
 *
 * The web end of this is checked properly — app/smoke.mjs imports a history into a fresh
 * profile and walks the whole journey. The phone end cannot be: importing there goes
 * through the system document picker, which the react-native-web export has no way to
 * drive, so nothing end-to-end can reach the screen that follows an import.
 *
 * What is left to guard is that the phone has the same two offers at all. This is the
 * pair that has drifted before — four parity gaps were found in one sweep once, and the
 * one that mattered was a control the web had and the phone quietly did not.
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

  it('does not promise a caught-up library it has not matched', () => {
    for (const [name, source] of [['web', web()], ['phone', phone()]] as const) {
      // "All caught up" over two hundred unmatched imports reads as a broken app.
      expect(source, name).toContain('All caught up');
      expect(source, name).toContain('unmatched');
    }
  });
});
