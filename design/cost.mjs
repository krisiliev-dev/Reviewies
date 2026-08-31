/**
 * What a *task* costs, in actions and in modelled seconds, on both platforms.
 *
 * ## Why this exists
 *
 * `design/measure.mjs` answers "how big is this control, and do the two platforms agree".
 * It is the right instrument for the question three of the last five findings turned on,
 * and it cannot answer this one. This repository has measured contrast ratios, target
 * sizes, line boxes read out of font files and press colours held under a pointer, and in
 * thirty-odd sprints it has **never measured an interaction**. Nobody here knows how many
 * actions "mark tonight's episode watched" costs, or what the alternative it replaced cost,
 * or which of the four tabs is expensive to reach from which — and `docs/design/direction.md`
 * stakes the whole design on that first one being cheap ("its signature is the loop rather
 * than something attached to the loop… it fires on the highest-frequency action in the
 * product every single time, forever").
 *
 * A target size is a property of a control. A **cost** is a property of a task, and the
 * repo's 44pt floor is one term of it. Fitts says something about *distance* too, and
 * nothing here has ever looked at distance.
 *
 * This is that instrument, and it is written in `measure.mjs`'s register on purpose: five
 * throwaway probes in two sprints is exactly why that file exists, and this should not
 * become the sixth. So it takes a task from a table rather than a control from a flag, it
 * walks the task on both builds, and it prints the same shape of answer for every task.
 *
 * ## What it is for, and what it is not
 *
 * It answers *"how many actions is this, how far does the hand travel, how big is what it
 * lands on, and what does the literature predict that costs"*.
 *
 * It is **not a guard** and it does not assert. It prints. A number that should hold
 * forever belongs in a `*.test.ts` clause against the table that states it — `TAB_BAR`'s
 * length, `RING.size`, `SIZE.inline.minHeight` — and this is the instrument you use to find
 * out what the number is before you can state it. That is `measure.mjs`'s rule and it is
 * this file's for the same reason.
 *
 * It is also not a stopwatch. Every second below is **modelled**, and the models have
 * limits that have to be read before the output is:
 *
 * - **KLM predicts expert, error-free task time and nothing else.** Card, Moran & Newell's
 *   own validation reports 21% RMS error against observed times, and the model "assumes the
 *   user is an expert and does not account for user errors… also assumes that the task is
 *   performed linearly" (Al-Megren et al. 2018, §2). It says nothing about learnability,
 *   nothing about whether somebody can *find* the control, nothing about a first run, and
 *   nothing about the mis-tap that `CrossOff`'s Undo exists for.
 * - **Fitts's law was derived for pointing, and touch is not pointing.** There is no cursor
 *   to steer, the finger occludes the target it is approaching, and selection is by contact
 *   rather than by a button press under a stationary cursor. MacKenzie (2015) measured
 *   touch selection on a phone and reported error rates 4.6× higher on small targets
 *   (12.2% against 2.7%) because the mean finger width — 14.0 mm — was more than twice the
 *   smallest target. Fitts's law models the *successful* movement; the errors it does not
 *   model are the reason the 44pt floor exists at all.
 * - **A modelled second is not a felt second.** Nothing in this file was timed on a device
 *   or on a person. `docs/design/on-a-device.md`'s sentence applies to the whole file.
 *
 * The number this file is most confident about is not a second at all — it is the **action
 * count and the geometry**, which are measurements. Read those first.
 *
 * ## The operators, with their sources
 *
 * `OPERATORS` below is the table and it carries a citation per line. Two platforms, because
 * they genuinely differ: a finger does its own homing and a mouse does not, and a phone
 * keyboard is not a keyboard.
 *
 * ## Where Hick's law is *not* used, which is everywhere
 *
 * The obvious thing to reach for on a screen with four tabs and a row of filter chips is
 * Hick's law, and it would be wrong. Liu, Gori, Rioul, Beaudouin-Lafon & Guiard (CHI 2020,
 * "How Relevant is Hick's Law for HCI?") is the paper, and it says three things that each
 * rule it out here:
 *
 * 1. Hick's law is about **choice reaction** under a learned stimulus-response mapping — a
 *    lamp lights, you press the key it maps to. Choosing which tab to open is not that; the
 *    stimulus is internal (you want the watchlist) and there is no mapping to have learned.
 * 2. Its slope depends on S-R compatibility, and "every HCI task has an extremely good S-R
 *    compatibility". Re-analysing two command-selection studies, they measure slopes of
 *    **4, 8 and 32 ms/bit**, against the 150+ ms/bit of Hick's own apparatus. At the worst
 *    of those, the whole difference between a two-tab bar and a four-tab bar is 32 ms —
 *    one twentieth of a single tap. Hick's law cannot carry an argument about tab count,
 *    in either direction. (`mobile/app/(tabs)/_layout.tsx` does not claim it does; it cites
 *    the iOS convention, which is the honest reason.)
 * 3. Logarithmic time is not evidence of Hick's law: "visual search in a hierarchical
 *    structure is logarithmic, as shown by Landauer and Nachbar… anything that involves a
 *    divide and conquer strategy can be logarithmic. In many cases, this has nothing to do
 *    with Hick's law." Finding a row in the More index is visual search, and search is what
 *    an `M` prices here.
 *
 * So the deliberation in this file is priced as `M`, per Kieras's "finding something on the
 * screen", and never as a function of how many options are on it. Where the option count
 * matters it will show up as *distance* — which is Fitts, and which this file measures.
 *
 * ## And where the steering law is not used, which is also everywhere
 *
 * Accot & Zhai (CHI 1997) give `MT = a + b·(A/W)` for steering a pointer through a
 * constrained path — a corridor, a cascading menu's diagonal, a slider's groove. This
 * product has no such task. The only drags in the build are `ScrollView` flicks (Up Next's
 * column, the `Choice` chip strip when it overflows), and a flick is a ballistic throw
 * rather than a steered traversal: nothing constrains the path, and overshooting costs
 * nothing. The `RemoteDrawer` opens on a press, not a drag. `CrossOff`'s stroke is drawn by
 * the app, not by the hand. Reported here as an absence rather than left unmentioned,
 * because "no steering task" is an answer and silence is not.
 *
 * ## Using it
 *
 *   npm run design:phone   # or any script that leaves mobile/dist built
 *   npm run design:web     # and app/dist — read that script's environment, see the trap
 *   node scripts/portFree.mjs 4200 && node scripts/portFree.mjs 4202 &&
 *   node scripts/served.mjs 4200 "npx serve mobile/dist -p 4200 --no-clipboard" \
 *   node scripts/served.mjs 4202 "cd app && npx vite preview --port 4202 --strictPort" \
 *   node design/cost.mjs --task markWatched --task reachTabs
 *
 * `--task` names a task in `TASKS`; `--all` runs every one. `--seed` imports the design
 * library first, which most tasks need — a task about marking tonight's episode cannot be
 * walked on an app with nothing in it, and the empty build's Up Next is a different screen
 * with different controls. `PHONE_BASE` and `WEB_BASE` move the ports, as in `measure.mjs`.
 *
 * `--list` prints the table and exits, which is how you find out what is measurable without
 * launching a browser.
 *
 * ## The traps
 *
 * **The first one is `measure.mjs`'s and it is inherited whole.** `app/dist` is whatever was
 * built last and what is in it depends on the environment; `npm run verify` leaves a build
 * with no remote in it. Rebuild with the design script's own environment before walking any
 * task that touches something behind a `VITE_` flag.
 *
 * **The second is this file's own: a task that fails half way through still prints.** A step
 * whose control could not be found is reported as `could not reach` and the task's total is
 * suppressed — §6.57's distinction, because a partial walk that prints a total is a number
 * that looks exactly like a measurement and is not one. Every step that *was* measured is
 * still printed, because knowing the first three steps is worth more than a blank.
 *
 * **The third is the origin.** Fitts needs a starting point, and the first press of a task
 * has no previous contact to start from. This file states one — `THUMB_REST`, the bottom
 * centre of the viewport, where a thumb is on a phone that has just been picked up and
 * where the tab bar happens to be — and marks every first hop `(assumed origin)` in the
 * output. It is an assumption, it is load-bearing for exactly one hop per task, and
 * `--origin centre` will re-run against the middle of the screen so you can see what it is
 * worth. Nothing else in the file depends on it.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { CSV } from './library.mjs';

/** The phone's export and the web's preview, as the design scripts serve them. */
const PHONE = process.env.PHONE_BASE ?? 'http://localhost:4200';
const WEB = process.env.WEB_BASE ?? 'http://localhost:4202';

