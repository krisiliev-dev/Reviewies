import { COPY } from '../copy.ts';

/**
 * The contents page, held to one table — the pass `tabIcon.ts` gave the tab bar and this
 * screen never got.
 *
 * §6.176's subject in its purest form. Both platforms carried a `LINKS` array with the same
 * five rows in it, each row's label and each row's one-line description typed out twice:
 *
 * ```
 * { to:   '/settings', label: 'Your data', detail: 'Import from TV Time, export everything' }
 * { href: '/data',     label: 'Your data', detail: 'Import from TV Time, export everything' }
 * ```
 *
 * Ten sentences agreeing by hand, on the screen whose whole job is telling somebody what the
 * product contains. `copy.test.ts` could not see them: the drift comparison skips an exact
 * match, and §6.175 rebuilt that half — but a *table* is not a sentence, and moving the
 * words alone would have left the two arrays to disagree about their order, their length or
 * which row goes where.
 *
 * ## Why the address is in here and the phone's route is too
 *
 * Exactly `TAB_BAR`'s reason. The web navigates by URL and expo-router navigates by route
 * file, and the two genuinely differ for one row — the web's `/settings` is the phone's
 * `/data`. Naming both in one place is what stops a rename moving one and not the other,
 * which is §6.170's shape: one thing, two platforms, different halves.
 *
 * ## What is deliberately not here
 *
 * The phone's `Account` and `Remote` rows. Those are not the same row drawn twice, and the
 * reason is different for each:
 *
 *  - **Account.** The web reaches its account panel from another screen; the phone gives it
 *    a row here.
 *  - **Remote.** The web has no row for it *anywhere*. `App.tsx` mounts `RemoteDrawer` at
 *    the root, so the web's remote is a fixed tab clinging to the right edge of every
 *    screen — `light-08-people.png` shows it over the social screen — while the phone's is
 *    a route with a row pointing at it. One feature, two affordances, and the shared table
 *    would be claiming a parity that does not exist.
 *
 * §6.178 corrected this paragraph: it said the web reached its remote "from a control in the
 * masthead", which is not where it is and never was. A file whose job is being the authority
 * on what the two platforms share is the worst place for a reason nobody checked — §6.106's
 * lesson, on a comment two sprints old rather than a year.
 */
/**
 * ## The row that left
 *
 * `Upcoming` was the first row here and is not a destination any more —
 * `docs/design/architecture.md` section 4. The report was *"I am unsure what the difference between
 * the Watchlist and Upcoming is"*, and from the source the two are genuinely different: one
 * is what you mean to watch with a note saying why, the other is what airs next with the
 * notification granularity attached. **A distinction only legible in the code is not one the
 * user has**, and the answer was not a better `detail` line on this row. What is airing is a
 * fact about the shows you already watch, so it became the second half of Up Next, and this
 * table is one row shorter.
 */
