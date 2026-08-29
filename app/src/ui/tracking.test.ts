import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Saying a show is tracked, when it is tracked.
 *
 * `track()` was `addToLibrary` and then `getEpisodesCached` **awaited**, with the state set
 * only after both. Against the fixture that is one resolved promise; against a real
 * provider it is one request per season, and for a 1,220-episode show twenty-four of them —
 * over thirty seconds during which the button still reads *Track* and nothing on the screen
 * has changed. §6.151's real-data pass gave up waiting for the label.
 *
 * The show **is** tracked by the line above. The episodes are a separate promise, and
 * §6.153 measured that they land whether or not the person stays on the screen: tracked,
 * left after 150 milliseconds, and the count arrived exactly as it did for somebody who
 * waited.
 *
 * That measurement was true and its scope was narrower than the sentence it was written
 * into. Navigating *within* the app keeps the document, so the promise keeps running.
 * §6.154 measured the other case — reload the page, which is what backgrounding an app is
 * — and the fetch dies with the document. So something **is** traded away, and the last
 * clause here is what buys it back: Up Next fills in the shows that have nothing behind
 * them, every time it opens. Without that clause the four above are a show in your library
 * that Up Next has no episodes for and nothing that would ever look again.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const SCREENS = [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')];

/** The four places a control reports that something has been added to the library. */
const ADDING = [
  'app/src/screens/Search.tsx',
  'mobile/app/(tabs)/search.tsx',
  'app/src/screens/Discover.tsx',
  'mobile/app/(tabs)/discover.tsx',
];

describe('adding a show to the library', () => {
  it('does not wait on its episodes before saying so', () => {
    for (const file of ADDING) {
      const source = withoutProse(read(file));
      expect(source, `${file} awaits the episode fetch before reporting`).not.toMatch(
        /await getEpisodesCached\(/,
      );
      expect(source, `${file} does not fetch the episodes at all`).toMatch(
        /void getEpisodesCached\([^)]*\)\.catch\(/,
      );
    }
  });

  it('reports before it fetches, not after', () => {
    /*
     * Order, not just the absence of an `await`. A floating fetch started *before* the
     * state is set is the same wait with the same button, one line further up.
     */
    for (const file of ADDING) {
      const source = withoutProse(read(file));
      const reported = Math.max(source.indexOf("setAdded('library')"), source.indexOf('onActed()'));
      const fetched = source.indexOf('void getEpisodesCached(');
      expect(reported, `${file} never reports`).toBeGreaterThan(-1);
      expect(fetched, `${file} never fetches`).toBeGreaterThan(-1);
      expect(fetched, `${file} fetches before it reports`).toBeGreaterThan(reported);
    }
  });

  it('still awaits the two writes that the report is about', () => {
    // The library row is what "Tracking" claims, and that one *is* a dependency.
    for (const file of ADDING) {
      expect(withoutProse(read(file)), `${file} does not await the library write`).toMatch(
        /await addToLibrary\(/,
      );
    }
  });

  it('leaves the screens that are about episodes awaiting them', () => {
    /*
     * Non-vacuity, and the boundary. A title page's whole content is the episode list, so
     * it waits — the sweep must not read as "never await this call".
     */
    for (const file of ['app/src/screens/TitleDetail.tsx', 'mobile/app/title/[id].tsx']) {
      expect(withoutProse(read(file)), `${file} stopped waiting for what it shows`).toMatch(
        /await getEpisodesCached\(/,
      );
    }
  });

  it('is finished by the screen where an unfinished one would show', () => {
    /*
     * The other half of dropping the `await`. §6.154: the fetch is a promise on a document
     * that can be torn down — a reload, a backgrounded app, a killed tab — and when it is,
     * the show sits in the library with no episodes. `refreshTracked` has always known how
     * to fix that ("never fetched at all is the stalest thing there is, and it happens")
     * and only the calendar ever ran it, so the one screen that could not see the hole was
     * the only one closing it.
     */
    for (const [name, file] of [
      ['web', 'app/src/screens/UpNext.tsx'],
      ['phone', 'mobile/app/(tabs)/index.tsx'],
    ] as const) {
      const source = withoutProse(read(file));
      expect(source, `${name}'s Up Next never fills in a show with no episodes`).toMatch(
        /void requestFill\(\)/,
      );
      // The narrow pass, not the full one: the full one refetches twenty-five shows on age
      // and sweeps the metadata cache, on the first screen of every launch.
      expect(source, `${name}'s Up Next runs the full refresh on open`).not.toMatch(
        /requestRefresh\(/,
      );
    }
  });

  it('has no fifth site quietly doing it the old way', () => {
    const waiting = SCREENS.filter((f) => /await getEpisodesCached\(/.test(withoutProse(read(f))));
    expect(waiting.sort()).toEqual(
      ['app/src/screens/TitleDetail.tsx', 'mobile/app/title/[id].tsx'].sort(),
    );
  });
});