/**
 * 390x844, because that is the viewport every design pass, both smoke suites and
 * `measure.mjs` use — and a distance measured at a different width is not comparable to
 * anything in the record. It is also an iPhone 12/13/14's logical size, which is what makes
 * the millimetre conversion below mean anything.
 */
const VIEWPORT = { width: 390, height: 844 };

/**
 * Points to millimetres on the device this viewport describes.
 *
 * An iPhone 13's display is 1170 physical pixels across at 460 ppi — 64.6 mm — carrying 390
 * points. So a point is 0.1656 mm and the repo's 44pt floor is **7.3 mm** of glass.
 *
 * Worth having in the file because it is the only way to put the target floor next to the
 * one number in the touch literature that is about a hand rather than a screen: MacKenzie
 * (2015) measured his participants' mean index-finger width at **14.0 mm**, which is 85
 * points. The floor is not "a finger wide" and was never claimed to be; it is the width
 * within which the *centroid* of a contact lands reliably. Stating the two side by side is
 * what stops a reader converting one into the other by eye.
 */
const MM_PER_PT = 64.6 / 390;

/**
 * Where the hand is before a task's first press.
 *
 * See the third trap in the header. The bottom centre of the viewport: a thumb's rest on a
 * phone held one-handed, and — not coincidentally — inside the tab bar, which is the one
 * piece of chrome that is on every screen at the same place.
 */
const ORIGINS = {
  rest: { x: VIEWPORT.width / 2, y: VIEWPORT.height - 44, why: 'the thumb at rest, bottom centre' },
  centre: { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2, why: 'the middle of the screen' },
};

/**
 * The operator table, one citation per line.
 *
 * Two columns because the platforms genuinely differ, and the differences are the model's
 * rather than this file's inventions:
 *
 * - **`M`, 1.2 s.** Card, Moran & Newell (1983) give .6–1.35 s and the book uses 1.35;
 *   Kieras (1993, "Using the Keystroke-Level Model to Estimate Execution Times", p.2)
 *   recommends **1.2 s** on Olson & Olson (1989)'s later results, and that is what is used
 *   here. The same on both platforms — thinking is not a property of the input device.
 *   `M_RANGE` below is printed with every total, because a task with three Ms in it has
 *   ±2.25 s of slack from this constant alone and a single figure hides that.
 * - **`H`, 0.4 s, web only.** "Home hands to keyboard or mouse" (Kieras 1993, p.2). It has
 *   no touch equivalent and this is not an omission: the finger that presses the button is
 *   the finger that types, so there is nothing to home. A model that charged the phone an H
 *   would be charging it for the web's hardware.
 * - **`K` differs by platform and this is the weakest line in the table.** The web gets
 *   Kieras's recommended design point, .28 s — "average nonsecretarial typist (40 wpm)…
 *   a good design point for characterizing the typical computer user". KLM has no
 *   soft-keyboard `K` at all, and inventing one is what `measure.mjs`'s header calls
 *   reading a renderer's behaviour as a platform's. So the phone's comes from the largest
 *   measurement of the thing itself: Palin, Feit, Kim, Kristensson & Oulasvirta (MobileHCI
 *   2019), 37,370 volunteers, **36.2 wpm** mean — 0.332 s per character at the standard
 *   five-characters-to-a-word convention. It is a *mean over everybody*, where .28 is a
 *   *design point for an expert*, so the two are not the same kind of number and a
 *   phone-versus-web comparison of a typing-heavy task is the one comparison this file
 *   cannot make honestly. It says so at the point of use.
 * - **`BB`, 0.2 s, web only.** "Click mouse button… counts as two B operators" (Kieras
 *   1993, p.2). The touch column has no equivalent because contact *is* the selection —
 *   MacKenzie's throughput is measured to selection, so charging a separate press would be
 *   counting the same tenth of a second twice.
 * - **Pointing is not a constant on either platform**, which is the whole reason this file
 *   exists; see `pointing()` below.
 */
const OPERATORS = {
  /** Kieras 1993 p.2, on Olson & Olson 1989. CMN's own range is .6–1.35. */
  M: 1.2,
  M_RANGE: [0.6, 1.35],
  /** Kieras 1993 p.2. Keyboard <-> mouse. No touch equivalent; see above. */
  H: 0.4,
  /** Kieras 1993 p.2 — two B operators. */
  BB: 0.2,
  K: {
    /** Kieras 1993 p.2: "average nonsecretarial typist (40 wpm)", his recommended point. */
    web: 0.28,
    /** Palin et al. MobileHCI 2019, n=37,370: 36.2 wpm mean -> 60/(36.2*5). */
    phone: 0.332,
  },
};

/**
 * What a press costs, from the geometry, per platform.
 *
 * ## The index of difficulty
 *
 * The Shannon formulation, which is MacKenzie's (1992, "Fitts' Law as a Research and Design
 * Tool in Human-Computer Interaction") and is the one to use:
 *
 *     ID = log2(A/W + 1)     bits
 *     MT = a + b * ID        seconds
 *
 * `A` is the distance from where the hand is to the target's centre and `W` is the target's
 * width. The `+1` is the whole point of the Shannon form: with Fitts's or Welford's the
 * index goes **negative** when the amplitude is less than half the target width, which is
 * an everyday case in a tab bar — moving from one tab to its neighbour is a distance of one
 * tab width against a target of one tab width. Under the Shannon form ID approaches 0 and
 * never goes below it. Getting this wrong would produce negative times on the single most
 * common movement in the product.
 *
 * ## Which `W`, for a rectangle
 *
 * Fitts's law is one-dimensional and every target here is a rectangle, which MacKenzie &
 * Buxton (CHI 1992, "Extending Fitts' law to two-dimensional tasks") is the paper about:
 * they compared five interpretations of `W` for 2-D targets and two of them survived. Both
 * are computed and both are printed, because the choice between them is a modelling
 * decision and not a measurement, and a reader is entitled to see it:
 *
 * - **`W'`** — the target's extent along the line the hand actually travels. The right
 *   model when a movement is mostly horizontal against a wide, short target, which is what
 *   a tab-to-tab move is.
 * - **`SMALLER-OF`** — `min(w, h)`, the conservative reading. Used for the headline number
 *   here, because it is the one that cannot flatter a control: a 350x44 row read as 350
 *   wide would price a full-width button as almost free.
 *
 * ## The constants, and why they are not the same law twice
 *
 * - **Touch.** MacKenzie (2015, "Fitts' Throughput and the Remarkable Case of Touch-Based
 *   Target Selection", HCII, LNCS 9170 pp.238-249): sixteen participants, direct touch on
 *   an LG Nexus 4 phone, grand mean throughput **6.95 bits/s** (7.52 1-D, 6.39 2-D). His
 *   own argument in that paper is that throughput should be computed as `IDe/MT` rather
 *   than as `1/b` from a regression, so it is used the way he computes it — `MT = ID / TP`,
 *   with no intercept. The 2-D figure is used, because every target in this product is a
 *   rectangle reached from an arbitrary direction.
 * - **Mouse.** Card, English & Burr (1978), as tabulated by MacKenzie (1992):
 *   `MT = 1030 + 96*ID` ms. Its intercept is large and that is not a mistake in the
 *   transcription — it is what that study measured. Sanity check, which is worth doing in
 *   the file rather than in a reader's head: at `ID = 0.73` bits it gives 1.10 s, which is
 *   exactly KLM's distance-free `P` operator. The two published numbers agree, and that
 *   agreement is the reason to trust this line.
 *
 * The two constants are from different studies, different decades and different hardware,
 * so a *phone-against-web* difference in modelled seconds is largely a difference between
 * two papers. The comparison this file can make honestly is **within** a platform: route A
 * against route B, tab i against tab j, this sprint against the next.
 */