/**
 * ## The two rows that were examined this sprint and not changed
 *
 * The finding, which is real: **Lists** and **People** describe contents the build every
 * design screenshot is taken from does not have. `07-more.png` prints `COPY.app.localFirst`
 * — *"Nothing here needs an account, and nothing is withheld"* — and two rows below it
 * offer *"Film and television in the same list"* and *"Your handle, following, blocking"*.
 * Both gate on `!syncConfigured()` (`app/src/screens/Lists.tsx`, `app/src/screens/People.tsx`,
 * `mobile/app/lists.tsx`, `mobile/app/people.tsx`), and `10-lists.png` is where the Lists row
 * lands: a back arrow, a heading, one sentence, no control of any kind. The sentence there,
 * `lists.needsAccount`, names nowhere to go — unlike `lists.signInToMake(where)` three lines
 * up in `copy.ts`, which names a destination and has `navigationLabels.test.ts` keeping that
 * argument matched to a rendered label.
 *
 * Two of the four rows in this table, and two of the six on the phone's More screen. Twelve
 * `syncConfigured()` gates are rendered across eleven files; these two are the only ones a
 * row in this table points at. The rest either hide a control outright (`AddToList` and
 * `ContentWarnings` both `return null`, which is the right shape and is not this) or sit on
 * screens nothing here names.
 *
 * ### Why the row did not change, when `Upcoming` did
 *
 * The paragraph above this table is the precedent, and it does not transfer. `Upcoming` was
 * a destination whose *distinction* was only legible in the code — the answer was to remove
 * it, not to describe it better, because there was one product and two names for one idea.
 * Lists is not that. It is one idea with **three states**, and the row is right in two of
 * them:
 *
 *  - configured and signed in — the detail line is exactly true;
 *  - configured and signed out — the gate is `signInToMake`, which names where to go;
 *  - not configured — the gate is `needsAccount`, which names nowhere. This is the one.
 *
 * A `detail` line is a single unconditional string, so any edit that makes it honest in the
 * third state makes it wrong in the first two. That is not a wording problem to be solved
 * with better words; it is a conditional destination wearing an unconditional label.
 *
 * ### Why the table was not made conditional either
 *
 * The obvious alternative is to drop the two rows when `syncConfigured()` is false. Two
 * measurements argue against doing it here, and one of them is about this file specifically.
 *
 * First, this table is read at module scope by two guards that are deliberately
 * build-independent: `navigationLabels.test.ts` collects `row.label` to check that every
 * "sign in under X" sentence names a place the navigation renders, and `offers.test.ts`
 * collects `row.to`/`row.route` to compare what the two platforms offer. Make the array
 * depend on `syncConfigured()` and both start reading whatever the *test process* happens to
 * be configured with. `docs/design/agents.md` §9 lists "a sync probe — answered 'configured'
 * on every build, including unconfigured ones" among nine instruments that altered their own
 * subject; putting that probe inside two guards whose job is to be independent of the build
 * is the same move with more leverage.
 *
 * Second, the premise is narrower than it looks, and it was measured rather than assumed.
 * `package.json`'s `design:phone` blanks `EXPO_PUBLIC_SUPABASE_URL` and
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY` on purpose, and `design:signedin` exists to photograph the
 * configured build separately. So `07-more.png` and `10-lists.png` are of a build the harness
 * deliberately unconfigures. That does **not** dispose of the finding — an unconfigured build
 * is a supported build, and `config.ts` says so in as many words — but it means the
 * population the row misleads is the self-hoster who has not filled in a `.env`, not the
 * person the deployed app serves, and a fix aimed at the wrong one of those is `§6.189`'s
 * `grep -l` premise again.
 *
 * ### What this decision was waiting on, and how it was settled
 *
 * The row was downstream of a sentence nobody had ruled on. `COPY.app.localFirst` is drawn
 * unconditionally at the top of both More screens and said *"Nothing here needs an account"*.
 * `COPY.lists.needsAccount`, 653 lines along the same file, says *"Lists need an account"*.
 * Those two contradicted each other on **every build**, configured or not, signed in or out —
 * the screenshot only made it visible. Any honest `detail` line for these two rows has to
 * agree with whichever of those sentences is the product's position, and that was a question
 * about what "here" means in the stance sentence: the local core, or the whole contents page
 * under it. `agents.md` is explicit that the instruments make judgement cheaper to check and
 * not unnecessary, and that was judgement.
 *
 * **It has been taken, and it is written where the sentences live** — the note on
 * `COPY.app.localFirst`. "Here" is your own record; an account adds the parts that involve
 * other people and subtracts nothing; Lists and People are outside the claim rather than
 * exceptions to it. The stance sentence was narrowed to its subject rather than hedged, and
 * the alternative — that the gates are the defect — was refused in writing, because a list
 * built to be opened by somebody else has no local version to un-gate.
 *
 * **This table still does not change, and now for a better reason than deferral.** With the
 * stance narrowed, the `detail` lines are not in tension with it: *"Film and television in
 * the same list"* and *"Your handle, following, blocking"* describe destinations the ruling
 * puts on the other side of a boundary the stance sentence now names. The three-state
 * argument above stands unaltered, and the build-independence argument stands with it.
 *
 * ### What was done instead, where the stance is made
 *
 * `app/src/screens/More.tsx` already drew
 * `{!bridgeConfigured() && <Note>{COPY.watching.bridgeAbsent}</Note>}` — `seams.md` §10, *the
 * sentence appears exactly where the thing does not, and never a control*. Both More screens
 * now draw the same shape against `syncConfigured()`, beside `localFirst`: the sentence
 * `COPY.app.syncAbsent`, which says that on this build the account the stance sentence
 * mentions does not exist at all — not signed out, absent. That is the third state above, answered one
 * layer up from the `detail` line, where a single unconditional string could never have said
 * it. This table is untouched and both guards that read it at module scope stay
 * build-independent.
 */
export const MORE_INDEX = [
  {
    label: 'Lists',
    detail: 'Film and television in the same list',
    to: '/lists',
    route: '/lists',
  },
  {
    label: 'People',
    detail: 'Your handle, following, blocking',
    to: '/people',
    route: '/people',
  },
  {
    label: 'Stats',
    detail: 'Runtime-weighted, and your year in review',
    to: '/stats',
    route: '/stats',
  },
  {
    /**
     * The one row whose two addresses differ, and the reason this table carries both. §6.78
     * recorded that this destination has had two *names* as well; it is "Your data" on both
     * platforms now, and holding the name here is what keeps it that way.
     */
    label: COPY.app.yourData,
    detail: 'Import from TV Time, export everything',
    to: '/settings',
    route: '/data',
  },
] as const satisfies readonly {
  label: string;
  detail: string;
  /** The web's address. */
  to: string;
  /** The phone's, which expo-router resolves against its own route files. */
  route: string;
}[];
