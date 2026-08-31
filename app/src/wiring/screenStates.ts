import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Which of each screen's states anything has ever rendered.
 *
 * A screen is not one thing. Up Next is a migration offer, a list with counts and a
 * catch-up sheet; Stats is a loading state, an empty period, a rolling window and a
 * Year in Review; the conversation is sealed, open, filtered-to-nothing or waiting on a
 * sync that has not happened. A suite that walks a screen once has rendered one of
 * those, and reported on the screen.
 *
 * §6.40 asked which ones nothing had ever driven and found the answers were not
 * uniformly boring: an unknown URL rendered a blank page on the web, which the web's
 * own smoke suite was reading to decide whether the build had credentials; the phone's
 * only Switch had never been measured and was under the target-size floor; the
 * conversation's Back control had been 31x20 since the screen shipped. Each was in a
 * state no check had visited, and a check that cannot reach the state a bug lives in is
 * a check that passes.
 *
 * So the answers are written down rather than rediscovered. This file is the list; the
 * test beside it keeps the list honest about which screens exist. Three verdicts:
 *
 *  - `suite`  — an end-to-end run renders it, on every run
 *  - `unit`   — a test renders or asserts it, but no browser has
 *  - `never`  — nothing has ever produced it, and here is why
 *
 * `never` is not a defect and is not a to-do. Most of them need an account, and this
 * checkout has no service key to make and unmake a test user with (§7). Writing that
 * down is the point: the next person can tell "this works" from "nothing has looked".
 */

export type Verdict = 'suite' | 'unit' | 'never';

export interface State {
  name: string;
  verdict: Verdict;
  /** Required for `never`: what stops it, in one line. */
  why?: string;
}

export interface ScreenStates {
  platform: 'web' | 'phone';
  /** The route, exactly as the platform's router spells it. */
  route: string;
  states: State[];
}

/** Signed in, which nothing in this checkout can be. */
const NO_ACCOUNT =
  'needs a signed-in session; no service key here to make and unmake a test user (§7)';

