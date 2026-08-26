import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAIRS, ROOT, UNPAIRED_PHONE, UNPAIRED_WEB, phoneScreenFiles, webScreenFiles } from './pairs';
import { stripComments } from '@reviewies/core/test/source';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * What each screen *offers*, compared across the two platforms.
 *
 * Parity has been checked twice before (#48, #49) by asking which screens exist on both
 * — and both times it came back clean, because the phone does have a Discover and does
 * have a Lists. What that question cannot see is a screen that is present and inert. On
 * the phone, Discover was a list of links: the screen whose entire job is getting
 * something into your library made you open the title to do it. A list you had made
 * could not be opened from the Lists screen at all. Search would not log a film you had
 * already seen. Every one of those screens is "at parity" by name.
 *
 * So this asks the other question: for each pair of screens, where can you *go* from
 * here and what can you *change* from here. Two sets per screen, read out of the source:
 *
 *  - the destination routes it offers — `<Link to>`/`navigate()` on the web,
 *    `<Link href>`/`router.push()` on the phone, reduced to their first segment so
 *    `/title/${id}` and `/title/:id` are the same destination
 *  - the writers it calls — anything imported from `@reviewies/core` whose name begins
 *    like a verb that changes something (`add`, `mark`, `remove`, `set`, …)
 *
 * A difference is not automatically a bug: the phone reaches People from its More tab
 * rather than from Settings, and that is a real structural difference between a tab bar
 * and a settings page. But it has to be *said*, in a sentence, in EXEMPT below. The
 * failure this guard exists to prevent is the silent kind — a screen that quietly
 * offers less on one side than the other and passes every check that counts screens.
 *
 * Deliberately shallow: it reads each screen's own file and does not follow imports into
 * shared components. Following them would make the two sides incomparable (the web's
 * `AddToList` has no phone twin as a file), and the differences that have mattered were
 * all in the screen itself.
 */

/**
 * Differences that are real and intended. One line each, and the line has to say why
 * the other platform is not worse off for the difference.
 */
const EXEMPT: Record<string, string> = {
  '/settings web-only →/people':
    'the phone reaches People from the More tab, which is where its whole second tier lives; the web has no More tab so Settings carries the link',
  '/calendar web-only setPreference()':
    'the phone reaches the same core setter through syncPreference in mobile/src/notifications, which writes the preference and then tells the backend which device to notify — one hop further out than this reads, not a missing control',
};

/** One copy, in the core, since §6.72. */
const strip = stripComments;

/** The first segment, so `/title/${id}`, `/title/:id` and `/title/tmdb:1` are one place. */
const firstSegment = (route: string) => {
  const path = route.split('?')[0].replace(/\/$/, '') || '/';
  const segments = path.split('/');
  return segments.length > 2 ? `/${segments[1]}` : path;
};

export function routesOffered(source: string, platform: 'web' | 'phone'): Set<string> {
  const src = strip(source);
  const patterns =
    platform === 'web'
      ? [/\bto=["'`]([^"'`]+)["'`]/g, /\bto=\{`([^`]+)`\}/g, /navigate\(\s*[`'"]([^`'"]+)[`'"]/g]
      : [
          /\bhref=["'`]([^"'`]+)["'`]/g,
          /\bhref=\{`([^`]+)`\}/g,
          /router\.(?:push|replace|navigate)\(\s*[`'"]([^`'"]+)[`'"]/g,
        ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of src.matchAll(pattern)) {
      // Only in-app destinations: an external href is not a screen this app offers.
      if (match[1].startsWith('/')) found.add(firstSegment(match[1]));
    }
  }
  return found;
}

/**
 * Verb-shaped, because a writer's name is the only thing available at this level.
 * A reader that happens to start with one of these would be a false positive; none does
 * today, and a false positive costs one line in EXEMPT rather than a wrong pass.
 */
const WRITER =
  /^(add|remove|set|mark|create|delete|update|save|log|toggle|rate|follow|unfollow|import|clear|record|put|hide|unhide|join|leave|send|post|publish|contribute|promote|migrate|restore|reset|apply|start|stop|enqueue)/;

export function writersCalled(source: string): Set<string> {
  const src = strip(source);
  const imported = new Set<string>();
  for (const match of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@reviewies\/core[^']*'/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
      // Types and components are capitalised by convention; neither writes anything.
      if (name && !/^[A-Z]/.test(name)) imported.add(name);
    }
  }
  const called = new Set<string>();
  for (const name of imported) {
    if (WRITER.test(name) && new RegExp(`\\b${name}\\s*\\(`).test(src)) called.add(name);
  }
  return called;
}

/** Every difference between one pair of screens, spelled as an EXEMPT key would be. */
function differences(route: string): string[] {
  const { web, phone } = PAIRS[route];
  const webSrc = read(`app/src/screens/${web}`);
  const phoneSrc = phone.map((file) => read(`mobile/app/${file}`)).join('\n');
  const onlyIn = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

  const webRoutes = routesOffered(webSrc, 'web');
  const phoneRoutes = routesOffered(phoneSrc, 'phone');
  const webWrites = writersCalled(webSrc);
  const phoneWrites = writersCalled(phoneSrc);

  return [
    ...onlyIn(webRoutes, phoneRoutes).map((r) => `${route} web-only →${r}`),
    ...onlyIn(phoneRoutes, webRoutes).map((r) => `${route} phone-only →${r}`),
    ...onlyIn(webWrites, phoneWrites).map((w) => `${route} web-only ${w}()`),
    ...onlyIn(phoneWrites, webWrites).map((w) => `${route} phone-only ${w}()`),
  ].sort();
}

describe('what each platform offers', () => {
  it('offers the same places and the same writes on both sides', () => {
    const unexplained = Object.keys(PAIRS)
      .flatMap(differences)
      .filter((d) => !EXEMPT[d]);
    // Read the failure as: this screen can do something on one platform that it cannot
    // do on the other. Either give the other side the control, or add a line to EXEMPT
    // saying why it is right that it does not have it.
    expect(unexplained).toEqual([]);
  });

  it('keeps no exemption that no longer describes a difference', () => {
    const live = new Set(Object.keys(PAIRS).flatMap(differences));
    // A stale exemption is worse than none: it is a written claim that a difference
    // exists on purpose, sitting beside a difference that has since been closed.
    expect(Object.keys(EXEMPT).filter((key) => !live.has(key))).toEqual([]);
  });

  it('says why, for every exemption', () => {
    for (const [key, why] of Object.entries(EXEMPT)) {
      expect(why.length, key).toBeGreaterThan(30);
    }
  });

  it('pairs every screen file on both sides, or says why not', () => {
    const web = webScreenFiles();
    const pairedWeb = new Set(Object.values(PAIRS).map((p) => p.web));
    expect(web.filter((f) => !pairedWeb.has(f) && !UNPAIRED_WEB[f])).toEqual([]);
    expect(Object.keys(UNPAIRED_WEB).filter((f) => !web.includes(f))).toEqual([]);

    const phone = phoneScreenFiles();
    const pairedPhone = new Set(Object.values(PAIRS).flatMap((p) => p.phone));
    expect(phone.filter((f) => !pairedPhone.has(f) && !UNPAIRED_PHONE[f])).toEqual([]);
    expect(Object.keys(UNPAIRED_PHONE).filter((f) => !phone.includes(f))).toEqual([]);
  });

  it('reads something, rather than comparing two empty sets', () => {
    // Non-vacuity. Every assertion above passes trivially if the extractors return
    // nothing — which is exactly what a renamed router API or a moved screen directory
    // would cause, silently.
    const search = read('app/src/screens/Search.tsx');
    expect(routesOffered(search, 'web')).toContain('/title');
    expect(writersCalled(search)).toContain('markWatched');

    const phoneSearch = read('mobile/app/(tabs)/search.tsx');
    expect(routesOffered(phoneSearch, 'phone')).toContain('/title');
    expect(writersCalled(phoneSearch)).toContain('markWatched');
  });
});