const TOUCH_THROUGHPUT = 6.95;
const MOUSE = { a: 1.03, b: 0.096 };

const idOf = (distance, width) => Math.log2(distance / Math.max(width, 1) + 1);

/**
 * The target's extent along the approach vector — MacKenzie & Buxton's `W'`.
 *
 * The half-extent of a rectangle in a direction is `|dx|*w/2 + |dy|*h/2` over the vector's
 * length, which is the support function of an axis-aligned box; twice that is the chord the
 * approach line cuts. A zero-length move (the hand is already on the target) has no
 * direction, and takes the width, because a re-press of the same control is the case where
 * the axis is undefined and the answer is "no movement" either way.
 */
function extentAlong(box, from) {
  const dx = box.cx - from.x;
  const dy = box.cy - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return box.w;
  return (Math.abs(dx) * box.w + Math.abs(dy) * box.h) / length;
}

function pointing(platform, box, from) {
  const distance = Math.hypot(box.cx - from.x, box.cy - from.y);
  const smaller = Math.min(box.w, box.h);
  const idSmaller = idOf(distance, smaller);
  const idAlong = idOf(distance, extentAlong(box, from));
  const seconds =
    platform === 'phone' ? idSmaller / TOUCH_THROUGHPUT : MOUSE.a + MOUSE.b * idSmaller;
  return { distance, smaller, idSmaller, idAlong, seconds };
}

/**
 * What a tab is, on each of the two platforms, as one selector. See `boxOf`.
 */
const TAB_SELECTOR = '[role="tab"], nav[aria-label="Sections"] a[href]';

/**
 * The tasks.
 *
 * A task is what a person came to do, spelled to the point where the actions are decidable
 * — Kieras's step 2 — and no further. Every `think` carries the reason it is an `M`, from
 * his list of "activities that take an M": initiating a task, retrieving a chunk, finding
 * something on the screen, verifying a result. The Ms are stated rather than derived,
 * because the placement rules are heuristics applied by a person ("choosing how many Ms are
 * involved, and where they appear, is the hardest part of using the KLM") and a file that
 * silently applied Rule 0 would be presenting a judgement as an arithmetic.
 *
 * `route` names which of two ways to the same end this task is, so the pair prints together.
 * Where the product offers two, both are here: a cheaper path nobody takes is a signifier
 * problem rather than a cost one, and the only way to tell those apart is to price both.
 */
