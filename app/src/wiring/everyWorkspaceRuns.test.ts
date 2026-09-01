import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Every workspace runs tests, and none of them passes by having none.
 *
 * `npm run test --workspaces --if-present` skips a workspace with no `test` script
 * **silently**. The extension had no `test` script and no unit tests, so `npm run
 * verify` had been reporting green over five hundred lines nothing had ever executed —
 * and the run's own output did not say so, because a skipped workspace prints nothing at
 * all. §6.68 found it by adding up which workspace produced which number and noticing
 * that the seven tests being attributed to the extension were the phone's.
 *
 * `--passWithNoTests` is the same silence spelled differently: it makes a suite green
 * when its files have been deleted, renamed out of the glob, or excluded by a config
 * change nobody noticed.
 *
 * So: every workspace either runs tests or is named below with the reason it does not.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * Workspaces that legitimately have no unit tests, and why.
 *
 * Empty. It stays empty unless something earns a place, and the stale check below means
 * an entry cannot outlive the workspace it excuses.
 */
const NO_TESTS: Record<string, string> = {};

/**
 * Workspaces allowed to pass with no test files, and why.
 *
 * Empty for the same reason. `mobile` sat here implicitly — its `test` script carried
 * `--passWithNoTests` while the workspace held exactly one test file, so deleting that
 * file would have gone unnoticed.
 */
const MAY_BE_EMPTY: Record<string, string> = {};

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, never>;

const workspaces = (): string[] =>
  ((readJson(resolve(ROOT, 'package.json')) as { workspaces?: string[] }).workspaces ?? []) as string[];

function testFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('every workspace', () => {
  const names = workspaces();

  it('finds the workspace list rather than passing on an empty one', () => {
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain('extension');
  });

  it('has a test script, so `npm test` cannot skip it in silence', () => {
    const silent = names.filter((name) => {
      if (NO_TESTS[name]) return false;
      const pkg = readJson(resolve(ROOT, name, 'package.json')) as { scripts?: Record<string, string> };
      return !pkg.scripts?.test;
    });
    expect(silent).toEqual([]);
  });

  it('actually contains tests for that script to run', () => {
    // A script with nothing to run is the same green as no script, one step later.
    const empty = names.filter((name) => {
      if (NO_TESTS[name] || MAY_BE_EMPTY[name]) return false;
      return testFiles(resolve(ROOT, name)).length === 0;
    });
    expect(empty).toEqual([]);
  });

  /**
   * And the runner collects them — which is a different claim from either of the above.
   *
   * This check was named "every workspace runs tests" and proved two weaker things: a
   * `test` script exists, and files matching `*.test.ts` exist somewhere beneath. A
   * config whose `include` does not reach them satisfies both and runs nothing.
   *
   * `mobile` was exactly that. Its `include` was `src/**\/*.test.ts`, so every test under
   * `app/` — where expo-router puts the screens, which is most of the workspace — and
   * every `.tsx` test anywhere were silently excluded. §6.73 dropped a deliberately
   * failing test into each and `npm run test --workspace mobile` reported **7 passed**.
   *
   * So stop guessing from filenames and ask the runner. `vitest list --filesOnly` prints
   * exactly what a run would collect, which is the only thing that answers this.
   */
  it('and its runner collects every one of them', () => {
    const missed: string[] = [];
    for (const name of names) {
      if (NO_TESTS[name] || MAY_BE_EMPTY[name]) continue;
      const dir = resolve(ROOT, name);
      const onDisk = testFiles(dir).map((f) => relative(dir, f).replace(/\\/g, '/')).sort();
      if (onDisk.length === 0) continue;

      let listed: string[];
      try {
        listed = execFileSync('npx', ['vitest', 'list', '--filesOnly'], {
          cwd: dir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .sort();
      } catch {
        missed.push(`${name}: could not ask its runner what it collects`);
        continue;
      }

      for (const file of onDisk) {
        if (!listed.includes(file)) missed.push(`${name}: ${file} is never run`);
      }
    }
    expect(missed).toEqual([]);
  }, 120_000);

  /**
   * How many checks each workspace holds, as a floor.
   *
   * §6.109 wrote a new test file over one that already existed — `core/src/test/
   * source.test.ts`, thirteen cases about reading source as code, replaced by four about
   * one new helper — and `npm run verify` went **green**. Every file on disk was still
   * collected, every collected test still passed, and nine checks had stopped existing.
   * The only thing that noticed was reading the summary line and seeing 930 become 921.
   *
   * A ratchet: the number a suite holds today, and it only fails when a suite gets
   * *smaller*. Adding tests never touches it, which is what separates this from the pins
   * §6.94 warns about — those encode an arrangement somebody chose, and this encodes
   * nothing but "nothing was destroyed".
   *
   * It was written slack first — floors a few per cent below the real counts — and the
   * plant walked straight through it: deleting the nine cases that were actually lost
   * left core above a floor of 890. A margin here is a margin for exactly the accident
   * this exists to catch, so there is none. Removing a test on purpose means editing one
   * number with a reason beside it, which is the whole intent.
   *
   * Counted as `it(` blocks in source, not as cases reported by the runner: a loop or an
   * `it.each` turns one block into several, and the two numbers differ by forty in `app`
   * alone. What matters here is that a block stops existing.
   */
  const FLOOR: Record<string, number> = {
    // app 635, up seven: §6.167's `sunkenFill.test.ts` (3) and `watchlistRow.test.ts` (4).
    // app 638, up three: §6.168's `factNotControl.test.ts`.
    // app 641, up three: §6.169's `screenMode.test.ts`.
    // core 925, up three, and app 642, up one: §6.170's seeding cases in
    // `recommend.test.ts`, and the remote drawer's one-place-one-register clause.
    // app 645, up three: §6.171's refused-connection pair and the year-in-review clause.
    // app 648, up three: §6.172's `announcedState.test.ts`.
    // app 650, up two: §6.173 gave that file the hidden-decoration pair — the absence rule
    // and the four sites it would otherwise be vacuously true about.
    // app 652, up two: §6.174's synopsis pair in `season.test.ts` — the clamp forbidden on
    // both renderers, and the clause that the field is still drawn at all.
    // app 654, up two: §6.175's one-owner sweep in `copy.test.ts` — the clause that no
    // sentence is typed twice, and the non-vacuity clause that it is reading prose at all.
    // app 656, up two: §6.176's `copy.test.ts` pair — the tab bar and the screen title
    // named the same thing, and the single-word ratchet past the space rule.
    // core 928, up three: §6.177's three answers to "does an empty conversation mean
    // empty" — the branch that could not be reached, and the two either side of it.
    // app 657, up one: §6.178's clause that the shot backlog is measured over the
    // directories the capture scripts actually file into.
    // app 658, up one: §6.179's clause that both renderers read `ROW_LINES` and that the
    // web's lookup says what the table says.
    // app 661, up three: §6.180's two clauses in `button.test.ts` — the clamp landing on
    // the label rather than the box, and the two call sites that ask for it — plus the
    // `hitSlop` clause in `space.test.ts`, which is in the file that bans an unstated
    // number in a phone style and could not have seen a prop.
    // app 664, up three: §6.181's clause per component — the key's shape, the monogram
    // held still against the reader's text setting, and the web's `Choice` literals bound
    // to `CHOICE_SIZE`.
    // app 667, up three: §6.183's clause per defect — the fill drawn at the height the table
    // states, the pad filling the row on the narrowest phone, and a literal read whole
    // whether or not a digit happens to be in it. One from each of three parallel branches,
    // which is why this line could only be set after all three had merged.
    // app 677, up ten: §6.184's clauses across four parallel branches. The press half is
    // three — a phone press sweep that reads blocks rather than lines, a press that is
    // never a transform, and the button table's fill removed. The other seven are one or
    // two per component from three worktrees: the chevron's size and the two marks'
    // stroke; the tab bar's rule and its height budget; the masthead sweep's phone half,
    // which includes the inline-style clause added *after* the merge when re-planting
    // found the branch's version could not see one; `Section`'s four channels as classes
    // the table can be compared to; and `Field`'s line box and `Toggle`'s two.
    // app 680, up three: §6.185. One clause that every tone's label still clears the text
    // floor against the step its own surface takes — the press-class check went into the
    // clause already there — and two giving `shipping.test.ts` the web manifest it had
    // never read: every icon resolves to a file in the build, and the splash and tint come
    // out of the token table.
    // app 688, up eight: §6.187, five worktrees merged. The watchlist editor's row-and-grow
    // pair; the web title page's depth-1 name; the JSX weld sweep; `paletteMembers`, which
    // asks that every colour is painted by something or carries a written reason; and the
    // box sweep, which is the one that pays — a sibling of `UTILITY` for the box a thing is
    // drawn in rather than the space between things, five defects deep including a 16px
    // WCAG target the old suite passed without a murmur.
    // app 689: §6.187 complete, six worktrees. The last one added a vertical-cut clause and
    // took `type.test.ts`'s away, because §6.183's proposed "no line box smaller than its
    // font size" becomes vacuous by construction once the simulation is faithful — a clause
    // declined with its reason written down rather than added to make a number move.
    // app 694: the clipping sprint's `lineBox.test.ts`, which reads the six bundled font
    // files rather than blacklisting a ratio, and `choice.test.ts`'s build-wide sweep for a
    // hand-rolled radio outside `Choice`. That sweep found the two renderers and no third
    // offender — a lock on an empty room, and worth having only because a plant first
    // watched the old clauses shake the defect's hand.
    // core 936, app 697, mobile 47: the device session's own work merged in — a byte-sniff
    // for a recovered DioCache, the phone's SQLite, and the guard that was looking one level
    // too high. Three workspaces moving at once is what a second person working on this
    // looks like, which had not happened before.
    // core 943, app 703, mobile 47: three settled decisions — a past date's words, a
    // boxless tone's edge, and prose taking its own measure — plus the smoke probe that had
    // been reading a sentinel through a negation, so "I did not find the sentence" and
    // "this build has credentials" were the same answer and ~210 checks never ran.
    // core 971, app 710, mobile 47: §6.188's architecture rework and the four branches that
    // landed beside it. The web smoke went from 108 executing checks to 279 in the same file,
    // which is not counted here — this table counts `it()` clauses, and the hundred and
    // seventy that had stopped running were behind a click on a tab that no longer exists.
    // core 975: §6.189's year clauses, from an HCI evaluation that found Year in Review
    // answering the same episode count under three different year headings on the phone.
    // core 989, app 732: §6.189's three parallel branches merged — the year spine and its
    // calm clauses, the shelf's centring and the two walks that had never started, and the
    // phone style property that meant "unset" to Yoga and nothing at all to
    // react-native-web. Counted from the clause's own measurement rather than from vitest's
    // reported total, which is a different quantity: this counts `it()` cases in source and
    // vitest counts what executed, and reading one as the other is how a floor gets set to a
    // number no file ever had.
    // app 733, up one: the seam repairs' clause in `calm.test.ts` — the one that stops a
    // duration nobody has measured being derived from a confidence that is not a position.
    // core 995, app 745: sprint 101's three branches — the title page's Track control and
    // the shelf's route out, the census that tells stale from unread, and Up Next's floor
    // with the search in the address.
    // core 1011, app 751: sprint 102 — the matcher's ambiguity flag and its determinism
    // clauses, the harness sweep's four denominators, and the artboard's claim held rather
    // than trusted.
    // core 1024, up thirteen, and app 752, up one: §6.191's `stopTracking.test.ts` — the
    // writer, the shelf rule, the Search label and the every-status-has-a-writer clause —
    // and `decide.test.ts`'s way-out-of-tracking clause.
    // app 754, up two: §6.191's merge of the scent pass — `listNames.test.ts`'s omission
    // clause and the required-name clause under it.
    // app 760, up six: §6.191's merge of the mid-press pass — `whyNever.test.ts` (3), which
    // reads a `never`'s reason instead of only requiring one, and `tabPress.test.ts` (3),
    // which asks whether a control has a press rule rather than whether its press goes the
    // right way.
    // core 1030, up six, and app 762, up two: §6.191's merge of the real-artwork pass —
    // `box.test.ts`'s ground-derived clamp, the year the back was dropping and the one
    // function a search row's fact line comes from, and `browse.test.ts`'s two call-site
    // clauses under them. Counted rather than added up from three reports.
    // app 763, up one: the box's press clause in `browse.test.ts`, which asks whether the
    // shelf box has a press rule at all rather than whether the one it has goes the right
    // way — the phone's had none.
    // app 768, up five: the watchlist-promise pass. Three in `watchlistPromise.test.ts`,
    // which reads the six controls announced *"Add {name} to your watchlist"* and asks
    // whether each one's own `onPress` reaches the writer — two of the six did not — plus
    // the non-vacuity clause and the one that keeps the note composer on the watchlist row.
    // Two in `searchRowWatchlist.test.tsx`, which does not read source at all: it renders
    // the screen, presses the control by its announced name and asks the database. That
    // split is deliberate and measured — a plant with the write behind a dead branch
    // satisfies all three source clauses and fails both of these.
    // app 774, up six more: `waiting.test.tsx` — the threshold's two independent bounds,
    // the hook's silence-then-speech-then-silence-again, the first frame of the watchlist
    // and of stats, and the tail-implies-head clause. The two passes above landed in
    // parallel and each raised this line; the number below is counted from the merged tree
    // rather than added up from the two reports, which is the whole rule.
    // app 775, up one: `docsReferences.test.ts`'s clause that every capture script prints its
    // census after the last shot it files. `capture.mjs` did not — it read `scrolls` with
    // eight of its thirty-three shots still to come, so four of the fourteen with anything
    // below the fold, and two of the three not taken at the top of their screen, were absent
    // from the two lines a design reviewer is told to read before opening any image.
    // app 778, up three more: the local-first stance clauses in `copy.test.ts` — the
    // denominator (two screens make the stance, and the rendered `!syncConfigured()` gates
    // that made its old wording false), the set equality that says the absent-sync sentence
    // lives exactly where the stance is made, and the one that requires the condition rather
    // than the sentence. Core stays at 1030: the same sprint removed the
    // `shelfOf({ status: 'paused' })` case with `paused` itself and added the clause holding
    // the union to the server's check constraint — one out, one in.
    //
    // Two passes landed in parallel and each raised this line from a different base. The
    // number below is counted from the merged tree, which is the whole rule; neither branch's
    // arithmetic would have reached it.
    // app 779, up one more: the clause above this table, which asks whether the table has
    // anything in it. An empty `FLOOR` passed 9 of 9 and compiled — found by producing it,
    // in a merge resolution, in the file whose subject is that a file cannot be silently
    // overwritten.
    core: 1030, app: 779, mobile: 47, relay: 24, bridge: 24, extension: 21,
  };

  /**
   * That the table above has anything in it, which nothing asked.
   *
   * `Object.entries({})` iterates nothing, so **an empty `FLOOR` passes the clause below,
   * 9 of 9, and compiles.** The guard that exists to stop a test file being silently
   * deleted can itself be silently gutted, and the failure looks exactly like success.
   *
   * Found by doing it. Resolving a merge conflict between two branches that had each raised
   * this line, I replaced the conflicted region with its comments and dropped the values —
   * `tsc` was clean, the suite was green, and nothing anywhere said the floor had stopped
   * measuring. `agents.md` practice 9 in its purest form: an instrument that omits its own
   * subject, in the one file whose subject is *"a file cannot be silently overwritten"*.
   *
   * Derived rather than listed, so a new workspace with tests joins by existing: every
   * directory at the root that holds a `*.test.*` file must have a floor. That is the
   * question the missing values would have failed and the hardcoded list would not.
   */
  it('has a floor for every workspace that has tests at all', () => {
    const withTests = readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name)
      .filter((name) => testFiles(resolve(ROOT, name)).length > 0)
      .sort();
    expect(withTests.length, 'no workspace has tests, so this proved nothing').toBeGreaterThan(3);
    const missing = withTests.filter((name) => !(name in FLOOR));
    expect(missing, 'a workspace with tests and no floor').toEqual([]);
  });

  it('holds at least as many checks as it did, so a file cannot be silently overwritten', () => {
    const shrunk: string[] = [];
    for (const [name, floor] of Object.entries(FLOOR)) {
      const dir = resolve(ROOT, name);
      const cases = testFiles(dir)
        .map((f) => (readFileSync(f, 'utf8').match(/^\s*(?:it|test)(?:\.\w+)?\(/gm) ?? []).length)
        .reduce((a, b) => a + b, 0);
      if (cases < floor) shrunk.push(`${name}: ${cases} checks, below the ${floor} it had`);
    }
    expect(shrunk).toEqual([]);
  });

  /**
   * And the suites that are not `.test.ts`, which the ratchet above cannot see.
   *
   * §6.109 caught a vitest file being overwritten. The same accident in `app/smoke.mjs`
   * would be quieter still: those suites print their own total — "263/263 checks passed"
   * — and a run with nine fewer checks prints a smaller number and the same word. Nothing
   * has ever compared one run's total to the last.
   *
   * The design harness is ratcheted by its **routes** rather than its clauses, because
   * `capture.mjs` already fails when a route has no `MUST_SHOW` (§6.105). What that does
   * not cover is a route and its clause deleted together, which is a screen quietly
   * dropped out of every design review.
   *
   * `core/src/metadata/fixtures.ts` is deliberately **not** here. Its size is not what
   * matters — §6.43 swept for fixtures smaller than reality and §6.104 for one larger —
   * and the suites that depend on a particular fixture already fail by name when it stops
   * existing. A count would guard the wrong property.
   */
  /**
   * A shot this pass takes, whether or not it keeps the number the shot returns.
   *
   * The three phone passes were each counted by `^\s*(?:await )?shot\(`, and `capture-real.mjs`
   * now keeps two of its returns — `r4-discover` and `r4-discover-back` — so it can say whether
   * turning a box over moved the shelf, which is the one thing two photographs of the same
   * shelf cannot show. That pattern read the count as five where seven shots are taken, and
   * this clause went red on a change that added a measurement and removed no picture.
   *
   * §6.183's rule, from the side that is easier to miss: a guard that fails on a repair is as
   * wrong as one that stays green on a defect, and the answer is the rule rather than the file.
   * What is counted is *shots taken*; what the old pattern counted was *shots whose value is
   * thrown away*. One spelling for all three passes, because three copies of a rule is how the
   * next one comes to disagree.
   */
  const SHOT_TAKEN = /^\s*(?:const \w+ = )?(?:await )?shot\(/gm;

  const SUITE_FLOOR: Record<string, { pattern: RegExp; least: number }> = {
    /* 152, up one: §6.171 added the other half of the year-in-review check — the headline
       figure is not also a tile. */
    'app/smoke.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 152 },
    /* 83, up two: §6.173 measured the fourth of the five keys §6.172 converted — the two
       checks on a control that has become unavailable, one for what a reader is told and
       one for what actually stops the press. Same reason as the three below them: they
       could not have passed before, which is why they were never written.

       88, counted rather than incremented. Two of the five are this sprint's: the phone's
       More screen says the local-first stance, and says that the account that stance
       mentions is not on this build — which the phone's smoke can assert and the web's
       cannot, because this script blanks the two Supabase variables itself and the web's
       builds with whatever the environment has. The other three were already there and the
       number had not moved with them, which is the slack this ratchet is not supposed to
       carry. `app/smoke.mjs` above still has some: 163 sites against a floor of 152, left
       alone because nothing in this sprint changed that count. */
    'mobile/smoke.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 88 },
    'app/failures.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 12 },
    'extension/smoke.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 21 },
    'bridge/e2e.mjs': { pattern: /^\s*(?:await )?check\(/gm, least: 22 },
    'design/capture.mjs': { pattern: /^ {2}\['\d/gm, least: 12 },
    /*
     * And the four clauses on Watching Mode, which the route count above cannot see: they
     * are not routes. §6.130 reaches that screen by walking to it — a dynamic route cannot
     * be deep-linked in the phone's web export — so the shots live outside the `routes`
     * table, and the thing that could vanish quietly is the checks, not a row in a list.
     */
    'design/capture.mjs#watching': { pattern: /unseen\.push\(/g, least: 4 },
    /*
     * And the assertions the pass makes about a *chosen* state, which no shot count and no
     * reveal count can see: they are lines inside a walk, and deleting one leaves the
     * photograph in place and the pass green.
     *
     * §6.173 added the sixth — that the country list's opener says it is open — and found
     * the other five were held by nothing at all. `unseen.push(` above is Watching Mode's
     * own list; this is the pass's.
     */
    'design/capture.mjs#unshot': { pattern: /unshot\.push\(/g, least: 6 },
    /*
     * And that every shot records what is below its fold, which is not a route either.
     *
     * §6.141: every screenshot is taken at scroll 0, and four of the phone's are the top of
     * a longer screen — `15-title` scrolls 1465 points, nearly three viewports. A design
     * review that cannot tell a whole screen from the top of a long one files defects about
     * the fold, which is what §6.138 did. The reporting is one expression; deleting it would
     * take nothing else with it and no route count would notice.
     */
    'design/shoot.mjs#folds': { pattern: /page\.screenshot\(/g, least: 2 },
    /*
     * Two: the screen, and its foot.
     *
     * This clause used to read `scrolls.push(` and sit in `capture.mjs`, with a copy of it
     * in `capture-signedin.mjs`, because the fold machinery was written out once per pass.
     * §6.160 collapsed all five copies into `design/shoot.mjs`, so the thing that could
     * vanish quietly moved with it — and the count below moved from *the machinery* to *the
     * shots each pass takes through it*, which is the property each file still owns.
     *
     * The web pass photographed with `fullPage: true` and measured
     * `documentElement.scrollHeight / innerHeight`, which §6.142 wrote down as "its twenty
     * shots are whole documents". They were not: `App.tsx` scrolls a `<main>`, so the
     * document never scrolls, `fullPage` captures one window, and the metric could only ever
     * return `1.0x`. All twenty shots were exactly 1800px tall and the pass said "every shot
     * fits one screen" about every route of both themes, for sprints. §6.153.
     */
    /* 8, up one: §6.171 gave the phone Stats-with-a-year, which §6.170 gave only the web. */
    'design/capture.mjs#folds': { pattern: SHOT_TAKEN, least: 8 },
    'design/capture-signedin.mjs#folds': { pattern: SHOT_TAKEN, least: 4 },
    'design/capture-real.mjs#folds': { pattern: SHOT_TAKEN, least: 6 },
    'design/capture-web.mjs#folds': { pattern: /shoot\(page, \{/g, least: 1 },
    'design/capture-web-real.mjs#folds': { pattern: /shoot\(page, \{/g, least: 2 },
    /*
     * The walks, which are the *second* state of a screen and the whole of §6.158.
     *
     * A route's shot and its reveal look identical on disk; deleting a reveal leaves the
     * arriving shot in place and takes nothing else with it, so no route count and no fold
     * count would notice. Eight of them across the two phone passes, each pressing a
     * control that opens something no photograph had ever shown.
     */
    'design/capture.mjs#reveals': { pattern: /reveal\(page, \{/g, least: 5 },
    /*
     * And the empty app, which is neither a route nor a reveal. §6.162.
     *
     * These three are shot **before** the import, on a library with nothing in it — the
     * states thirty sprints of design review never saw, because every pass fills the app on
     * its second screen and never goes back. They are counted separately from the routes
     * above on purpose: the routes pattern matches a line starting `  ['<digit>`, which a
     * `['00-…']` tuple satisfies, so one floor over two lists would let three deleted routes
     * hide behind three added empties. `EMPTY_FIRST` is objects for exactly that reason.
     */
    'design/capture.mjs#empty': { pattern: /name: '00-/g, least: 6 },
    /*
     * And the signed-in half. §6.163.
     *
     * Five of the register's entries are behind an account, and one stub answering nothing
     * reached all five. They are counted here rather than folded into the pass's `hollow`
     * total because a walk deleted and a clause deleted are different losses: the first
     * leaves the register pointing at a shot nobody takes, which `emptyStates.test.ts`
     * catches, and the second leaves the pass photographing whatever it finds.
     */
    'design/capture-signedin.mjs#empty': { pattern: /name: '00-/g, least: 3 },
    'design/capture-signedin.mjs#reveals': { pattern: /^\s*await press\(/gm, least: 4 },
    /*
     * The signed-in pass, counted by its **clauses** rather than by its routes.
     *
     * `capture.mjs` is ratcheted by routes because a route with no `MUST_SHOW` already
     * fails (§6.105), so the routes are the thing that could go missing quietly. This file
     * has no such rule: it reaches its screens by walking — search, a title, an episode's
     * own Talk button — so there is no list of routes to count. What it has instead is
     * seven things it refuses to photograph without, and every one of them was added
     * because a run had already produced a screenshot that showed none of it.
     */
    'design/capture-signedin.mjs': { pattern: /hollow\.push\(/g, least: 8 },
    /*
     * And the web's pass, by its clauses for the same reason — it reaches its routes by
     * address rather than by walking, but its ten routes are a table inside a function and
     * the thing that could vanish quietly is a check, not a row.
     */
    /* 9, up two: §6.170 gave the web pass Stats-with-a-year and the remote drawer, and
       each names the way it can fail to reach the state rather than shooting whatever is
       there — a year that will not press, and a control that is not on the screen. */
    'design/capture-web.mjs': { pattern: /problems\.push\(/g, least: 9 },
    /*
     * And the two **real-data** passes, by their clauses, which nothing counted at all.
     *
     * These are the passes that read a snapshot of TMDB rather than the fixture, so they are
     * the only two that have ever seen a paragraph in a browse box, an artwork in a plate or
     * a thousand-episode season list. Every clause in them was added because a run had
     * already produced a photograph that showed none of what it was taken for — and until
     * this entry, deleting one left both passes still filing the same pictures.
     *
     * Sprint 103 added three to each: the shelf must not move when a box turns over, the
     * ground under a cut synopsis must be less than a line, and a clamped paragraph's box
     * must be the lines it shows. All three are readings a photograph cannot carry, which is
     * exactly the kind of clause that goes missing quietly.
     */
    'design/capture-real.mjs': { pattern: /problems\.push\(/g, least: 7 },
    'design/capture-web-real.mjs': { pattern: /problems\.push\(/g, least: 11 },
  };

  it('keeps every check the suites that are not vitest files were holding', () => {
    const shrunk: string[] = [];
    for (const [key, { pattern, least }] of Object.entries(SUITE_FLOOR)) {
      // A `#suffix` names a second count in the same file rather than a second file.
      const file = key.split('#')[0];
      const found = (readFileSync(resolve(ROOT, file), 'utf8').match(pattern) ?? []).length;
      if (found < least) shrunk.push(`${key}: ${found}, below the ${least} it had`);
    }
    expect(shrunk).toEqual([]);
  });

  /**
   * One camera. §6.160.
   *
   * Five passes performed the same act — settle, measure what scrolls, shoot, shoot the
   * foot, put the page back — and each had written it out for itself. They agreed only
   * because one person had read all five in the same fortnight, and by the time anyone
   * counted they no longer did: three different answers to *which element is scrolling*
   * (the tallest over 200pt; the tallest that is not `overflow: visible`; the first one in
   * document order with no floor at all), two answers to *whether the page is put back*, two
   * to *what counts as a screen with more underneath*, and one pass whose walk did not catch
   * a click that times out while the pass it was copied from did. Every one of those was a
   * silent difference in an instrument whose entire job is telling this project the truth
   * about how it looks.
   *
   * A floor cannot hold this — the failure is a pass *growing* its own copy back, not
   * shrinking. So: the shutter lives in `design/shoot.mjs` and nowhere else, and every pass
   * that photographs anything imports it.
   */
  it('takes every design screenshot through the one shot', () => {
    const passes = [
      'design/capture.mjs',
      'design/capture-real.mjs',
      'design/capture-signedin.mjs',
      'design/capture-web.mjs',
      'design/capture-web-real.mjs',
    ];
    const own: string[] = [];
    for (const file of passes) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      // Comments cite the old call by name — `capture-web.mjs` explains what `fullPage: true`
      // did wrong — so the needle is the call, not the words.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/page\.screenshot\(/.test(code)) own.push(`${file} takes its own screenshot`);
      if (!/from '\.\/shoot\.mjs'/.test(code)) own.push(`${file} does not import the shot`);
    }
    expect(own).toEqual([]);
  });

  it('does not pass itself when its tests disappear', () => {
    const vacuous = names.filter((name) => {
      if (MAY_BE_EMPTY[name]) return false;
      const pkg = readJson(resolve(ROOT, name, 'package.json')) as { scripts?: Record<string, string> };
      return (pkg.scripts?.test ?? '').includes('--passWithNoTests');
    });
    expect(vacuous).toEqual([]);
  });

  it('keeps no reason for a workspace that no longer needs one', () => {
    // The §6.41 rule. An excuse outlives the thing it excuses unless something checks.
    const live = new Set(names);
    const stale = [...Object.keys(NO_TESTS), ...Object.keys(MAY_BE_EMPTY)].filter(
      (name) => !live.has(name),
    );
    expect(stale).toEqual([]);
  });
});