export const SCREEN_STATES: ScreenStates[] = [
  // --- web -------------------------------------------------------------------
  {
    /*
     * Three jobs on one screen since `docs/design/architecture.md` sections 3 and 4: the past, the
     * present, and what is coming. The calendar's states are here because the calendar is
     * here — `/calendar` was its own row until this sprint and is no longer a route.
     */
    platform: 'web',
    route: '/',
    states: [
      { name: 'first run: the migration offer', verdict: 'suite' },
      { name: 'tracked, with a remaining count', verdict: 'suite' },
      { name: 'the past, above the present', verdict: 'suite' },
      { name: 'just imported: the report', verdict: 'suite' },
      { name: 'imported shows still unmatched', verdict: 'suite' },
      { name: 'the catch-up sheet, open', verdict: 'suite' },
      { name: 'a series finished by catching up', verdict: 'suite' },
      { name: 'coming: nothing scheduled', verdict: 'suite' },
      { name: 'coming: episodes, grouped by day', verdict: 'suite' },
      { name: 'coming: notifications, the three granularities', verdict: 'suite' },
      {
        name: 'coming: permission denied by the browser',
        verdict: 'never',
        why: 'the suite never denies it; Chromium starts at "default"',
      },
      {
        name: 'coming: push configured and subscribed',
        verdict: 'never',
        why: 'no VAPID key in this build',
      },
    ],
  },
  {
    platform: 'web',
    route: '/watchlist',
    states: [
      { name: 'empty', verdict: 'suite' },
      { name: 'populated, with a note', verdict: 'suite' },
      { name: 'editing a note', verdict: 'suite' },
      /*
       * Three verdicts in three sprints, and each move was a measurement rather than an
       * opinion. It read `never`, because *"Dexie resolves before the first paint
       * locally"* — false for the life of the file: `useLiveQuery(fn, deps)` with no
       * initial value returns `undefined` on the first render and resolves in a microtask
       * afterwards, so it cannot beat the paint. §6.191 corrected it to `suite` on a
       * browser measurement: nine of 24 interactions painted it, 16–66ms each.
       *
       * It is `unit` now, and the reason is that the screen changed rather than that the
       * reading did. `design/between.mjs` re-measured those flashes at 13–44ms and the
       * judgement filed with them was that a word that brief is neither honest nor useful
       * — so `core/src/ui/waiting.ts` gave every loading branch 200ms of silence before it
       * speaks. Nothing an end-to-end run does takes 200ms to read a local table, so no
       * browser renders this any more; `app/src/ui/waiting.test.tsx` does, by holding the
       * clock, and that is exactly what `unit` means here.
       *
       * **The state is still reachable and is deliberately still here.** §6.104's rule is
       * that *"I could not look"* must be distinguishable from *"there is nothing"*, and
       * the empty sentence on this screen is a claim about somebody's own watchlist. A
       * genuinely slow read still says so; a fast one has nothing to say.
       */
      { name: 'loading', verdict: 'unit', why: 'no browser waits the 200ms it now takes to speak' },
    ],
  },
  {
    platform: 'web',
    route: '/title/:id',
    states: [
      { name: 'a series with seasons and episodes', verdict: 'suite' },
      { name: 'an imported series, matched', verdict: 'suite' },
      /*
       * The two faces of the decision this page exists to inform. Until this sprint the
       * page had neither: `Track`, `addToLibrary` and `watchlist` appeared nowhere on it,
       * so the screen you open to decide could not act on the decision. The first is
       * driven by the walk that comes off the shelf, presses `Details` and then `Track`;
       * the second by the imported series above it, which arrives already in the library.
       */
      { name: 'untracked: the decision offered', verdict: 'suite' },
      { name: 'already tracking: the decision spent', verdict: 'suite' },
      {
        name: 'saved to the watchlist, not yet tracked',
        verdict: 'never',
        why: 'nothing in the suite opens this page for a title that is on the watchlist and not in the library',
      },
      { name: 'rated, and with a poster override', verdict: 'suite' },
      { name: 'where to watch, per region', verdict: 'suite' },
      { name: 'add-to-list offered', verdict: 'suite' },
      { name: 'the title could not be loaded, with a retry', verdict: 'suite' },
      { name: 'where to watch could not be checked', verdict: 'suite' },
      { name: 'content warnings, expanded', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    platform: 'web',
    route: '/watching/:targetId',
    states: [
      { name: 'before the clock starts', verdict: 'suite' },
      { name: 'running, with the reaction stream', verdict: 'suite' },
      { name: 'the stream held still', verdict: 'suite' },
      { name: 'reduced motion', verdict: 'suite' },
      { name: 'the emoji search pad', verdict: 'suite' },
      { name: 'auto-synced by the extension', verdict: 'suite' },
      { name: 'drift offered against a device', verdict: 'suite' },
      {
        name: 'synced by listening to the room',
        verdict: 'unit',
        why: 'the fingerprinter has never heard real audio (§7)',
      },
    ],
  },
  {
    platform: 'web',
    route: '/comments/:targetId',
    states: [
      { name: 'sealed until watched', verdict: 'unit', why: 'the suite marks watched first' },
      { name: 'open: effort filter and composer', verdict: 'suite' },
      { name: 'no comments yet', verdict: 'suite' },
      { name: 'sync not configured', verdict: 'unit', why: 'this checkout has credentials' },
      { name: 'someone else’s comment, and your own', verdict: 'never', why: NO_ACCOUNT },
      { name: 'a comment with an image attached', verdict: 'never', why: NO_ACCOUNT },
      { name: 'watched locally but not yet synced', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    /*
     * One surface for *find me something*, so the states of two screens are the states of
     * one. `docs/design/architecture.md` section 5 — `/search` was its own row here until this
     * sprint, and every state it named is still produced; they are produced on this route.
     */
    platform: 'web',
    route: '/discover',
    states: [
      { name: 'the shelf: suggestions, with reasons', verdict: 'suite' },
      { name: 'the back of a box', verdict: 'suite' },
      { name: 'the filter row, opened', verdict: 'suite' },
      { name: 'narrowed to nothing', verdict: 'unit' },
      { name: 'nothing to suggest', verdict: 'unit', why: 'the fixture set always suggests' },
      { name: 'results, series and film', verdict: 'suite' },
      { name: 'the quick-log note composer', verdict: 'suite' },
      // Was 'unit', excused as "the fixture provider cannot be made to fail from a
      // browser" — true of the fixtures and beside the point: §6.58 builds with a token
      // and intercepts the provider instead. Three failures, including a hang.
      { name: 'the provider failed', verdict: 'suite' },
      { name: 'the provider never answered, and the deadline fired', verdict: 'suite' },
    ],
  },
  {
    platform: 'web',
    route: '/lists',
    states: [
      // "No lists yet" was marked `suite` — and stopped being what the suite renders in
      // §6.56, which put a sign-in gate in front of it. It needs a session now.
      { name: 'no lists yet', verdict: 'never', why: NO_ACCOUNT },
      { name: 'signed out, on a build that has sync', verdict: 'suite' },
      { name: 'sync not configured', verdict: 'unit', why: 'this checkout has credentials' },
      { name: 'the read failed, said as a failure', verdict: 'unit' },
      { name: 'a list open, with items', verdict: 'never', why: NO_ACCOUNT },
      { name: 'yours versus someone else’s', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    platform: 'web',
    route: '/people',
    states: [
      { name: 'signed out, and says which kind of empty', verdict: 'suite' },
      { name: 'your profile, being edited', verdict: 'never', why: NO_ACCOUNT },
      { name: 'following, followers, blocked', verdict: 'never', why: NO_ACCOUNT },
      { name: 'a search that found nobody', verdict: 'never', why: NO_ACCOUNT },
      { name: 'a search that failed', verdict: 'unit' },
    ],
  },
  {
    platform: 'web',
    route: '/stats',
    states: [
      { name: 'nothing watched in this period', verdict: 'suite' },
      { name: 'a rolling window', verdict: 'suite' },
      { name: 'Year in Review', verdict: 'suite' },
      /*
       * Three verdicts in three sprints, and each move was a measurement rather than an
       * opinion. It read `never`, because *"Dexie resolves before the first paint
       * locally"* — false for the life of the file: `useLiveQuery(fn, deps)` with no
       * initial value returns `undefined` on the first render and resolves in a microtask
       * afterwards, so it cannot beat the paint. §6.191 corrected it to `suite` on a
       * browser measurement: nine of 24 interactions painted it, 16–66ms each.
       *
       * It is `unit` now, and the reason is that the screen changed rather than that the
       * reading did. `design/between.mjs` re-measured those flashes at 13–44ms and the
       * judgement filed with them was that a word that brief is neither honest nor useful
       * — so `core/src/ui/waiting.ts` gave every loading branch 200ms of silence before it
       * speaks. Nothing an end-to-end run does takes 200ms to read a local table, so no
       * browser renders this any more; `app/src/ui/waiting.test.tsx` does, by holding the
       * clock, and that is exactly what `unit` means here.
       *
       * **The state is still reachable and is deliberately still here.** §6.104's rule is
       * that *"I could not look"* must be distinguishable from *"there is nothing"*, and
       * `COPY.stats.empty` is a claim about somebody's own history. A genuinely slow read
       * still says so; a fast one has nothing to say.
       */
      { name: 'loading', verdict: 'unit', why: 'no browser waits the 200ms it now takes to speak' },
    ],
  },
  {
    platform: 'web',
    route: '/settings',
    states: [
      { name: 'signed out, sync configured', verdict: 'suite' },
      { name: 'import: zip, CSV and DioCache.db', verdict: 'suite' },
      { name: 'export, and what it says it holds', verdict: 'suite' },
      { name: 'sync not configured', verdict: 'unit', why: 'this checkout has credentials' },
      { name: 'signed in: handle, sign out, last sync', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    platform: 'web',
    route: '/more',
    states: [
      { name: 'counts at zero', verdict: 'suite' },
      { name: 'counts and runtime, populated', verdict: 'suite' },
    ],
  },
  {
    platform: 'web',
    route: '*',
    states: [{ name: 'an address that is not a screen', verdict: 'suite' }],
  },

  // --- phone -----------------------------------------------------------------
  {
    /* Three jobs on one screen — see the web's `/`. */
    platform: 'phone',
    route: '(tabs)/index',
    states: [
      { name: 'first run: the migration offer', verdict: 'suite' },
      { name: 'tracked, with a remaining count', verdict: 'suite' },
      { name: 'the past, above the present', verdict: 'suite' },
      { name: 'the catch-up sheet, open', verdict: 'suite' },
      {
        name: 'just imported: the report',
        verdict: 'never',
        why: 'importing goes through the system document picker, which the web export cannot drive',
      },
      { name: 'coming: nothing scheduled', verdict: 'suite' },
      { name: 'coming: episodes, grouped by day', verdict: 'suite' },
      { name: 'coming: honest about what it cannot deliver', verdict: 'suite' },
      {
        name: 'coming: a real push token, registered',
        verdict: 'never',
        why: 'getExpoPushTokenAsync has never executed (§7)',
      },
    ],
  },
  {
    /* One surface, so one row — see the web's `/discover`. */
    platform: 'phone',
    route: '(tabs)/discover',
    states: [
      { name: 'the shelf: suggestions', verdict: 'suite' },
      { name: 'the back of a box', verdict: 'suite' },
      { name: 'the filter row, opened', verdict: 'suite' },
      { name: 'narrowed to nothing', verdict: 'unit' },
      { name: 'nothing to suggest', verdict: 'unit' },
      { name: 'results, and tracking one', verdict: 'suite' },
      { name: 'the provider failed', verdict: 'unit' },
    ],
  },
  {
    platform: 'phone',
    route: '(tabs)/watchlist',
    states: [
      { name: 'empty', verdict: 'suite' },
      { name: 'populated, with a note', verdict: 'suite' },
      { name: 'editing a note', verdict: 'suite' },
    ],
  },
  { platform: 'phone', route: '(tabs)/more', states: [{ name: 'the section list', verdict: 'suite' }] },
  {
    platform: 'phone',
    route: 'account',
    states: [
      { name: 'sync not configured', verdict: 'suite' },
      { name: 'signed out, with the form', verdict: 'never', why: 'the phone build carries no credentials' },
      { name: 'signed in, with sync status', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    platform: 'phone',
    route: 'data',
    states: [
      { name: 'export, and the watching preference', verdict: 'suite' },
      { name: 'import formats named', verdict: 'suite' },
      {
        name: 'a file actually chosen',
        verdict: 'never',
        why: 'the system document picker cannot be driven from the web export',
      },
    ],
  },
  {
    platform: 'phone',
    route: 'lists',
    states: [
      { name: 'sync not configured', verdict: 'suite' },
      { name: 'lists, and one open', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    platform: 'phone',
    route: 'people',
    states: [
      { name: 'sync not configured', verdict: 'suite' },
      { name: 'profile, following, blocking', verdict: 'never', why: NO_ACCOUNT },
    ],
  },
  {
    platform: 'phone',
    route: 'stats',
    states: [
      { name: 'nothing watched in this window', verdict: 'suite' },
      { name: 'a rolling window', verdict: 'suite' },
      {
        name: 'Year in Review',
        verdict: 'never',
        why: 'the suite never picks a year; the web equivalent is covered',
      },
    ],
  },
  {
    platform: 'phone',
    route: 'remote',
    states: [
      { name: 'nothing paired yet', verdict: 'suite' },
      {
        name: 'a device found and paired',
        verdict: 'never',
        why: 'the Roku and MPRIS adapters have never spoken to hardware (§7)',
      },
    ],
  },
  {
    platform: 'phone',
    route: 'title/[id]',
    states: [
      { name: 'a series with seasons and episodes', verdict: 'suite' },
      { name: 'rated, and with a poster override', verdict: 'suite' },
      { name: 'add-to-list offered', verdict: 'never', why: 'the phone build carries no credentials' },
      { name: 'already tracking: the decision spent', verdict: 'suite' },
      /*
       * The state the control was *added* for, and this suite cannot reach it. Said out
       * loud rather than left off the list: the web's walk covers it end to end and this
       * one does not, so a defect that renders the control only for a tracked title would
       * be caught on one platform and not on the other.
       */
      {
        name: 'untracked: the decision offered',
        verdict: 'never',
        why: 'this suite reaches the page only from an Up Next row, which is by definition a show already in the library; it never turns a shelf box over to follow the route that opens an untracked one',
      },
      {
        name: 'saved to the watchlist, not yet tracked',
        verdict: 'never',
        why: 'same route: nothing here opens this page for a title on the watchlist',
      },
    ],
  },
  {
    platform: 'phone',
    route: 'watching/[targetId]',
    states: [
      { name: 'before the clock starts', verdict: 'suite' },
      { name: 'running, with the reaction stream', verdict: 'suite' },
      { name: 'the stream held still', verdict: 'suite' },
      { name: 'the emoji search pad', verdict: 'suite' },
      { name: 'the remote drawer, open', verdict: 'suite' },
      { name: 'the remote drawer, closed but mounted', verdict: 'suite' },
      {
        name: 'synced by listening to the room',
        verdict: 'never',
        why: 'needs a microphone and a real device (§7)',
      },
    ],
  },
  {
    platform: 'phone',
    route: 'comments/[targetId]',
    states: [
      { name: 'sealed until watched', verdict: 'suite' },
      {
        name: 'open: effort filter and composer',
        verdict: 'never',
        why: 'the phone build carries no credentials, so this screen only ever reaches its sealed state',
      },
      {
        name: 'attaching an image',
        verdict: 'never',
        why: 'the picker’s native branch has never run (§7)',
      },
    ],
  },
  {
    platform: 'phone',
    route: '+not-found',
    states: [{ name: 'an address that is not a screen', verdict: 'suite' }],
  },
];

/** The web's routes, read off the route table rather than a second list of them. */
export function webRoutes(root: string): string[] {
  const src = readFileSync(resolve(root, 'app/src/App.tsx'), 'utf8');
  const table = src.slice(src.indexOf('const ROUTES'), src.indexOf('/** Breaks this screen'));
  return [...table.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
}

/**
 * The phone's routes, which are its filenames.
 *
 * `_layout` is not a screen and `(tabs)` is a group rather than a segment, but it is
 * kept in the name here because that is how expo-router spells the file and matching on
 * anything else would be a second convention to keep in step.
 */
export function phoneRoutes(root: string): string[] {
  const base = resolve(root, 'mobile/app');
  const walk = (dir: string, prefix: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`, out);
      else if (entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') {
        out.push(prefix + entry.name.replace(/\.tsx$/, ''));
      }
    }
    return out;
  };
  return walk(base, '');
}