const TASKS = [
  {
    id: 'markWatched',
    of: 'Mark tonight’s episode watched',
    route: 'the ring on the Up Next row',
    why: 'The highest-frequency action in the product. direction.md stakes the design on it.',
    needsLibrary: true,
    at: '/',
    steps: [
      { think: 'find tonight’s row on a screen that opens on it' },
      { press: /^Mark .* watched$/, as: 'the ring' },
    ],
  },
  {
    id: 'markWatchedViaTitle',
    of: 'Mark tonight’s episode watched',
    route: 'through the show’s page',
    why: 'What the ring replaced, and still the only way in from anywhere but Up Next.',
    needsLibrary: true,
    at: '/',
    steps: [
      { think: 'find tonight’s row' },
      // The row tonight's ring belongs to, not the topmost row named `Open …` — the past
      // above it is named the same way. See `boxOf`.
      { press: /^Open /, near: /^Mark .* watched$/, as: 'the row' },
      { settle: 1500 },
      { think: 'find the episode in the season list' },
      { press: /^Mark .* watched$/, as: 'the episode’s ring' },
    ],
  },
  {
    id: 'catchUpSheet',
    of: 'Mark tonight’s episode watched',
    route: 'the catch-up sheet',
    why: 'The bulk path, priced for one episode so it is comparable to the other two.',
    needsLibrary: true,
    at: '/',
    steps: [
      { think: 'find tonight’s row' },
      { press: /^Catch up on /, as: 'Caught up further?' },
      { settle: 1200 },
      { think: 'find the episode in the sheet' },
    ],
  },
  {
    id: 'markThenUndo',
    of: 'Take back a mark you did not mean',
    route: 'the Undo beside the ring',
    why: 'The claim direction.md makes for the ring: the way back is beside it, not a screen away.',
    needsLibrary: true,
    at: '/',
    steps: [
      { think: 'find tonight’s row on a screen that opens on it' },
      { press: /^Mark .* watched$/, as: 'the ring' },
      { settle: 800 },
      /*
       * `CrossOff` draws Undo *beside* the ring rather than in place of it, on purpose —
       * "the filled ring is the confirmation you just earned, and hiding it for six seconds
       * to show the way out is backwards". The cost of that decision is what this measures:
       * the second press starts from the ring, so the distance is the gap between them.
       *
       * It is also on a clock. `UNDO_MS` is `linger.undo`, and everything below has to
       * happen inside it — which the modelled total is the way to check.
       */
      { think: 'realise it was the wrong row' },
      { press: /^Undo marking /, as: 'Undo' },
    ],
  },
  {
    id: 'findAndTrack',
    of: 'Find a specific show and start tracking it',
    route: 'the Track button on the search row',
    why: 'The acquisition loop. Doc 4: looking a thing up is most of why anybody searches.',
    // From Up Next, because that is where the app opens and where somebody is standing
    // when they think of a show. Starting the walk on Discover would price the task at one
    // press less than anybody ever pays for it.
    at: '/',
    steps: [
      { think: 'decide to go looking, and where' },
      { press: 'Discover', sel: TAB_SELECTOR, as: 'the Discover tab' },
      { settle: 900 },
      { think: 'retrieve the name you are looking for' },
      { type: 'Long', into: /^Search for a/, as: 'the search field' },
      { settle: 2000 },
      { think: 'find the right result among what came back' },
      { press: /^Track /, as: 'Track' },
    ],
  },
  {
    id: 'findAndTrackViaTitle',
    of: 'Find a specific show and start tracking it',
    route: 'looking at the page first',
    why: 'The route somebody takes when they want to look before they commit.',
    at: '/',
    steps: [
      { think: 'decide to go looking, and where' },
      { press: 'Discover', sel: TAB_SELECTOR, as: 'the Discover tab' },
      { settle: 900 },
      { think: 'retrieve the name you are looking for' },
      { type: 'Long', into: /^Search for a/, as: 'the search field' },
      { settle: 2000 },
      { think: 'find the right result among what came back' },
      { press: /^Open /, as: 'the row' },
      { settle: 1800 },
      /*
       * And then Track, **on the page**, which is new and is the whole reason this task is
       * worth keeping in the table.
       *
       * ## What this step used to be
       *
       * It was `press: Track` when the task was written, and the walk stopped dead on both
       * builds: *"no control on this screen carries that name"*. Read rather than assumed,
       * which is the rule `direction.md` had to write down after three directions described
       * a drawer handle none of them had opened the file for. `mobile/app/title/[id].tsx`
       * offered a rating, a poster override and per-episode React / Talk / Rate, and `Track`
       * appeared nowhere in it; `app/src/screens/TitleDetail.tsx` had no `Track`,
       * `addToLibrary` or `watchlist` either. The page you opened to decide whether to keep
       * something had no way to keep it.
       *
       * So the step became **back, find the row again, track** — search, open, back, track —
       * and the two routes to one end were priced at:
       *
       *     phone  3 presses / 6.04s   ->  5 presses / 9.19s   (+2 presses, +3.16s)
       *     web    3 presses / 9.94s   ->  6 presses / 18.47s  (+3 presses, +4 typed
       *                                    characters, +8.53s, and one press off the page)
       *
       * The web was worse than the platform's own constants explain because going back
       * there also lost the query: `Discover.tsx` holds it in `useState`, so a back
       * navigation remounted the screen on the shelf and the name had to be typed again,
       * where `expo-router` keeps the phone's results screen in the stack. That was a second
       * finding inside the first and it is recorded here rather than lost with the steps
       * that found it.
       *
       * ## What it is now
       *
       * `docs/design/architecture.md` §8b put the search row's own two controls on the title
       * page, so the detour is gone and this route is the direct one plus the press that
       * opens the page. Re-walked on both builds after the change:
       *
       *     phone  4 presses / 7.40s   (+1 press, +1.37s over the search row)
       *     web    4 presses / 12.48s  (+1 press, +2.54s)
       *
       * What is left is the press that opens the page and the deliberation the page is for.
       * That is not overhead this instrument should want to see go: a route called *looking
       * at the page first* that cost the same as not looking would mean the page was not
       * being looked at. `webSteps` is gone with it — it existed only to spell out a
       * back-and-retype the web needed and the phone did not, and there is nothing left to
       * branch on.
       */
      { think: 'decide, now that the page has told you what it is' },
      { press: /^Track /, as: 'Track, on the page' },
    ],
  },
  {
    id: 'logFilmSeen',
    of: 'Record that you watched a film, from search',
    route: 'Seen it, without opening the page',
    why: 'Doc 4 §2.2: recording a watch should not require reading anybody’s opinion first.',
    at: '/discover',
    steps: [
      { think: 'retrieve the name' },
      { type: 'Quiet', into: /^Search for a/, as: 'the search field' },
      { settle: 2000 },
      { think: 'find the film among the results' },
      { press: /^Log that you have seen /, as: 'Seen it' },
    ],
  },
  {
    id: 'rateWhatYouWatched',
    of: 'Record what you thought of something you just watched',
    route: 'the star rating on the episode row',
    why: 'The written record. rating.ts: the control’s presence is itself a state signal.',
    needsLibrary: true,
    at: '/',
    steps: [
      { think: 'find the show you just watched' },
      { press: /^Open /, near: /^Mark .* watched$/, as: 'the row' },
      { settle: 1800 },
      { think: 'find the episode in the season list' },
      /*
       * The *episode's* rating, not the show's, and the two are told apart by the name.
       *
       * `rating.ts` is the reason there is anything to press at all: a row shows what it
       * knows and the five stars appear when asked for, so this is two presses by design
       * rather than by accident, and `RATING_OPEN = false` is where that decision lives.
       * An unwatched episode offers no rating, which is why this task needs the library.
       */
      { press: /^Rate season \d+ episode \d+$|^Change your rating of season \d+ episode \d+$/, as: 'Rate' },
      { settle: 600 },
      { think: 'decide on a number' },
      { press: /^Rate season \d+ episode \d+ 4 stars$/, as: 'four stars' },
    ],
  },
  {
    id: 'halfStarTargets',
    of: 'Reach a half star rather than the whole one beside it',
    route: 'the two halves of one star, in order',
    why: 'The ten smallest targets in either build, and the pair that was stacked on the phone.',
    needsLibrary: true,
    at: '/',
    /*
     * Two presses whose *gap* is the measurement.
     *
     * `StarRating` gives each star two targets — left half sets x.5, right half sets x —
     * and each is `MIN_HALF` wide, so pressing one then its neighbour should travel 24
     * points. On the phone's export it travelled **0**: `right: { left: undefined, right: 0 }`
     * cancelled the left offset in a way `react-native-web` does not implement, both halves
     * drew at the same x, and the later one took every tap. A distance of zero between two
     * different controls is the whole finding, and it is a number rather than a look.
     *
     * Kept as a task rather than as a throwaway probe for `measure.mjs`'s reason: this is
     * the fifth time somebody has wanted a rectangle read off this screen, and the previous
     * four were deleted the same hour.
     */
    steps: [
      { think: 'find the show you just watched' },
      { press: /^Open /, near: /^Mark .* watched$/, as: 'the row' },
      { settle: 1800 },
      { think: 'find the episode in the season list' },
      { press: /^Rate season \d+ episode \d+$|^Change your rating of season \d+ episode \d+$/, as: 'Rate' },
      { settle: 600 },
      { think: 'decide on a number' },
      /*
       * `reach`, not `press`, and that is forced rather than chosen: pressing the first
       * star answers the rating and folds the five away again, so a second press has
       * nothing to land on. The question is where the two halves *are*, which is a ruler
       * rather than a task. The distance on the second line is the gap between them: 24
       * when they are placed, 0 when one is drawn on top of the other.
       * `app/src/ui/phoneStyleUnset.test.ts` is the guard; this is the reading.
       */
      { reach: /^Rate season \d+ episode \d+ 3\.5 stars$/, as: 'three and a half' },
      { reach: /^Rate season \d+ episode \d+ 4 stars$/, as: 'the whole star beside it' },
      { reach: /^Rate season \d+ episode \d+ 4\.5 stars$/, as: 'the next half along' },
      { reach: /^Rate season \d+ episode \d+ 5 stars$/, as: 'the last one' },
    ],
  },
  {
    id: 'sayWhatYouThought',
    of: 'Record what you thought of something you just watched',
    route: 'the comment composer',
    why: 'Doc 8: reading the comments is why people stayed. Writing one is the other half.',
    needsLibrary: true,
    at: '/',
    steps: [
      { think: 'find the show you just watched' },
      { press: /^Open /, near: /^Mark .* watched$/, as: 'the row' },
      { settle: 1800 },
      { think: 'find the episode, then its conversation' },
      { press: /^Comments on season \d+ episode \d+$/, as: 'Talk' },
      { settle: 1500 },
      { think: 'find the way to write, on a screen built for reading' },
      // `compose.ts`: on a screen whose purpose is reading, composing is revealed rather
      // than resident. That rule costs a press, deliberately, and this is where it is paid.
      { press: 'Say something', as: 'the composer’s hinge' },
      { settle: 800 },
      { type: 'Loved it', into: /^Say something|comment/i, as: 'the field' },
      { press: 'Post', as: 'Post' },
    ],
  },
];

