import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';

/**
 * A sentence that sends somebody somewhere has to name a place that exists.
 *
 * `COPY.lists.signInToMake` and `COPY.people.signInToFollow` are parameterised on
 * purpose: the destination genuinely has two names, and the sentence is shared while the
 * noun is not. That seam is also where the drift got in. The web passed `'Data tab'`,
 * which was true until §6.79 cut its eight tabs down to five and moved everything else
 * behind More — after which somebody signed out on Lists was told to go to a tab that no
 * longer existed, under a name nothing on screen used.
 *
 * Nothing caught it. `copy` owns the sentence and checks it thoroughly; the noun is an
 * argument at the call site, and an argument is not the sentence. §6.78 found it by
 * opening the app.
 *
 * So: every string handed to one of these has to be a label the platform's own
 * navigation renders. Both platforms keep their navigation as a literal array — the
 * web's in `More.tsx`, the phone's in `(tabs)/more.tsx` — which is what makes this
 * checkable rather than a matter of remembering.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/** The functions whose argument is a place somebody is being sent to. */
const DIRECTIONS = /\bCOPY\.\w+\.(signInToMake|signInToFollow)\(\s*'([^']*)'/g;

/** Every `label: '…'` in a navigation source, which is what a person actually reads. */
function labelsIn(file: string): Set<string> {
  const source = stripComments(readFileSync(resolve(ROOT, file), 'utf8'));
  return new Set([...source.matchAll(/\blabel:\s*'([^']+)'/g)].map((m) => m[1]));
}

const PLATFORMS = [
  {
    name: 'web',
    tree: 'app/src',
    // The tab bar is in App.tsx and the rest of the navigation is the More screen.
    navigation: ['app/src/App.tsx', 'app/src/screens/More.tsx'],
  },
  {
    name: 'phone',
    tree: 'mobile/app',
    navigation: ['mobile/app/(tabs)/more.tsx'],
  },
];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('where a signed-out screen sends you', () => {
  for (const platform of PLATFORMS) {
    const labels = new Set(platform.navigation.flatMap((file) => [...labelsIn(file)]));

    it(`finds the ${platform.name}'s navigation labels rather than an empty set`, () => {
      expect(labels.size).toBeGreaterThan(3);
      // Both platforms have this one, and it is the destination in question.
      expect(labels).toContain('Stats');
    });

    it(`only sends people to a place the ${platform.name} names`, () => {
      const wrong: string[] = [];
      let found = 0;
      for (const file of sources(resolve(ROOT, platform.tree))) {
        const source = stripComments(readFileSync(file, 'utf8'));
        DIRECTIONS.lastIndex = 0;
        let match;
        while ((match = DIRECTIONS.exec(source))) {
          found++;
          if (!labels.has(match[2])) {
            wrong.push(`${relative(ROOT, file)}: sends people to "${match[2]}"`);
          }
        }
      }
      // A platform that has stopped calling these at all would pass silently.
      expect(found, `nothing on the ${platform.name} points anybody anywhere`).toBeGreaterThan(1);
      expect(wrong).toEqual([]);
    });
  }
});
