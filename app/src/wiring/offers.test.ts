import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  componentPairs,
  PAIRS,
  ROOT,
  UNPAIRED_PHONE,
  UNPAIRED_WEB,
  phoneScreenFiles,
  webScreenFiles,
} from './pairs';
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
 * It reads each screen's own file and does not *follow imports* into shared components —
 * that would make the two sides incomparable, since the web's `AddToList` has no phone twin
 * as a file. What it does now do is compare the shared components **against each other**,
 * which sidesteps that objection entirely: `Row.tsx` has a phone twin, and so do the other
 * twenty-two.
 *
 * The sentence that used to stand here — "the differences that have mattered were all in
 * the screen itself" — was true when it was written and stopped being true in §6.147, which
 * found two divergences inside `ui/` and found them with the *copy* guard, by accident,
 * because two control names happened to look alike. §6.133: an excuse expires; the way to
 * tell is to measure. §6.148.
 */

/**
 * Differences that are real and intended. One line each, and the line has to say why
 * the other platform is not worse off for the difference.
 */
const EXEMPT: Record<string, string> = {
  /*
   * `/settings web-only →/people` was here, and its reason was **false**: "the web has no
   * More tab so Settings carries the link". The web has had a More tab since §6.79, and
   * `More.tsx` lists People among its five destinations — so the row on Settings was a
   * second copy of a destination rather than the only way to reach one.
   *
   * §6.133 deleted the row, and this clause is what noticed the exemption had nothing left
   * to excuse. An excuse that was never true is worse than one that has expired: it reads
   * as a decision somebody made.
   */
  '/calendar web-only setPreference()':
    'the phone reaches the same core setter through syncPreference in mobile/src/notifications, which writes the preference and then tells the backend which device to notify — one hop further out than this reads, not a missing control',

  /*
   * The four below were invisible until §6.97 taught this scanner `to:` and `href:` inside
   * an object literal. Both More screens keep their second tier as a table of destinations,
   * and a table is where this check could not look — so four real differences sat in the
   * two files it compares most closely, for as long as the check has existed. None of them
   * is a missing control, and each is worth the sentence.
   */
  '/more web-only →/settings':
    'the same screen as the phone\u2019s /data, at the address each platform shipped it on: both More rows are labelled "Your data", and the web has answered /settings since before the phone existed. A rename is a broken bookmark and a broken smoke locator on one side or the other, for a URL nobody reads aloud.',
  '/more phone-only →/data': 'The other half of `/more web-only →/settings`.',
  '/more phone-only →/account':
    'the web has no /account route because it does not need one: AccountPanel renders inside Settings, which is the same page as the phone\u2019s /data. The phone splits them because its Account screen also carries the push registration, which a browser reaches through the calendar instead.',
  '/more phone-only →/remote':
    'the web\u2019s remote is a drawer available on every screen rather than a destination, which is what the original brief asked for — "hidden in a drawer to the side". The phone has both, because reaching for the remote mid-episode used to mean leaving Watching Mode.',
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
  /*
   * `to=` is in the phone's list too, and that is new.
   *
   * The shared `Button` takes a destination as `to` on both platforms — one prop name is
   * the point of a shared contract — where the phone had only ever written `href` on an
   * `expo-router` `<Link>`. This guard reported the first migrated call site as a web-only
   * offer, correctly: a third way to express a destination had appeared and nothing here
   * knew the word. Teaching it makes the check wider rather than narrower.
   *
   * And then it happened again, for the same reason. `Row` takes its destination inside an
   * object — `open={{ name, to: '/title/…' }}` — because the *name* of a target is a shared
   * rule and *how* it navigates is not, so the two renderers extend `RowOpen` differently.
   * That is `to:` in a literal rather than `to=` on a prop: a fourth spelling, and this
   * reported the first two migrated screens as phone-only offers, correctly. Widened again,
   * and worth noticing that the paragraph above had already described the shape.
   *
   * Widening one side alone then made this report five *web-only* offers that were not:
   * both More screens keep a table of destinations, and the web's rows say `to:` where the
   * phone's say `href:`. The scanner knew `href=` on a prop and not `href:` in a literal,
   * so the asymmetry it reported was its own. Every spelling either platform uses, on both
   * lists — a scanner that reads one side more closely than the other invents differences.
   */
  const patterns =
    platform === 'web'
      ? [
          /\bto=["'`]([^"'`]+)["'`]/g,
          /\bto=\{`([^`]+)`\}/g,
          /\bto:\s*[`'"]([^`'"]+)[`'"]/g,
          // `href` on the web too, so the two lists are the same list. It reads
          // `ErrorBoundary`'s way home, which nothing else here spells that way; it costs
          // nothing and it closes the direction this asymmetry could still break in.
          /\bhref=["'`]([^"'`]+)["'`]/g,
          /\bhref=\{`([^`]+)`\}/g,
          /\bhref:\s*[`'"]([^`'"]+)[`'"]/g,
          /navigate\(\s*[`'"]([^`'"]+)[`'"]/g,
        ]
      : [
          /\bhref=["'`]([^"'`]+)["'`]/g,
          /\bhref=\{`([^`]+)`\}/g,
          /\bhref:\s*[`'"]([^`'"]+)[`'"]/g,
          /\bto=["'`]([^"'`]+)["'`]/g,
          // The third `to` spelling, which the web's list had and this one did not — and
          // the last of the six, because both lists now carry all of them rather than a
          // chosen subset each. A subset is a decision that has to be revisited every time
          // a call site changes its spelling, and it has been wrong twice.
          // §6.97 widened both sides for `to:` in a literal and stopped there; this sprint
          // gave the phone `<Button to={`/watching/${id}`} />` — a template inside braces
          // — and the scanner reported three destinations as web-only that both platforms
          // offer. Twice now the fix for this file has been to widen it *evenly*: a
          // spelling one side can read and the other cannot invents a difference that is
          // the scanner's, not the product's.
          /\bto=\{`([^`]+)`\}/g,
          /\bto:\s*[`'"]([^`'"]+)[`'"]/g,
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
 * A reader that happens to start with one of these would be a false positive; a false
 * positive costs one line in EXEMPT rather than a wrong pass.
 *
 * There is one, found when this began reading components: `posterInitials` starts with
 * `post`. It is a pure formatter and it is called on both platforms, so it pairs with
 * itself and costs nothing — which is the point worth keeping. The sentence here used to
 * say "none does today", and a claim in the present tense about a set that grows is a
 * claim that goes stale without anybody editing the line. §6.148.
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

/** The same comparison between two same-named components. §6.148. */
function componentDifferences(name: string): string[] {
  const webSrc = read(`app/src/ui/${name}`);
  const phoneSrc = read(`mobile/src/ui/${name}`);
  const onlyIn = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));
  const key = `ui/${name}`;

  const webRoutes = routesOffered(webSrc, 'web');
  const phoneRoutes = routesOffered(phoneSrc, 'phone');
  const webWrites = writersCalled(webSrc);
  const phoneWrites = writersCalled(phoneSrc);

  return [
    ...onlyIn(webRoutes, phoneRoutes).map((r) => `${key} web-only →${r}`),
    ...onlyIn(phoneRoutes, webRoutes).map((r) => `${key} phone-only →${r}`),
    ...onlyIn(webWrites, phoneWrites).map((w) => `${key} web-only ${w}()`),
    ...onlyIn(phoneWrites, webWrites).map((w) => `${key} phone-only ${w}()`),
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

  it('offers the same places and the same writes from a shared component, too', () => {
    /*
     * A ratchet that starts at zero, which is the strongest state one can start in: every
     * shared component already agrees, so the first disagreement is the finding.
     *
     * What this deliberately does **not** compare is controls, and the two probes that
     * settled that are worth the space. Counting roles reports thirteen of the
     * twenty-three pairs as different, because a `<button>` carries its role implicitly
     * and a `Pressable` must be told: the scanner would be reading one tree more closely
     * than the other, which this file's own comments name as the failure it has hit twice.
     * Counting accessible *names* reports six pairs different — every one of them by
     * exactly one, because the web writes the same name in two branches where the phone
     * writes it once. Both numbers are the instrument's, not the product's. §6.142.
     */
    const names = componentPairs();
    expect(names.length, 'no components are being compared at all').toBeGreaterThan(10);
    const unexplained = names.flatMap(componentDifferences).filter((d) => !EXEMPT[d]);
    expect(unexplained).toEqual([]);
  });

  it('keeps no exemption that no longer describes a difference', () => {
    const live = new Set([
      ...Object.keys(PAIRS).flatMap(differences),
      ...componentPairs().flatMap(componentDifferences),
    ]);
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

    // And on the component side, where the sets are smaller and a silent empty one would
    // look exactly like agreement. `ImportFiles` calls three core writers on both.
    for (const [platform, file] of [
      ['web', 'app/src/ui/ImportFiles.tsx'],
      ['phone', 'mobile/src/ui/ImportFiles.tsx'],
    ] as const) {
      expect([...writersCalled(read(file))].sort(), platform).toEqual([
        'importArchive',
        'importArchiveEntry',
        'restoreAccount',
      ]);
    }

    const phoneSearch = read('mobile/app/(tabs)/search.tsx');
    expect(routesOffered(phoneSearch, 'phone')).toContain('/title');
    expect(writersCalled(phoneSearch)).toContain('markWatched');
  });
});