/**
 * The tab bar's own task, which is twelve tasks and is generated rather than typed.
 *
 * Every ordered pair of the four tabs. Typed out it would be twelve near-identical entries
 * agreeing by hand, which is the shape `tabIcon.ts` records for the icons and `space.test.ts`
 * for the marker gap: two lists that agree only because somebody read both in the same
 * fortnight.
 *
 * One press each, so the *action count* is a constant four-by-four grid of 1 and the whole
 * finding is in the geometry. That is the point: the tab bar is the one place in this
 * product where the only variable is distance, so it is the one place Fitts can speak
 * without an `M` drowning it out.
 */
const TAB_LABELS = ['Up Next', 'Discover', 'Watchlist', 'More'];
const TAB_ROUTES = { 'Up Next': '/', Discover: '/discover', Watchlist: '/watchlist', More: '/more' };

function args(argv) {
  const out = { task: [], all: false, seed: false, list: false, origin: 'rest', settle: 2500 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]?.replace(/^--/, '');
    if (key === 'all') out.all = true;
    else if (key === 'seed') out.seed = true;
    else if (key === 'list') out.list = true;
    else if (key === 'task') out.task.push(argv[++i]);
    else if (key === 'origin') out.origin = argv[++i];
    else if (key === 'settle') out.settle = Number(argv[++i]);
  }
  return out;
}

/**
 * An element by its accessible name, with its box.
 *
 * The name rather than a selector, for `measure.mjs`'s reason: it is the one thing both
 * platforms spell the same way on purpose. A regular expression rather than a string,
 * because half the names in this product carry the *title* — `row.ts`'s rule, since a season
 * of episodes is otherwise the same word down the page — and a task table that spelled out
 * "Mark The Long Dark S2E5 watched" would be a table about one fixture rather than about
 * the product.
 *
 * **The one in front of you, and failing that the nearest — not the first in the document.**
 * A screen with eight rows has eight rings and this file cannot know which one somebody came
 * for, so it needs a rule, and the first version's rule was wrong in a way that printed as a
 * finding. Up Next draws the **past above the present** and arrives scrolled to the present
 * (`Present` in `(tabs)/index.tsx` has the argument), so the first `Open …` in document order
 * is a struck row from three weeks ago, 3,117 points *above* where the reader is standing.
 * The walk dutifully scrolled up to it and reported a task that starts with a scroll
 * backwards through your own history. That is a measurement of the harness.
 *
 * So: any match fully inside the viewport wins, topmost first; if none is, the one whose
 * centre is nearest the viewport. "What a person presses is what is in front of them" is the
 * rule, and it is the same rule the arrival scroll is built on.
 *
 * **And that rule is still not enough, which is `near`.** The past and the present are one
 * scrolling column and a struck history row is named exactly like a live one —
 * `Past.tsx:53` and `(tabs)/index.tsx`'s `open.name` build the same string from the same
 * parts, on purpose. So "the topmost `Open …` on screen" is the last row of your history
 * when the arrival scroll leaves one visible, which is what the web did: the phone opened
 * `tmdb:tv:2` and the web `tmdb:tv:3`, a show with ninety-six episodes and none left to
 * watch, and the two platforms were then compared on two different pages. `near` names an
 * anchor — "the row this ring belongs to" — and takes the match closest to it. A task that
 * means a particular row has to say which, and this is how it says it.
 *
 * **`sel` is not optional decoration, and the first run of this file proved it.** The tab
 * bar's four words are also four screen titles: asking for "Up Next" on the phone's Up Next
 * returns the `<h1>` masthead at 358x40, sixteen points from the top, and the grid came back
 * saying every tab was 776 points from every other. That is a measurement of a heading
 * wearing a tab's name, and it printed exactly like a finding. So a lookup may narrow itself
 * with a CSS selector, and the tab grid always does.
 *
 * The tab grid's selector is `[role="tab"], nav[aria-label="Sections"] a[href]`, which is
 * two clauses because **the two platforms spell a tab two different ways**: React
 * Navigation gives the phone's `<a href="/">` an explicit `role="tab"`, and the web's
 * `App.tsx` draws `<nav aria-label="Sections"><li><a href>`, with no tab role and no
 * `aria-label` on the link. Written as one selector with the two spellings side by side
 * rather than as a per-platform flag, so that the disagreement is visible in the file
 * instead of hidden in a branch — `tabIcon.ts`'s "one table, not one per surface", applied
 * to the reading rather than to the drawing.
 *
 * A named element is preferred over an unnamed one, because `react-native-web` draws a
 * `Pressable` as nested boxes carrying the same text — but the `aria-label` is the thing a
 * person or a screen reader is actually addressing, and it is what `measure.mjs` matches on
 * for the same reason.
 */
async function boxOf(page, name, sel, near = null, view = VIEWPORT) {
  const found = await page.evaluate(({ pattern, sel, near, view }) => {
    const re = new RegExp(pattern.source, pattern.flags);
    const hits = [];
    for (const el of document.querySelectorAll(sel ?? '[aria-label],[role],button,a[href],input')) {
      const labelled = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
      const label = labelled || el.textContent?.trim() || '';
      if (!re.test(label)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      hits.push({
        labelled: !!labelled,
        name: label.slice(0, 60),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      });
    }
    if (!hits.length) return null;
    // Prefer a name somebody could address over one read off the text, then what is on
    // screen over what is not, then what is nearest. See the header.
    const named = hits.filter((h) => h.labelled);
    const pool = named.length ? named : hits;
    if (near) return pool.sort((a, b) => Math.abs(a.cy - near.cy) - Math.abs(b.cy - near.cy))[0];
    const onScreen = pool.filter((h) => h.y >= 0 && h.y + h.h <= view.height);
    if (onScreen.length) return onScreen.sort((a, b) => a.y - b.y)[0];
    const middle = view.height / 2;
    return pool.sort((a, b) => Math.abs(a.cy - middle) - Math.abs(b.cy - middle))[0];
  }, { pattern: asPattern(name), sel: sel ?? null, near, view });
  return found;
}

const asPattern = (name) =>
  name instanceof RegExp
    ? { source: name.source, flags: name.flags }
    : { source: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, flags: '' };

/**
 * Import the design library, the way `capture.mjs` does and for the same reason.
 *
 * Most of these tasks are about a populated app, and the empty build is a *different
 * screen with different controls* — Up Next's first-run branch offers an import and a
 * search, and has no ring on it at all. Walking a task there and reporting "could not
 * reach" would be an accurate sentence about the wrong app.
 *
 * The CSV is `library.mjs`'s, shared rather than copied, per that file's own header.
 *
 * **Two ways in, because the two harnesses already have two.** `capture-web.mjs` sets a
 * file input directly; `capture.mjs` presses the button and answers the chooser. Neither
 * works on both — the web's control is not a `button` by role, and the phone export mounts
 * no `input[type=file]` until the picker is opened. So this tries the input where there is
 * one and the button where there is not, which is the one place this file is allowed to
 * branch on platform: seeding is scaffolding, not the subject.
 */
async function seed(page, base) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const file = { name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) };
  page.on('filechooser', (c) => c.setFiles(file).catch(() => {}));
  const inputs = page.locator('input[type=file]');
  if (await inputs.count()) await inputs.last().setInputFiles(file);
  else await page.getByRole('button', { name: /Import from TV Time/i }).click({ timeout: 20000 });
  for (let i = 0; i < 40; i += 1) {
    if (/Imported [1-9]\d* watches/.test(await page.locator('body').innerText())) break;
    await page.waitForTimeout(500);
  }
  // Matching runs from `MatchImports`, which is mounted on Up Next and nowhere else — so
  // this waits *there*, which is `capture.mjs`'s hard-won lesson and not a fresh guess.
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  /*
   * Until nothing is left to match, not until the first show matches.
   *
   * A row carries its *imported* name from the moment the CSV lands, so waiting for "The
   * Long Dark" to appear is satisfied before the matcher has run at all. The first version
   * of this waited on that and on the absence of "Matching…", and both were true in the
   * window between the import finishing and the run starting: the phone then walked to
   * `/title/local:tv:tvtime-101` — an unmatched title with no episode list — while the web,
   * a second slower, walked to `/title/tmdb:tv:2`. Two platforms on two different pages,
   * printed as a platform difference.
   *
   * `MORE_TO_MATCH` is the heading `MatchImports` renders while there is anything left, so
   * its *absence*, with rows present, is the condition. §6.98's rule again: "not showing the
   * working state" includes "has not started yet", so the row check has to hold too.
   */
  const MORE_TO_MATCH = /Match imported shows|Matching…/;
  for (let i = 0; i < 240; i += 1) {
    const body = await page.locator('body').innerText();
    if (!MORE_TO_MATCH.test(body) && /The Long Dark|Kitchen Nightshift|Hollow Crown/.test(body)) break;
    await page.waitForTimeout(500);
  }
  const landed = await page.locator('body').innerText();
  if (MORE_TO_MATCH.test(landed)) return 'matching never finished';
  return /The Long Dark|Kitchen Nightshift|Hollow Crown/.test(landed) ? null : 'the library never filled';
}

