import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Which screen on the web is which screen on the phone.
 *
 * One list, imported by every guard that compares the two platforms — `offers.test.ts`
 * (where you can go and what you can change) and `copy.test.ts` (the words). Two lists
 * would be exactly the failure those guards exist to catch: a new screen added to one
 * comparison and forgotten in the other.
 */

export const ROOT = resolve(import.meta.dirname, '../../..');

/** Web screen file ↔ the phone file or files that stand in for it. */
export const PAIRS: Record<string, { web: string; phone: string[] }> = {
  '/': { web: 'UpNext.tsx', phone: ['(tabs)/index.tsx'] },
  '/search': { web: 'Search.tsx', phone: ['(tabs)/search.tsx'] },
  '/watchlist': { web: 'Watchlist.tsx', phone: ['(tabs)/watchlist.tsx'] },
  '/title': { web: 'TitleDetail.tsx', phone: ['title/[id].tsx'] },
  '/watching': { web: 'WatchingMode.tsx', phone: ['watching/[targetId].tsx'] },
  '/comments': { web: 'EpisodeComments.tsx', phone: ['comments/[targetId].tsx'] },
  '/discover': { web: 'Discover.tsx', phone: ['(tabs)/discover.tsx'] },
  '/calendar': { web: 'Calendar.tsx', phone: ['calendar.tsx'] },
  '/lists': { web: 'Lists.tsx', phone: ['lists.tsx'] },
  '/people': { web: 'People.tsx', phone: ['people.tsx'] },
  '/stats': { web: 'Stats.tsx', phone: ['stats.tsx'] },
  // The web keeps the account panel, the data tools and the preferences on one screen;
  // the phone splits them into two pushed screens. Compared as a unit, because what
  // matters is whether the same things can be done, not on how many screens.
  '/settings': { web: 'Settings.tsx', phone: ['data.tsx', 'account.tsx'] },
  '/more': { web: 'More.tsx', phone: ['(tabs)/more.tsx'] },
};

/** Files that are not one half of a pair, and why. */
export const UNPAIRED_WEB: Record<string, string> = {
  'NotFound.tsx': 'the phone’s +not-found is expo-router’s own; nothing to compare',
  'AccountPanel.tsx': 'a component of Settings, not a screen — compared as part of it',
};

export const UNPAIRED_PHONE: Record<string, string> = {
  '+not-found.tsx': 'expo-router’s own; see NotFound.tsx',
  'remote.tsx': 'the drawer is a screen on the phone and an overlay on the web, so there is no web file to read',
};


/** Every phone screen file, as `PAIRS` spells them. */
export function phoneScreenFiles(): string[] {
  const base = resolve(ROOT, 'mobile/app');
  const walk = (dir: string, prefix: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`, out);
      else if (entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') out.push(prefix + entry.name);
    }
    return out;
  };
  return walk(base, '');
}

/** Every web screen file. */
export function webScreenFiles(): string[] {
  return readdirSync(resolve(ROOT, 'app/src/screens')).filter((f) => f.endsWith('.tsx'));
}
