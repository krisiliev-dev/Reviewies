/**
 * The sentences a person reads on both platforms, in one place.
 *
 * Every screen in this product exists twice, and until now so did its words. §6.49
 * measured four states that said different things on each side; §6.50 asked the same
 * question of controls and found four screens that could not do their own job on the
 * phone. The pattern in both is the same: nothing owned the comparison, so a fix landed
 * wherever somebody happened to be working and the other copy of the screen kept the
 * old behaviour — the empty Calendar was a dead end on the web, fixed there, and stayed
 * a dead end on the phone for two sprints.
 *
 * A sentence is here when a person meets it on both platforms. Everything else stays in
 * its screen: a label for a gesture only one platform has, a tab bar's own words, the
 * name of a screen that is called something different on each side.
 *
 * Where the two versions differed, the wording below was chosen on merit rather than by
 * platform. The phone's empty states were better — they say what to do about the
 * emptiness rather than only describing it — and are what won in most of these; the
 * web's were better where they carried a fact the phone's had dropped.
 *
 * No imports, deliberately: this is read by both apps and by the guard that keeps them
 * from drifting apart again (`app/src/wiring/copy.test.ts`), and a copy file that pulls
 * in the database is a copy file nobody can read from a test.
 */

export const COPY = {
  sync: {
    /**
     * Writes the server refused, which this device is still holding.
     *
     * A queue that is stuck used to look exactly like a queue that is empty: `attempts`
     * was counted and read by nothing, and one entry the server would never accept held
     * up every write behind it for ever. §6.71.
     *
     * The second half of the sentence is the part somebody needs, and it is true: the
     * write is in the local database where it always was, and what failed is only the
     * copy going up.
     */
    rejected: (many: number) =>
      many === 1
        ? 'One change could not be saved to your account. It is safe on this device and nothing is lost.'
        : `${many} changes could not be saved to your account. They are safe on this device and nothing is lost.`,
    /** What to press. Worth offering, because a deployment can make them work. */
    retryRejected: 'Try those again',
    /** Said after pressing it, so the button is not a shrug. */
    retrying: (many: number) =>
      many === 1 ? 'Queued one change again.' : `Queued ${many} changes again.`,
  },

  app: {
    /**
     * A tab that has been open across a deployment.
     *
     * The page keeps running the build it loaded with; the files that build was made of
     * are gone from the server. Anything loaded lazily — the emoji index, the SQLite
     * reader the TV Time importer needs — is fetched by a name that no longer exists, and
     * on a static host that answers unknown paths with the app shell it comes back as
     * *HTML with a 200*, which is the "expected a JavaScript module" failure everybody
     * has met and nobody can act on. §6.65.
     */
    updated: 'The app has been updated since you opened this tab. Reload to carry on.',
    reload: 'Reload',
    /**
     * A clock that is wrong by enough to matter.
     *
     * Sync corrects for it silently and needs no help (§6.67). Everything else this app
     * says about time cannot be corrected from here — what aired today, what is coming
     * this week, which day a watch is filed under — so the honest thing is to say where
     * the trouble is rather than let somebody conclude the app is broken.
     *
     * `by` is already a phrase: "2 hours", "3 days".
     */
    clockWrong: (by: string) =>
      `This device's clock is about ${by} out. Your history is safe and syncs correctly, but dates and what is airing will look wrong until it is fixed.`,
  },

  upNext: {
    /*
     * `justMarked` and `undo` used to live here, for the reason §6.64 found by racing two
     * tabs at the same Mark button: the other tab's write arrived between the render and
     * the press, so the tap landed on the next episode. Nothing can prevent that — a live
     * list is live — but a one-tap write with no way back is the part that made it
     * expensive, and marking is the action this product exists for.
     *
     * The way back is still there and is now closer: `ui/crossOff.ts` puts it in the
     * ring's own slot for six seconds rather than in a banner at the top of a list that
     * has already reflowed. The words moved with it, so there is nothing left to own here.
     */

    /**
     * Still working.
     *
     * §6.79 navigated part-way through a 266-row import on the phone and met a settled
     * screen: "Nothing here yet. 7 shows came from an import and have no episode lists
     * until they are matched", with a **Match imported shows** button under it. Seven
     * was a count still growing, "nothing here yet" was a claim about a finished
     * library, and the button was a repair offered over a half-written one.
     *
     * The three states a screen can be in are "nothing", "I could not look" (§6.57) and
     * this. Named here rather than at two call sites, because the last sentence that
     * lived in two places diverged within a sprint (§6.51).
     */
    stillImporting: (source: string) => `Still reading ${source}. Your shows appear as they land.`,

    /**
     * What Up Next says once an import has landed and matching is under way.
     *
     * The count is real by then, and the sentence promises only what matching actually
     * does. The phone used to say "…have no episode lists until they are matched" —
     * true, but it reads as a chore rather than as something already happening, which
     * is what doc 10 §4 objected to.
     */
    matchingImport: (shows: number) =>
      `Bringing in ${shows} ${shows === 1 ? 'show' : 'shows'} from your import. ` +
      `Episodes appear as each one is found.`,

    /** Nothing to watch, and nothing pending — the genuinely settled empty state. */
    allCaughtUp: 'All caught up — nothing has aired that you have not seen.',
  },

  watchlist: {
    /** The phone's, which names the way out. The web's was "Nothing saved yet." */
    empty: 'Nothing saved yet. Add something from Search, then say why you saved it.',
    /** Second person, matching the sentence above. The web asked "Why is this here?" */
    notePlaceholder: 'Why did you save this?',
  },

  discover: {
    /**
     * The web's. The phone said "Nothing you have already watched", which is a promise
     * the screen over-keeps: a title on your watchlist is excluded too, and somebody
     * wondering why their watchlist is not being suggested deserves the true sentence.
     */
    blurb: 'Nothing you have already watched or added.',
    /**
     * The web's, because it covers the case the phone's does not: you have tracked
     * plenty and there is still nothing new, which "Track something first" reads as a
     * non-sequitur to.
     */
    empty: 'Nothing new to suggest yet. Track a few things and come back.',
    /**
     * Why this is being suggested — the line that separates a recommendation from an
     * advert, and the one thing on the card a person actually reads.
     *
     * Two titles at most, and shared, because §6.79 found the two platforms truncating
     * it differently: the web wrote `because.slice(0, 2).join(' and ')` and the phone
     * wrote `because.join(' and ')`, so a library of a dozen shows produced *"Because you
     * watched Halt and Catch Fire and The Leftovers and Frieren and The Bear and
     * Shogun"* — five titles, four "and"s, running off the card.
     *
     * Neither §6.51's one-owner rule nor §6.52's shared-number rule caught it, because
     * the sentence was inline JSX on both sides and the number was a `.slice` at one call
     * site and missing at the other. Both are here now, which is what makes them one
     * decision instead of two.
     *
     * Two rather than three because the card is a phone-width row and the third title
     * pushes it to a second line for no added meaning: the point is that this comes from
     * something you liked, not an audit of which things.
     */
    because: (titles: string[]) =>
      `Because you watched ${titles.slice(0, 2).join(' and ')}`,
  },

  lists: {
    /** The phone's, which says why rather than reciting the build's configuration. */
    needsAccount: 'Lists need an account — they are meaningful mainly when they can be shared.',
    empty: 'No lists yet. Make one above, then add titles to it.',
    /** The web's: "Empty so far" does not say what the list is empty of. */
    listEmpty: 'Nothing on this list yet.',
    /**
     * Signed out on a build that *does* have sync configured.
     *
     * The screen gated on the build rather than on the person, so somebody signed out
     * was shown an empty list of lists — "No lists yet. Make one above" — over a Create
     * box whose button silently did nothing, because `createList` returns undefined
     * without a session. Two failures reading as ordinary emptiness. §6.56.
     *
     * Parameterised for the same reason `people.signInToFollow` is: the destination has
     * two names, "Your data" on the web and "Account" on the phone.
     *
     * The noun is whatever the navigation calls it, and §6.78 found that it had stopped
     * being. This said "the Data tab", which was true until §6.79 cut the web's eight
     * tabs down to five and moved everything else behind More — after which somebody
     * signed out was told to go to a tab that no longer existed, under a name nothing
     * on screen used. `navigationLabels` in the wiring suite now checks the argument
     * against the labels each platform actually renders.
     */
    signInToMake: (where: string) =>
      `Sign in under ${where} to make lists. Everything else on this device works either way.`,
    /** A create that did not happen, said out loud rather than as a form that resets. */
    createFailed: 'Could not make that list. It has not been saved — try again.',
    /**
     * The items behind a list, when the asking failed.
     *
     * Without this the screen said "Nothing on this list yet" — a claim about somebody's
     * own work, made because a request came back empty-handed. §6.57.
     */
    itemsFailed: 'Could not load what is on this list. It is still there — try again.',
    /** A remove or a publish that the server refused, rather than a row that vanishes. */
    changeFailed: 'That change did not go through. Nothing has been altered — try again.',
  },

  stats: {
    /**
     * The way out of an empty period.
     *
     * A person with ten years of history opening Stats in January is told "Nothing
     * watched in this period yet" with nine year-buttons above it, which reads as an app
     * that has lost their history rather than a window that happens to be empty. The
     * sentence stays; it now comes with the thing to press. Same rule as §6.50: a screen
     * that knows what you should do next should not make you find it.
     */
    showAllTime: 'Show all time',
    /**
     * "Period", not the phone's "window": the control offers *All time*, and all time
     * is not a window. The word has to be true of every choice the screen offers.
     */
    empty: 'Nothing watched in this period yet.',
    /**
     * The one line on this screen that names a day, and it was wrong three ways.
     *
     * The web wrote `new Date(day).toLocaleDateString()` and the phone wrote the key
     * itself, so the same sentence read "4/30/2026" on one platform and "2026-04-30" on
     * the other — §6.51's shape, in a sentence nobody had thought of as shared.
     *
     * The third way is the one that matters. `new Date('2026-04-30')` is UTC midnight,
     * and `toLocaleDateString` renders it locally: anywhere west of Greenwich the web
     * printed the *previous* day. Measured in America/New_York, a busiest day of the
     * 30th read "4/29/2026". That is §6.66's bug — an air date parsed as an instant —
     * still alive in one line after the rest of the product was cured of it.
     *
     * The day is formatted by `formatDay` now, like every other date this app shows.
     * §6.78.
     */
    busiestDay: (day: string, episodes: number) =>
      `Busiest day was ${day} with ${episodes} ${episodes === 1 ? 'episode' : 'episodes'}.`,
  },

  calendar: {
    /**
     * Says how far ahead it looks, which the phone's version had dropped, and what to
     * do about the emptiness, which is the phone's half. `UPCOMING_DAYS` is what makes
     * "two months" true — the two are checked against each other in the copy guard.
     */
    empty:
      'Nothing airing in the next two months. Track a show that is still running and it will show up here.',
    /** The way out of that empty state, on both platforms since §6.50. */
    findSomething: 'Find something to watch',
    /**
     * The two days a person does not want spelled as a date.
     *
     * The web said "Today"; the phone printed `2026-08-26` and left you to work it out.
     * Both go through `formatDay` in `core/src/time.ts` now. §6.66.
     */
    today: 'Today',
    tomorrow: 'Tomorrow',
    /**
     * The setting saved here but not there.
     *
     * The server filters before spending a send, so a mirror that failed means somebody
     * who just turned notifications off keeps getting them. Both screens say this now;
     * before §6.66 both fired the call with `void` and neither could have said anything.
     */
    notifySyncFailed:
      'Saved on this device. We could not tell the server, so notifications may not match this until you are back online.',
  },

  watching: {
    /**
     * The density control, named for what it actually does.
     *
     * The phone's said "Show up to N reactions a minute" while the code capped how many
     * were on screen at once — twenty-four within a four-second window is three hundred
     * and sixty a minute, so the sentence promised something the code did not do. Doc 9
     * §6.13 is the standing rule about that; this is the same mistake in the flagship.
     */
    densityChoice: (many: number) => `Show at most ${many} reactions on screen at once`,
    densityLabel: 'Density',
    /**
     * What the empty reaction band says while nothing is crossing it.
     *
     * §6.61 looked at the screenshots and found the top of Watching Mode — the part the
     * whole product is built around — was an unmarked black gap until somebody else's
     * reaction happened to arrive. A space that is the feature should say so.
     */
    streamResting: 'Other people’s reactions appear here as you reach their moments',
  },

  title: {
    /**
     * The title page, when the provider could not be reached and nothing is cached.
     *
     * It said "Loading…" for ever: the fetch was awaited without a catch, so a rejection
     * left the heading on its placeholder and the effect never finished. A placeholder
     * that never resolves is the same lie as an empty state that is really a failure.
     * §6.58.
     */
    loadFailed: 'Could not load this title. It may just be the network.',
    /**
     * The caption over the star row.
     *
     * Five grey stars in an empty band read as a divider, not a control — §6.61 on the
     * web, and §6.62 found the phone still unlabelled a sprint later. "Your" is doing
     * work: this is your rating, not an average, which is the difference from every site
     * that shows you a crowd score.
     */
    yourRating: 'Your rating',
    tryAgain: 'Try again',
  },

  whereToWatch: {
    /**
     * Not the same sentence as "nowhere to watch it", which is what this used to say
     * when the request failed — a statement about the world made from a network error.
     */
    failed: 'Could not check where this is streaming just now.',
  },

  comments: {
    /** The web's: an empty conversation is an invitation, not a status. */
    empty: 'Nothing here yet. Be the first.',
    /** "Attach", which is what the control does; the web said "Add a screenshot". */
    attach: 'Attach a screenshot',
    /**
     * Marked watched locally, but the server has not received that yet, so its spoiler
     * gate is still closed. The phone said "Nothing here yet." here — telling somebody
     * a conversation is empty when it is in fact sealed, which is the same mistake the
     * Lists screen made when it showed "No lists yet" for a failed fetch.
     */
    sealed: 'Your watch has not synced yet, so comments are still sealed. Try again in a moment.',
  },

  people: {
    /**
     * The web's fuller list, minus its em-dashed aside. Naming what still works without
     * an account is the point of the sentence — this product's stance is that nothing
     * is withheld — so the list is the part worth keeping exact.
     */
    withoutAccount:
      'Following needs sync configured, as do comments and shared reactions. Your history, ratings, lists of what to watch, stats and the whole import work without it.',
    /**
     * Parameterised, because the destination genuinely has two names: the web calls it
     * "Your data" and the phone calls it "Account". The sentence is shared; the noun is
     * not — and the noun has to be what the navigation says, which §6.78 found it had
     * quietly stopped being.
     */
    /** A follow or unfollow that did not happen, rather than a button that does nothing. */
    followFailed: 'That did not go through. Try again in a moment.',
    /**
     * The lists themselves, when the asking failed.
     *
     * They said "Nobody yet" — your own social graph, reported as empty because a
     * request came back with an error. The code that returned the empty list said so in
     * a comment, and the swallowed-failure guard carried a written excuse for it, and it
     * stayed that way until somebody read the excuse back. §6.59.
     */
    listFailed: 'Could not load these just now. Nothing has changed — try again.',
    signInToFollow: (where: string) =>
      `Sign in under ${where} to follow people. Your history stays on this device either way.`,
  },

  settings: {
    /**
     * The phone's, including "It is yours." The three words are the whole argument for
     * the export existing, and the web had dropped them.
     */
    exportBlurb:
      'Everything, in full, with no account and no upsell. It is yours. Signed in, the file carries your lists, the people you follow and your comments too.',
  },
} as const;