/**
 * Walk one task on one platform, measuring each step against where the hand was left.
 *
 * The press is performed after it is measured, because the next step's geometry belongs to
 * the screen the previous press produced — measuring a whole task against its first screen
 * is how you report that a control two navigations away is 30 points from your thumb.
 */
async function walk(browser, base, platform, task, { origin, settle, seeded }) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const steps = [];
  let from = { ...ORIGINS[origin] };
  let assumedOrigin = true;
  let failed = null;
  try {
    // A task about a populated app, walked on an empty one, is a walk of a different
    // screen. Refuse rather than report "could not reach" about the wrong build.
    if (task.needsLibrary && !seeded) throw new Error(`${task.id} needs a library. Pass --seed.`);
    if (task.needsLibrary) {
      const trouble = await seeded(page, base);
      if (trouble) throw new Error(`the seed did not land: ${trouble}`);
    }
    await page.goto(`${base}${(platform === 'web' && task.webAt) || task.at}`, {
      waitUntil: 'networkidle',
    });
    await page.waitForTimeout(settle);

    // A task may describe the web differently, and where it does it is because the two
    // builds are two products at that point rather than one product with a flag.
    //
    // Nothing in `TASKS` uses it today. `findAndTrackViaTitle` did — going back on the web
    // lost the query and the phone kept it, so the same task was four characters and a
    // press longer there — and that branch went away when §8b put the Track control on the
    // title page and removed the back step from both. The machinery stays because the
    // *reason* for it has not gone away: `back:` below is still the only honest way to
    // count a press this instrument cannot measure, and the next divergence will want both.

    for (const step of (platform === 'web' && task.webSteps) || task.steps) {
      if (step.settle) {
        await page.waitForTimeout(step.settle);
        steps.push({ kind: 'W', why: 'the screen answers', seconds: step.settle / 1000 });
        continue;
      }
      if (step.think) {
        steps.push({ kind: 'M', why: step.think, seconds: OPERATORS.M });
        continue;
      }
      if (step.back) {
        /*
         * A press this file can count and cannot measure, and saying which is the point.
         *
         * The web's title page has no back affordance of its own — the only control on it
         * answering to /back/i is the remote drawer's "Back 15 seconds" transport key,
         * parked off-screen at x=407. Going back is the browser's own button, which lives
         * in the chrome above the viewport, so its size and its distance are not properties
         * of this build and this instrument has no business inventing them.
         *
         * So it is counted as an action and left out of the modelled seconds, with the
         * reason printed. A press priced at zero would flatter the route; a press priced by
         * a made-up rectangle would be worse. §6.57 again: could not look is not zero.
         */
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(600);
        steps.push({ kind: 'X', why: step.back });
        from = { ...ORIGINS[origin] };
        assumedOrigin = true;
        continue;
      }
      const target = step.press ?? step.into ?? step.reach;
      // The anchor first, when the task named one, so "the row this ring belongs to" can be
      // resolved before the row is.
      const anchor = step.near ? await boxOf(page, step.near, step.nearSel) : null;
      if (step.near && !anchor) {
        failed = `${step.as ?? String(target)} — its anchor (${step.near}) is not on this screen`;
        break;
      }
      let box = await boxOf(page, target, step.sel, anchor);
      if (!box) {
        /*
         * And what the screen said instead, which is the half that turns a stop into a
         * finding. §6.57's distinction: "no control carries that name" is true of a screen
         * that is still loading, a screen that needs an account, and a screen where the
         * control was removed, and those are three different answers. The comment
         * composer's walk stopped on both platforms and only the sentence underneath said
         * why.
         */
        const said = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
        failed =
          `${step.as ?? String(target)} — no control on this screen carries that name.\n` +
          `         ${new URL(page.url()).pathname} said: “${said.slice(0, 160)}”`;
        break;
      }
      // Below the fold is a scroll and then a press. See `bringIntoView`.
      const reach = await bringIntoView(page, box);
      if (!reach.box) {
        box = await boxOf(page, target, step.sel, anchor ? await boxOf(page, step.near, step.nearSel) : null);
        if (!box) {
          failed = `${step.as ?? String(target)} — it went away when the screen scrolled to it`;
          break;
        }
        steps.push({
          kind: 'S',
          why: `scroll to ${step.as ?? box.name}`,
          points: Math.round(Math.abs(reach.scrolled)),
          where: reach.scrolled < 0 ? 'above the fold' : 'below the fold',
        });
        // The finger that flicked is not where it was and is not on the target. Back to the
        // stated origin, flagged, rather than pretending the hop is measured.
        from = { ...ORIGINS[origin] };
        assumedOrigin = true;
      }
      const point = pointing(platform, box, from);
      if (step.reach) {
        /*
         * Measured, not pressed, and neither counted nor priced.
         *
         * Some questions are about where two controls *are* rather than about a task —
         * "how far is the whole star from the half beside it" is one, and it cannot be
         * asked by pressing, because pressing the first one answers the rating and folds
         * the row away (`RATING_OPEN = false`, and `rating.ts` has the argument). So this
         * reads the rectangle, moves the reference point as if the hand had travelled
         * there, and adds nothing to the action count or the total. It is a ruler laid on
         * the screen mid-task, and the output says so on its own line.
         */
        steps.push({ kind: 'R', why: step.as ?? box.name, name: box.name, box, ...point, assumedOrigin });
        assumedOrigin = false;
        from = { x: box.cx, y: box.cy };
        continue;
      }
      steps.push({
        kind: platform === 'phone' ? 'T' : 'P',
        why: step.as ?? box.name,
        name: box.name,
        box,
        ...point,
        assumedOrigin,
        seconds: point.seconds + (platform === 'web' ? OPERATORS.BB : 0),
      });
      assumedOrigin = false;
      from = { x: box.cx, y: box.cy };

      if (step.press) {
        const was = page.url();
        await pressAt(page, box);
        await page.waitForTimeout(600);
        // Where the press landed, printed when it moved. Two platforms disagreeing about
        // what a task costs is only a finding once you know they walked to the same place;
        // the first run of the title-page route had the phone 1,050pt down a season list
        // and the web 12,590pt down one, and nothing in the output said whether that was
        // two layouts or two shows.
        if (page.url() !== was) steps.push({ kind: 'at', why: new URL(page.url()).pathname });
      } else {
        // Typing: the web homes to the keyboard and back, the phone does not. See
        // `OPERATORS`.
        if (platform === 'web') steps.push({ kind: 'H', why: 'mouse to keyboard', seconds: OPERATORS.H });
        const k = OPERATORS.K[platform];
        steps.push({
          kind: 'K',
          why: `type “${step.type}” (${step.type.length} chars @ ${k}s)`,
          seconds: step.type.length * k,
          chars: step.type.length,
        });
        await pressAt(page, box);
        await page.keyboard.type(step.type, { delay: 20 });
        if (platform === 'web') steps.push({ kind: 'H', why: 'keyboard to mouse', seconds: OPERATORS.H });
        await page.waitForTimeout(400);
      }
    }
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
  }
  await page.close();
  return { steps, failed };
}

