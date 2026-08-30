import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { COPY } from '@reviewies/core/copy';
import { MORE_INDEX } from '@reviewies/core/ui/moreIndex';
import { TAB_BAR } from '@reviewies/core/ui/tabIcon';

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
const DIRECTIONS =
  /\bCOPY\.\w+\.(signInToMake|signInToFollow)\(\s*(?:'([^']*)'|(COPY\.\w+\.\w+))/g;

/**
 * Every navigation label a person actually reads, from wherever it is now kept.
 *
 * It read `label: '…'` out of the two navigation files and nothing else, and §6.176 walked
 * straight through it: both More screens now read `MORE_INDEX`, so the literals this scanned
 * for were gone and `labels` came back with two entries on the web and none on the phone.
 * Every assertion below still passed its `wrong` check — against an empty set.
 *
 * That is the cost of giving words an owner, and the fix is not to put them back. A guard
 * about *what the navigation says* has to read the navigation's owner: the shared table, the
 * tab bar, and whatever a platform still keeps in its own file.
 */
function labelsIn(file: string): Set<string> {
  const source = stripComments(readFileSync(resolve(ROOT, file), 'utf8'));
  const found = new Set([...source.matchAll(/\blabel:\s*'([^']+)'/g)].map((m) => m[1]));
  if (source.includes('MORE_INDEX')) for (const row of MORE_INDEX) found.add(row.label);
  if (source.includes('TAB_BAR')) for (const tab of TAB_BAR) found.add(tab.label);
  return found;
}

/** And the destination a sentence is handed, which may be a literal or a reference. */
function destination(raw: string): string {
  const path = raw.match(/^COPY\.(\w+)\.(\w+)$/);
  if (!path) return raw;
  const value = (COPY as Record<string, Record<string, unknown>>)[path[1]]?.[path[2]];
  return typeof value === 'string' ? value : raw;
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
          const place = destination(match[2] ?? match[3]);
          if (!labels.has(place)) {
            wrong.push(`${relative(ROOT, file)}: sends people to "${place}"`);
          }
        }
      }
      // A platform that has stopped calling these at all would pass silently.
      expect(found, `nothing on the ${platform.name} points anybody anywhere`).toBeGreaterThan(1);
      expect(wrong).toEqual([]);
    });
  }
});