/** Press where the measurement said the target is, so the walk and the reading agree. */
const pressAt = (page, box) => page.mouse.click(box.cx, box.cy);

/**
 * Is the target actually on the screen, and if not, put it there — counting the scroll.
 *
 * ## The defect this closes, which the first run of this file printed as a finding
 *
 * `getBoundingClientRect` is relative to the viewport and it does not stop at its edge. The
 * first walk of "mark it from the show's page" reported the episode's ring **1687pt away**
 * on the phone and **3917pt** on the web, and priced both as a single Fitts movement. A
 * viewport is 844 points tall. Those targets were a screen and a half and four screens below
 * the fold, and no hand travels to them: **a control below the fold is not one press away, it
 * is a scroll and then a press.** A number that looks exactly like a measurement and is not
 * one is the shape this repository keeps finding, and it would have been this file's own.
 *
 * So a target outside the viewport is scrolled into view first, the scroll is counted, and
 * the press is measured from where the target ends up. The scroll distance in points is
 * reported, because *how far below the fold a control sits* is a measurement about a screen
 * and is worth having on its own.
 *
 * ## And the scroll is counted but not priced, which is the honest answer
 *
 * There is no KLM operator for a scroll. Card, Moran & Newell's set is K, P, H, M, D and R,
 * and none of them is this. The touch extensions do add one — Rice & Lartigue's TLM (ACM SE
 * 2014) introduces `Swipe`, and Al-Megren, Khabti & Al-Khalifa's 2018 review collates
 * "Swipe/slide" and "Scroll" across the fifty-four extensions it surveys — but the unit
 * times are per-study, per-device and per-gesture, and none of the sources readable here
 * publishes one that could be applied to this build without inventing it.
 *
 * The steering law does not fill the gap either, and it is the obvious thing to reach for.
 * Accot & Zhai's `MT = a + b·(A/W)` is for steering *through a constrained path*, where
 * leaving the corridor is a failure. A flick down a list is ballistic: nothing constrains
 * it, overshooting costs nothing, and the fingers leave the glass. It is not a steering task
 * and pricing it as one would be a worse answer than no answer.
 *
 * So scrolls are counted, their distance is measured, and the totals say `+n scrolls,
 * unpriced` rather than absorbing a made-up constant. §6.57's distinction: could not look is
 * not zero.
 */
async function bringIntoView(page, box) {
  const inside =
    box.y >= 0 && box.x >= 0 && box.y + box.h <= VIEWPORT.height && box.x + box.w <= VIEWPORT.width;
  if (inside) return { box, scrolled: 0 };
  const before = box.cy;
  await page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (Math.round(r.top) === wanted.y && Math.round(r.left) === wanted.x && Math.round(r.width) === wanted.w) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        return;
      }
    }
  }, box);
  await page.waitForTimeout(500);
  // Signed, and printed with a direction. `Math.abs` here reported a row 3,117 points
  // *above* the reader as "3117pt below the fold", which is the wrong screen and the wrong
  // gesture. A distance with no direction is half a measurement.
  return { box: null, scrolled: before < 0 ? before - box.h : before - VIEWPORT.height };
}

/**
 * Every ordered pair of tabs, measured on the screen each one starts from.
 *
 * Not a `TASKS` entry, because its answer is a grid rather than a column and printing it as
 * twelve one-step tasks would bury the only thing it has to say.
 */
async function tabs(browser, base, platform, { settle }) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const grid = [];
  let bar = null;
  try {
    for (const start of TAB_LABELS) {
      await page.goto(`${base}${TAB_ROUTES[start]}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(settle);
      const boxes = {};
      // Narrowed to the bar, always — see `boxOf`'s header for the heading that answered to
      // a tab's name and the grid of 776pt it produced.
      for (const label of TAB_LABELS) boxes[label] = await boxOf(page, label, TAB_SELECTOR);
      if (!bar && boxes[start]) bar = boxes;
      for (const end of TAB_LABELS) {
        if (end === start) continue;
        const here = boxes[start];
        const there = boxes[end];
        if (!here || !there) {
          grid.push({ start, end, missing: !here ? start : end });
          continue;
        }
        grid.push({ start, end, ...pointing(platform, there, { x: here.cx, y: here.cy }), box: there });
      }
    }
  } catch (e) {
    grid.push({ error: e instanceof Error ? e.message : String(e) });
  }
  await page.close();
  return { grid, bar };
}

const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

function report(platform, task, { steps, failed }) {
  const acts = steps.filter((s) => s.kind === 'T' || s.kind === 'P' || s.kind === 'X').length;
  const unpriced = steps.filter((s) => s.kind === 'X').length;
  const typed = steps.filter((s) => s.kind === 'K').reduce((n, s) => n + s.chars, 0);
  const ms = steps.filter((s) => s.kind === 'M').length;
  const scrolls = steps.filter((s) => s.kind === 'S');
  // System waits are excluded from the headline, because KLM's own W is "how long the user
  // must wait, not how long the system takes" (Kieras 1993, p.2) and a `settle` in this file
  // is a harness pause rather than a measured response. They are printed, never totalled.
  const seconds = steps
    .filter((s) => !['W', 'S', 'at', 'X', 'R'].includes(s.kind))
    .reduce((t, s) => t + s.seconds, 0);
  console.log(`  ${platform.padEnd(5)} ${failed ? 'COULD NOT REACH' : `${acts} press${acts === 1 ? '' : 'es'}`}` +
    `${typed ? `, ${typed} chars` : ''}${ms ? `, ${ms} M` : ''}` +
    `${scrolls.length ? `, ${scrolls.length} scroll${scrolls.length === 1 ? '' : 's'}` : ''}` +
    (failed
      ? ''
      : `  —  ${round(seconds)}s modelled` +
        `${scrolls.length ? ' + the scrolls' : ''}${unpriced ? ` + ${unpriced} press outside the page` : ''}` +
        `${scrolls.length || unpriced ? ', unpriced' : ''}`));
  for (const s of steps) {
    if (s.kind === 'at') {
      console.log(`         ->  ${s.why}`);
    } else if (s.kind === 'R') {
      console.log(
        `         R  ${String(s.why).padEnd(24)} ${s.box.w}x${s.box.h}pt ` +
          `(${round(Math.min(s.box.w, s.box.h) * MM_PER_PT, 1)}mm min), ` +
          `${Math.round(s.distance)}pt from the last target — measured, not pressed`,
      );
    } else if (s.kind === 'X') {
      console.log(`         X  ${String(s.why).padEnd(24)} counted as an action, not priced — outside the page`);
    } else if (s.kind === 'S') {
      console.log(
        `         S  ${String(s.why).padEnd(24)} ${s.points}pt ${s.where} — counted, not priced ` +
          '(KLM has no scroll operator; see bringIntoView)',
      );
    } else if (s.kind === 'T' || s.kind === 'P') {
      console.log(
        `         ${s.kind}  ${String(s.why).padEnd(24)} ${s.box.w}x${s.box.h}pt ` +
          `(${round(Math.min(s.box.w, s.box.h) * MM_PER_PT, 1)}mm min), ` +
          `${Math.round(s.distance)}pt away, ` +
          `ID ${round(s.idSmaller)} bits [W' ${round(s.idAlong)}], ${round(s.seconds)}s` +
          (s.assumedOrigin ? '  (assumed origin)' : ''),
      );
    } else if (s.kind === 'W') {
      console.log(`         W  ${String(s.why).padEnd(24)} ${round(s.seconds)}s harness pause, not totalled`);
    } else {
      console.log(`         ${s.kind}  ${String(s.why).padEnd(24)} ${round(s.seconds)}s`);
    }
  }
  if (failed) {
    console.log(`         stopped at: ${failed}`);
    console.log('         no total, because a partial walk that prints one looks like a measurement');
  } else if (ms) {
    const lo = seconds - ms * (OPERATORS.M - OPERATORS.M_RANGE[0]);
    const hi = seconds + ms * (OPERATORS.M_RANGE[1] - OPERATORS.M);
    console.log(`         M at CMN’s own range instead of Kieras’s 1.2: ${round(lo)}–${round(hi)}s`);
  }
  return failed ? null : { acts, typed, ms, seconds, scrolls: scrolls.length };
}

const opts = args(process.argv.slice(2));

if (opts.list) {
  for (const t of TASKS) console.log(`${t.id.padEnd(24)} ${t.of} — ${t.route}`);
  console.log(`${'reachTabs'.padEnd(24)} Reach each of the four tabs from each of the others`);
  process.exit(0);
}
if (!opts.task.length && !opts.all) {
  console.error('Nothing to walk. Pass --task <id>, or --all, or --list.');
  process.exit(2);
}
if (!ORIGINS[opts.origin]) {
  console.error(`--origin must be one of ${Object.keys(ORIGINS).join(', ')}`);
  process.exit(2);
}

const wanted = opts.all ? TASKS : TASKS.filter((t) => opts.task.includes(t.id));
const wantTabs = opts.all || opts.task.includes('reachTabs');
if (!wanted.length && !wantTabs) {
  console.error(`No task matched. --list shows what there is.`);
  process.exit(2);
}

const browser = await chromium.launch(chromiumOptions());
const seeded = opts.seed ? seed : null;

console.log(
  `\nOrigin for the first press of every task: ${ORIGINS[opts.origin].why} ` +
    `(${ORIGINS[opts.origin].x}, ${ORIGINS[opts.origin].y}). One hop per task depends on it.`,
);
console.log(
  `Touch pointing: MT = ID / ${TOUCH_THROUGHPUT} bit/s (MacKenzie 2015). ` +
    `Mouse: MT = ${MOUSE.a} + ${MOUSE.b}·ID s (Card, English & Burr 1978) + BB ${OPERATORS.BB}s.`,
);
console.log(
  `M = ${OPERATORS.M}s (Kieras 1993). K = ${OPERATORS.K.phone}s phone (Palin et al. 2019), ` +
    `${OPERATORS.K.web}s web (Kieras 1993). W is printed and never totalled.\n`,
);

const totals = [];
for (const task of wanted) {
  console.log(`=== ${task.of}`);
  console.log(`    via ${task.route} — ${task.why}`);
  for (const [platform, base] of [['phone', PHONE], ['web', WEB]]) {
    const walked = await walk(browser, base, platform, task, {
      origin: opts.origin,
      settle: opts.settle,
      seeded,
    });
    const total = report(platform, task, walked);
    if (total) totals.push({ task, platform, ...total });
  }
  console.log('');
}

if (wantTabs) {
  console.log('=== Reach each of the four tabs from each of the others');
  console.log('    One press either way, so the whole finding is the geometry.');
  for (const [platform, base] of [['phone', PHONE], ['web', WEB]]) {
    const { grid, bar } = await tabs(browser, base, platform, { settle: opts.settle });
    const reached = grid.filter((g) => g.idSmaller !== undefined);
    if (!reached.length) {
      console.log(`  ${platform}: found no tab bar. That is not a measurement — check the route loaded.`);
      continue;
    }
    if (bar) {
      const item = Object.values(bar).find(Boolean);
      console.log(`  ${platform.padEnd(5)} tab item ${item.w}x${item.h}pt ` +
        `(${round(Math.min(item.w, item.h) * MM_PER_PT, 1)}mm min side), ` +
        `${TAB_LABELS.length} across ${VIEWPORT.width}pt`);
    }
    for (const g of grid) {
      if (g.missing) {
        console.log(`  ${platform.padEnd(5)} ${g.start} -> ${g.end}: ${g.missing} not on the screen`);
        continue;
      }
      if (g.error) {
        console.log(`  ${platform.padEnd(5)} could not be read: ${g.error}`);
        continue;
      }
      console.log(
        `  ${platform.padEnd(5)} ${g.start.padEnd(9)} -> ${g.end.padEnd(9)} ` +
          `${Math.round(g.distance)}pt, ID ${round(g.idSmaller)} bits [W' ${round(g.idAlong)}], ${round(g.seconds)}s`,
      );
    }
    const worst = reached.reduce((a, b) => (b.idSmaller > a.idSmaller ? b : a));
    const best = reached.reduce((a, b) => (b.idSmaller < a.idSmaller ? b : a));
    console.log(
      `  ${platform.padEnd(5)} dearest ${worst.start} -> ${worst.end} at ${round(worst.idSmaller)} bits, ` +
        `cheapest ${best.start} -> ${best.end} at ${round(best.idSmaller)}; ` +
        `spread ${round(worst.seconds - best.seconds)}s`,
    );
  }
  console.log('');
}

await browser.close();

if (totals.length > 1) {
  console.log('=== Where the product offers two routes to one end');
  const byEnd = new Map();
  for (const t of totals) {
    const key = `${t.task.of}::${t.platform}`;
    byEnd.set(key, [...(byEnd.get(key) ?? []), t]);
  }
  for (const [key, group] of byEnd) {
    if (group.length < 2) continue;
    const [of, platform] = key.split('::');
    const sorted = [...group].sort((a, b) => a.seconds - b.seconds);
    console.log(`  ${platform.padEnd(5)} ${of}`);
    for (const g of sorted) {
      console.log(
        `         ${String(g.task.route).padEnd(34)} ${g.acts} press${g.acts === 1 ? '' : 'es'}, ` +
          `${g.ms} M${g.scrolls ? `, ${g.scrolls} scroll${g.scrolls === 1 ? '' : 's'}` : ''}, ${round(g.seconds)}s` +
          (g === sorted[0] ? '  <- cheapest' : `  (+${round(g.seconds - sorted[0].seconds)}s)`),
      );
    }
  }
  console.log('');
}

console.log(
  'Read the counts and the geometry as measurements and the seconds as a model. KLM predicts\n' +
    'expert error-free time; Fitts was derived for pointing and a finger is not a cursor; no\n' +
    'number here was taken from a person or a device.',
);
