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
    /** After a sign-up: the account exists, the session does not yet. */
    confirmEmail: 'Check your email to confirm the account, then sign in.',
    /** The account panel's heading, and the one thing it does not know how to explain. */
    acrossDevices: 'Sync across devices',
    failed: 'Something went wrong',
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
    /**
     * The product's stance, drawn at the top of More on both platforms — where somebody
     * arriving from a shut-down service goes looking for the catch.
     */
    localFirst:
      'Everything lives on this device. Nothing here needs an account, and nothing is ' +
      'withheld — this is the whole point of the app.',
    /**
     * What a crashed screen says. The heading names what happened to *this screen*
     * rather than to the app, and the sentence under it is about the data, because the
     * only question worth answering there is whether anything was lost.
     */
    crashed: 'This screen stopped',
    crashedDetail:
      'Something on it went wrong. Everything you have tracked is still here — it lives ' +
      'on this device and nothing was lost.',
    /**
     * An abort we asked for, said out loud. Distinct from a search that came back with
     * nothing, which is §6.57's other half and has its own sentence.
     */
    timedOut: 'That took too long. Check your connection and try again.',
    /** A route that is not one. Both `NotFound` screens said this, separately. */
    notFound: 'Nothing at this address',
    /**
     * What the destination is called, in the one place that names it.
     *
     * `lists.signInToMake(where)` and `people.signInToFollow(where)` both take this as an
     * argument because §6.78 found the two platforms calling it different things; the
     * argument stayed and the noun was typed at four call sites. `MORE_INDEX` reads it too,
     * so the contents page and the sentences pointing at it cannot come apart.
     */
    yourData: 'Your data',
    /** A search that came back with an error, as against one that came back empty. §6.57. */
    searchFailed: 'Search failed',
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

    /**
     * Caught up, and **waiting** — which is not the same state and had one sentence. §6.164.
     *
     * `00-caughtup-upnext.png` was the first photograph of this screen settled, and it said
     * *"All caught up — nothing has aired that you have not seen"* over a filled *Find
     * something to watch*, to somebody caught up on two shows that are still running. Their
     * next episodes were in the calendar the same design run photographed. The sentence was
     * true and the offer answered a different question: what that person is doing is waiting,
     * and the screen they open every day between episodes said nothing about the thing they
     * were waiting for.
     *
     * `when` comes from `formatDay`, the same formatter the calendar's own day headings use —
     * so "Today", "Tomorrow", a weekday inside the week, and a date beyond it.
     *
     * **The day opens the clause**, and that is the photograph's doing. The first version read
     * *"All caught up. The Long Dark is next, Today."* — `formatDay` capitalises for a heading,
     * and mid-sentence that reads as a mistake. Lowercasing it would break "Sat, Sep 19", and a
     * second sentence-position formatter would be a second answer to §6.66's question. Putting
     * the day first makes every one of the four outputs sentence-initial, and it front-loads
     * what somebody waiting actually wants: *"All caught up. Today: The Long Dark."*
     *
     * One show, not a list. The next one is what this screen is for; the rest are what the
     * calendar is for, and the offer beside this sentence now goes there.
     */
    caughtUpWaiting: (show: string, when: string) => `All caught up. ${when}: ${show}.`,
    /**
     * Nothing to watch, and nothing pending — the genuinely settled empty state.
     *
     * This one keeps *Find something to watch* as its offer, because here that is the right
     * question: nothing is coming, and the way out really is a new show.
     */
    allCaughtUp: 'All caught up — nothing has aired that you have not seen.',
    /** Where the rest of what is coming lives. Named for the screen it opens — §6.78. */
    /**
     * The migration's three sentences, on the screen the product opens on — the highest-
     * traffic prose in the app, and typed out on both platforms until §6.175.
     */
    importedExplained:
      'They are in your library under the names your export carried. Matching them to ' +
      'the real shows fills in the artwork, the air dates and everything you have not ' +
      'watched yet.',
    tvTimeGone:
      'TV Time is gone. If you got your data out — or pulled it off your phone — this ' +
      'reads it and picks up where you left off.',
    /** The way out for somebody who has nothing to bring. */
    nothingToImport: 'Nothing to import? Search for a show and start from there.',
    /** The two headings over the migration, which are the first words a migrant reads. */
    historyIsIn: 'Your history is in',
    /** The tag on a season's final episode. */
    lastOne: 'Last one',
    bringHistory: 'Bring your history with you',
    seeUpcoming: "See what's upcoming",

    /**
     * The two halves of this screen, named. `docs/design/architecture.md` section 4.
     *
     * Upcoming stopped being a destination this sprint: the report was *"I am unsure what
     * the difference between the Watchlist and Upcoming is"*, and the difference was real
     * and lived only in the source. It is not a better label on a seventh screen — what is
     * airing is a fact about the shows you already watch, so it is a view of this one.
     *
     * `outNow` against `COPY.screens.upcoming` on purpose. The opposition is *has it come
     * out or not*, which is the only axis these two halves differ on, and the word somebody
     * already knows keeps its meaning while losing its address.
     */
    outNow: 'Out now',
    /**
     * What the two chips are a choice *of*, which is the name a screen reader announces
     * after the option. "Out now, selected, 1 of 2, Showing".
     */
    showing: 'Showing',
    /**
     * The heading over the past. `architecture.md` section 3.
     *
     * The history sits **above** the present, so this is the one heading on the screen a
     * person meets by scrolling *up* into it — which is why it is a heading at all rather
     * than an unlabelled run of struck rows. Without it the fold reads as a list that has
     * been crossed off by mistake.
     */
    alreadyWatched: 'Already watched',
  },

  /**
   * The names of controls, which are copy and were not being read as copy.
   *
   * §6.98 gave the words one owner and §6.98's guard compares what each pair of screens
   * says — but it read a name only when it was a quoted literal, and a control's name
   * almost never is: it has the title in it, so it is a template. Widening the guard to
   * read those found four of them at once, in both directions:
   *
   *   web  "Add X to your watchlist"      phone  "Add X to watchlist"
   *   web  "Remove X from watchlist"      phone  "Remove X from your watchlist"
   *   web  "Move the clock 5 seconds forward"     and, on the same screen, "Move the
   *        clock forward 5 seconds"
   *
   * The watchlist pair disagrees one way on Search and Discover and the *other* way on
   * the watchlist itself, which is what drift with nobody watching looks like. These are
   * the sentences a screen reader says out loud, so they are the copy somebody who cannot
   * see the screen actually reads.
   */
  controls: {
    /**
     * The word that folds a revealed thing away again — a settings panel, a flagging list,
     * a catch-up sheet.
     *
     * Five sites wrote it: two `ContentWarnings`, two `CatchUp`s and the calendar's panel
     * when §6.134 gave it one. It nearly became `SETTINGS.close` in `ui/compose.ts`, and
     * that was the wrong home — `CatchUp` is a sheet, not a setting, so the constant would
     * have been named for one of its five callers. A word the product says belongs here.
     */
    done: 'Done',
    /**
     * The verb that starts something, drawn and announced.
     *
     * `Track` is the word Search and Discover already draw on the button that puts a title
     * in your library, typed at each call site. §6.167 gave the watchlist the same verb —
     * the screen's only drawn control was *Remove* — and a third hand-typed copy of a word
     * three screens say is how `saveToWatchlist` and `addToWatchlist` came to be two
     * sentences for one act.
     *
     * The label is the bare verb and the name carries the title, because a screen of rows
     * is the same word repeated down the page and a screen reader reads the control rather
     * than what is above it.
     */
    /**
     * The way back into a show you binged away from the app, drawn as what it does.
     *
     * It read **"Caught up further?"** on both platforms — the only question mark on any
     * control in the product, on a screen where every other control is a verb: *Track*,
     * *Watchlist*, *Remove*, *Save*, *Pause*, *Hold*. §6.167.
     *
     * The verb was already there and only screen readers heard it: the announced name has
     * always been `Catch up on {show}`, so the label and the name disagreed about what the
     * control was. This makes the drawn word the announced one.
     */
    catchUp: 'Catch up',
    catchUpOn: (name: string) => `Catch up on ${name}`,
    track: 'Track',
    trackTitle: (name: string) => `Track ${name}`,
    addToWatchlist: (name: string) => `Add ${name} to your watchlist`,
    saveToWatchlist: (name: string) => `Save ${name} to your watchlist`,
    removeFromWatchlist: (name: string) => `Remove ${name} from your watchlist`,
    /**
     * The two faces of a browse box. `docs/design/architecture.md` section 5.
     *
     * A box is one control with two states rather than a card with a button on it, which
     * is what `row.ts` means by "never a control inside the target": the front is a press
     * that turns it over and the back is a press that turns it back, and the two actions
     * that matter — Track, Watchlist — are only on the back, where a decision is being made.
     *
     * Named rather than announced as "button": the shelf is a grid of twenty of these and
     * a screen reader reads the control, not what is above it. §6.96.
     */
    turnOver: (name: string) => `More about ${name}`,
    turnBack: (name: string) => `Turn ${name} back over`,
    /**
     * The way off the shelf and onto the title's own page.
     *
     * Before `docs/design/architecture.md`'s rework a Discover row opened `/title/:id`
     * (`e09ac85^:app/src/screens/Discover.tsx:143`). The box that replaced it turns over,
     * and the back it turns over to carries the synopsis and two verbs — so where to watch
     * it, what it warns you about, its seasons and its cast became unreachable from the
     * shelf while staying one press away from a search result for the same title. None of
     * that document's eight refusals says so and the commit does not mention it.
     *
     * **Drawn `Details`, announced `Open {name}`.** The two differ on purpose, which is
     * what `ButtonContract` requires both to be written for. *Open* is the word every
     * other route to this page announces — six call sites, all `Open ${name}` — so a
     * screen reader hears one sentence for one destination whether it came off the shelf
     * or out of the results. *Open* drawn would be the wrong word in a box that is already
     * open: the front's press is the turning-over and its name is already *More about*.
     */
    details: 'Details',
    /**
     * The announced name of a field, which is not its placeholder.
     *
     * `Field` requires a label because every input in the app had none: each relied on a
     * placeholder, and a placeholder is gone the moment somebody types into it. Two fields
     * on one screen both saying "Why did you save this?" are two fields a screen reader
     * cannot tell apart, which is what naming them by title fixes.
     */
    noteFor: (name: string) => `Your note about ${name}`,
    /**
     * Signed: negative moves the clock back. Both the fixed ±5s buttons and the drift
     * correction go through this, so the app has one way of saying it rather than the
     * two the same screen had.
     */
    seek: (seconds: number) =>
      `Move the clock ${seconds < 0 ? 'back' : 'forward'} ${Math.abs(seconds)} seconds`,

    /**
     * The rest of the product's control names, which both platforms typed for themselves
     * until §6.176.
     *
     * §6.175 moved the *sentences* and drew its line at a full stop, on the argument that a
     * sentence is the product speaking and a control's name is a different kind of text.
     * That argument was right about the kind and wrong about the owner: there is no second
     * owner. `labelSet.test.ts`, which the brief expected to hold these, is about the eight
     * label **colours**. So they come here, and the line moves down to where it should have
     * been — a name a person reads on both platforms has one owner, the same as a sentence.
     *
     * Grouped by what they act on rather than by screen, because several are used on more
     * than one and the screen is not the thing that owns them.
     */

    // The account panel.
    createAccount: 'Create account',
    createAccountInstead: 'Create an account instead',
    haveAccount: 'I already have an account',

    // Comments.
    removeScreenshot: 'Remove the attached screenshot',
    deleteComment: 'Delete your comment',

    /**
     * Lists, and a drift this sweep found rather than moved.
     *
     * The web said `isPublic ? 'Make private' : 'Publish'` and the phone
     * `isPublic ? 'Make private' : 'Make public'` — **one control, two names**, and
     * `copy.test.ts`'s near-match comparison could not see it: "Publish" and "Make public"
     * share no word, so they score 0 and read as two unrelated pieces of text rather than
     * as the same one written twice. The threshold is calibrated for *reworded* copy and
     * this was *renamed* copy.
     *
     * §6.51 settles which wins: the pair. "Make public" and "Make private" read as one
     * control's two states; "Publish" beside "Make private" reads as two controls.
     */
    makePublic: 'Make public',
    makePrivate: 'Make private',
    createList: 'Create this list',
    makeListAndAdd: 'Make this list and add the title to it',

    // Getting somewhere else after something went wrong.
    goToUpNext: 'Go to Up Next',
    seeEverythingElse: 'See everything else',
    searchAgain: 'Try that search again',
    dismiss: 'Dismiss this message',

    // Your data.
    exportJson: 'Export everything (JSON)',
    exportCsv: 'Export watch history (CSV)',
    clearCache: 'Clear cached metadata',
    chooseFiles: 'Choose files',
    restoreListsAndFollows: 'Restore lists and follows',
    importFromTvTime: 'Import from TV Time',

    // The poster somebody supplies when the provider has none.
    changePoster: 'Change poster',
    differentPoster: 'Use a different poster',
    savePoster: 'Save this poster',
    cancelPoster: 'Cancel changing the poster',

    // Watching Mode's controls, which are the ones a person uses in the dark.
    startWatching: 'Start watching',
    leaveWatching: 'Leave Watching Mode',
    pauseClock: 'Pause the clock',
    resumeClock: 'Resume the clock',
    holdReactions: 'Hold other people’s reactions still',
    moveReactions: 'Let other people’s reactions move again',
    helpMapEpisode: 'Help map this episode',
    closeRemote: 'Close remote',

    // Content warnings.
    hideWarnings: 'Hide content warnings',
    /* The shut state's name is `warnings.heading` — one word for one thing, and this file's
       own unread-sentence clause is what noticed a second key for it. */
    flagSomething: 'Flag something',

    /**
     * The two-word names, swept at `PROSE_FLOOR = 6`. §6.176 lowered the line twice: 25 to
     * 12 took the phrases, 12 to 6 takes these. Below six it stops, and the reason is in
     * `copy.test.ts` — "Done", "Cancel", "Add" are the words a control uses when it is not
     * naming anything specific, and two screens using the same generic verb are not two
     * copies of one decision.
     */
    signIn: 'Sign in',
    signOut: 'Sign out',
    followBack: 'Follow back',
    seenIt: 'Seen it',
    tryAgain: 'Try again',
    watchAlong: 'Watch along',
    addToList: 'Add to list',
    openRemote: 'Open remote',
    /**
     * The rest of the product's own words on its own controls, swept at the single-word
     * line. §6.177's judgement: a word gets an owner when changing it should change both
     * platforms, which is true of a thing this product names and false of ordinary English
     * for what a button does.
     */
    remote: 'Remote',
    device: 'Device',
    talk: 'Talk',
    react: 'React',
    season: 'Season',
    /** Watching Mode's transport, the labels beside `pauseClock` / `resumeClock`'s names. */
    pause: 'Pause',
    resume: 'Resume',
    hold: 'Hold',
    held: 'Held',
    /** A search result that is already in the history, and one saved for later. */
    logged: 'Logged',
    later: 'Later',


    // The rest.
    /**
     * The two labels a Discover row swaps to once it has been pressed.
     *
     * §6.176 found the web had neither: its Watchlist button said "Watchlist" for ever, so
     * pressing it twice looked identical and nothing confirmed the first press had landed.
     * The phone had already disabled the control and relabelled it. §6.51 — the phone's
     * version wins, and these are the words it wins with.
     */
    tracking: 'Tracking',
    watchlist: 'Watchlist',
    findToWatch: 'Find something to watch',
    findSomething: 'Find something',
    noneOfThese: 'None of these',
    /** For a miss rather than an ambiguity: there is nothing to be none of. */
    leaveForNow: 'Leave it for now',
    openJustWatch: 'Open on JustWatch',
  },

  /**
   * What each field is called out loud.
   *
   * `Field` requires a label because not one input in the app had one — every single one
   * relied on its placeholder, and a placeholder is gone the moment somebody types. The
   * labels live here for the reason all the words do: written at the call sites, the two
   * platforms immediately said "New list name" and "Name for a new list" for the same box,
   * which `copy.test.ts` caught within minutes of them being written.
   */
  fields: {
    search: 'Search for a show, film or anime',
    listName: 'Name for a new list',
    handle: 'Your handle',
    displayName: 'Your display name, optional',
    findPeople: 'Find somebody by handle or name',
    email: 'Email',
    password: 'Password',
    posterUrl: 'Address of a poster image to use instead',
    comment: 'What you thought of this episode',
    /** The prompt inside the box; `comment` above is the name a reader hears for it. */
    commentPlaceholder: 'What did you think?',
    emoji: 'Search any emoji',
    matchSearch: (name: string) => `Search for the show ${name} really is`,
    /**
     * And the placeholder, which is a different sentence from the label and also had two
     * spellings: the Lists screen said "New list name" while the three other places the
     * same box appears said "New list…". §6.98's rule, in the layer §6.116 was building.
     */
    newListPlaceholder: 'New list…',
    /**
     * The rest of the placeholders and field names, both platforms' until §6.176.
     *
     * `emojiPlaceholder` is not a duplicate of `emoji` above it: one is the name a reader
     * hears, the other is the grey text in the box, and they differ by an ellipsis. That
     * they differed *only* by an ellipsis, in two files, is why they are both here now.
     */
    passwordRule: 'Password (8+ characters)',
    handleOrName: 'Handle or name',
    searchPlaceholder: 'Shows, films, anime…',
    emojiPlaceholder: 'Search any emoji…',
    /** The box under `posterUrl`, which is that field's label. */
    posterUrlPlaceholder: 'Image URL',
  },

  watchlist: {
    /**
     * The phone's, which names the way out. The web's was "Nothing saved yet."
     *
     * It said *"from Search"* until this sprint, and Search is not a place any more —
     * `docs/design/architecture.md` section 5 merged it into Discover. A sentence that sends
     * somebody to a screen the interface no longer has is §6.78's defect, which is the one
     * `navigationLabels.test.ts` exists because of; the same class of bug, on a sentence
     * that guard does not read.
     */
    empty: 'Nothing saved yet. Add something from Discover, then say why you saved it.',
    /**
     * Second person, matching the sentence above. The web asked "Why is this here?"
     *
     * The web's *search* row asked a third thing — "Why? e.g. Ana recommended" — which
     * nothing owned and this guard could not see, because a `placeholder` on the phone is
     * `placeholder={...}` and the comparison read quoted literals. One field, one
     * question, on all four of the places it appears.
     */
    notePlaceholder: 'Why did you save this?',
    /** What a search result says when the thing is already saved. */
    alreadyOn: 'On watchlist',
  },

  discover: {
    /**
     * The web's. The phone said "Nothing you have already watched", which is a promise
     * the screen over-keeps: a title on your watchlist is excluded too, and somebody
     * wondering why their watchlist is not being suggested deserves the true sentence.
     */
    blurb: 'Nothing you have already watched or added.',
    /**
     * What the screen says when the feed is the **fallback** rather than a recommendation.
     *
     * `getSuggestions` is all-or-nothing: it builds from your library, and only if that
     * comes back empty does it fall back to a trending chart. So the screen has two modes
     * and, until §6.169, said the same blurb in both — `blurb` above is true of a chart as
     * well, so nothing on the screen told you which one you were looking at.
     *
     * `narrow-discover-foot.png` is what that looked like against real TMDB data: thirty
     * rows, each carrying *Popular right now* under its title, in the slot the entry above
     * calls "the line that separates a recommendation from an advert". A line that says the
     * same thing on every row it appears on is not that line. It is the screen's mode, and
     * a screen's mode is said once, at the top, where the screen says what it is showing.
     *
     * §6.104's rule one subject over: "nothing" and "I could not look" are different
     * sentences, and so are "things like what you watch" and "things people are watching".
     */
    trendingBlurb:
      'Nothing to recommend from your library yet, so these are what people are watching.',
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
    /**
     * `watched` is not a nicety — it is the difference between a true sentence and a false
     * one.
     *
     * §6.170 made a tracked-but-unstarted title a seed, because `seedTitles` read watch
     * history while `excludedTitleIds` read the library as well, so Discover excluded what
     * you tracked and learned from none of it. The first real-data photograph of the feed
     * that produced said **"Because you watched Shōgun"** five times, about five shows with
     * no watches against them — the exact defect this file's `trending` entry below was
     * written about, arriving from the other side.
     *
     * So the verb comes from the seed. *Watched* where there is watch time, *track* where
     * there is only a library row. `mergeSuggestions` sets the flag true if **any**
     * contributing seed was watched and puts that seed's name first, so the stronger
     * sentence is only ever said about names it is true of.
     */
    because: (titles: string[], watched: boolean) =>
      `Because you ${watched ? 'watched' : 'track'} ${titles.slice(0, 2).join(' and ')}`,
    /**
     * What the last-resort feed says instead.
     *
     * The fallback passed the literal `'Trending now'` as a seed, so `because` above
     * rendered **"Because you watched Trending now"** on every row — a false sentence on
     * the screen whose whole claim is that saying *why* separates a recommendation from an
     * advert. Nothing had seen it because reaching the fallback needs a library with
     * nothing **watched** in it, and no fixture pass is ever in that state. §6.152.
     *
     * Not a "because" at all, so it does not pretend to be one.
     */
    trending: 'Popular right now',

    /**
     * The filter row, revealed rather than resident. `docs/design/architecture.md` section 6.
     *
     * `compose.ts`'s rule, sixth application: on a surface whose purpose is reading, a
     * control panel is opened, not left standing over the thing you came for. Three
     * `Choice` groups behind one row, and the row states what is on when it is shut — the
     * same shape the calendar's notification panel took in §6.134.
     */
    filters: 'Filters',
    /** What is on, said by the shut row, so opening it is never the only way to find out. */
    filtersOn: 'Narrowed',
    filtersOff: 'Everything',
    filterKind: 'Kind',
    filterGenre: 'Genre',
    /**
     * Not "rating".
     *
     * The word `rating` in this product means **your** rating — `rate()`, the five stars on
     * an episode row — and a filter on a shelf of things you have not seen cannot mean that.
     * This one is the crowd's, and `architecture.md`'s third refusal is that the number
     * filters and is never printed. A different word for a different thing.
     */
    filterStanding: 'Standing',
    anyKind: 'Anything',
    anyGenre: 'Any genre',
    anyStanding: 'Any',
    wellRated: 'Well rated',
    /**
     * Absence somebody caused with a control, which is not an empty state.
     *
     * `emptyStates.ts` files it under `NOT_AN_EMPTY_STATE` for the reason its neighbour
     * `comments.allFiltered` gives: the shelf is not empty, it has been narrowed, and
     * saying "nothing to suggest" here would be §6.57's mistake in reverse — blaming the
     * data for what the filter did.
     */
    allFiltered: 'Nothing on the shelf matches those filters.',
  },

  lists: {
    /** The phone's, which says why rather than reciting the build's configuration. */
    needsAccount: 'Lists need an account — they are meaningful mainly when they can be shared.',
    empty: 'No lists yet. Make one above, then add titles to it.',
    /**
     * The web's: "Empty so far" does not say what the list is empty of — and until §6.163 it
     * did not say what to do about it either.
     *
     * `00-list-empty.png` is the first photograph of this state, and it shows one sentence
     * over a single control reading **Make public**: an offer to publish a list with nothing
     * on it. The way to put something on a list is `AddToList`, which lives on a title page
     * and which this screen never mentions. Its two neighbours both name the way out —
     * `lists.empty` says "Make one above", `watchlist.empty` says "Add something from Discover"
     * — and this one was the odd one of the three.
     */
    listEmpty: 'Nothing on this list yet. Open a title and use Add to list.',
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
    /**
     * The picker's version of `empty` — the same absence, a different direction to point.
     *
     * `empty` above says "make one above" because the Lists screen puts its box at the
     * top; the sheet that adds a title to a list puts its box at the bottom. Two
     * sentences because the screens genuinely differ, one owner because until §6.175 both
     * platforms typed *this* one out for themselves.
     */
    emptyInPicker: 'No lists yet — make one below.',
  },

  stats: {
    /** Two figures' names, typed on both platforms until §6.176. */
    /**
     * The two periods, which both platforms named in their own `PERIODS` array. The keys
     * were already shared; the labels were not.
     */
    thisYear: 'This year',
    allTime: 'All time',
    /**
     * The figures' names. `watches` and `tracked` are More's card rather than this screen,
     * and they are here because they count the same things — one word per quantity, not
     * one per screen that shows it.
     */
    watched: 'Watched',
    episodes: 'Episodes',
    titles: 'Titles',
    watches: 'Watches',
    tracked: 'Tracked',
    longestStreak: 'Longest streak',
    mostWatched: 'Most watched',
    /**
     * The year spine, named for what it is rather than for what it is made of.
     *
     * `docs/design/direction.md` calls the object a spine and `docs/design/calm.md` argues
     * for it; neither word belongs on the screen. A person arrives at Stats asking *what
     * have I watched*, and the heading over a stack of years answers that in two words.
     * "Year spine" is the name of a drawing, and a heading that names its own construction
     * is the same mistake as `Density  8  24  60` one screen over (§6.55).
     */
    yourYears: 'Your years',
    /**
     * One row, said out loud.
     *
     * The twelve blocks are drawn and not announced — twelve elements per year is a
     * screen reader reading a bar chart bar by bar, which is the shape of the data and not
     * the sense of it. So the row carries one sentence with the three facts a sighted
     * reader takes off it: which year, how much, and where the weight of it fell. The
     * busiest month is the peak, and a year is remembered by its peak rather than by its
     * total — which is the one thing Kahneman's rule is safe to be used *for* here, per
     * `docs/design/calm.md`.
     *
     * `duration` arrives from `formatDuration`, so this sentence never spells a unit and
     * cannot disagree with the figure printed beside it.
     */
    spineYear: (year: number, episodes: number, duration: string, busiest: string) =>
      `${year}: ${episodes} ${episodes === 1 ? 'episode' : 'episodes'}, ${duration}, busiest in ${busiest}.`,
    /** The same row, in the year nothing has been watched in yet. */
    spineYearNothing: (year: number) => `${year}: nothing marked yet.`,
    /**
     * The open cell — the one sentence in this product that is about tonight.
     *
     * It is a **fact and not an offer**. "The next episode you mark goes here" says what
     * the box is; "mark an episode to fill it" would be the app asking, which is the whole
     * thing `docs/design/calm.md` refuses. The difference is one clause and it is the
     * difference between a record and a streak.
     */
    openSlot: 'One space still open this month. The next episode you mark goes here.',
    /**
     * What the whole period control is called — one name, because it is one question.
     *
     * The two rows named themselves separately, "Which stretch of time these figures cover"
     * and "Which year to review", which is how the screen came to hold two radiogroups for
     * one answer and leave one of them announcing nothing selected (§6.138). One group, one
     * name, and it has to be true of a year as well as of *All time*.
     */
    period: 'Which stretch of time these figures cover',
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
     * The second row of the one period control, labelled rather than sectioned.
     *
     * It was a `Section` on both platforms — tracked caps at a section's spacing — drawn
     * in the **middle of a single radiogroup**. §6.138 made the two rows one question and
     * one answer in the markup; the drawing still said two, because a section heading is
     * what this build puts between parts of a screen, and a reader takes it as a boundary.
     * `08-stats.png`: three chips, a heading, three more chips, and one mark somewhere in
     * the six.
     *
     * A footnote is what `note.ts` calls "a footnote under a control", which is what
     * Watching Mode's density label is and what this is: the row's own label, not a part
     * of the screen. Sentence case for the same reason — `section.ts`'s table gives caps
     * and tracking to a section and *as written* to everything else.
     *
     * The words stay: TV Time's REWIND was among its most-loved features and this is that,
     * so the row says what it is.
     */
    yearInReview: 'Year in review',
    /**
     * The headline over a chosen year, and the two platforms' only copy of it.
     *
     * The web drew a card here — `Your 2026`, the duration at s30, then *"across 50 episodes
     * and 3 titles"* — and the phone drew nothing at all. §6.170 photographed the state for
     * the first time and it showed the card repeating itself: those two counts are two of
     * the four tiles sitting sixty points below it, in figures, and the card's own headline
     * figure is a third.
     *
     * So the card is a headline and the tiles are the breakdown, and neither says the
     * other's part: the prose line goes, and the `Watched` tile goes while the card is up.
     * TV Time's REWIND is the thing this is — §6.138's note calls it among its most-loved
     * features — and a review that opens by restating its own contents is not one.
     */
    yourYear: (year: number) => `Your ${year}`,
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
    /** The horizon, said out loud. `UPCOMING_DAYS` is the number and `copy.test.ts` pins them together. */
    horizon: 'Next two months',
    /**
     * The notification block's name, on the screen and on the row that reveals it.
     *
     * Written at three call sites — a `Section`, a `Choice`'s announced name and the phone's
     * copy of both — until §6.134 gave the panel a collapsed state and needed a fourth. Four
     * literals of the same sentence is how `COPY` exists in the first place (§6.98).
     */
    tellMeAbout: 'Tell me about',
    /**
     * Says how far ahead it looks, which the phone's version had dropped, and what to
     * do about the emptiness, which is the phone's half. `UPCOMING_DAYS` is what makes
     * "two months" true — the two are checked against each other in the copy guard.
     */
    empty:
      'Nothing airing in the next two months. Track a show that is still running and it will show up here.',
    /**
     * The same screen, when the reason for the emptiness is not the one above.
     *
     * An imported show has no air dates until it has been matched to the provider — an
     * export carries names and watch dates and nothing else. So a person who has just
     * brought in a decade of television, and whose matching has not run or is waiting on
     * an ambiguous title, is told to "track a show that is still running" while tracking
     * eleven of them. §6.56's rule, one screen further on: an empty state is a claim
     * about somebody's own data, and this one was making the wrong claim.
     */
    emptyUnmatched: (n: number) =>
      n === 1
        ? 'One imported show still needs matching before its air dates arrive. Nothing else is airing in the next two months.'
        : `${n} imported shows still need matching before their air dates arrive. Nothing else is airing in the next two months.`,
    /** The way out of that empty state, on both platforms since §6.50. */
    findSomething: 'Find something to watch',
    /**
     * The three days a person does not want spelled as a date.
     *
     * The web said "Today"; the phone printed `2026-08-26` and left you to work it out.
     * All three go through `formatDay` in `core/src/time.ts` now. §6.66.
     *
     * "Yesterday" arrived last, with the title page's episode history — this group is
     * named for the calendar and the calendar only ever looks forward, so the one past
     * day English has a word for had never been needed. It lives here rather than in
     * `title` because it is the same kind of thing as the two above it and comes out of
     * the same formatter; the section name is where it was first wanted, not a claim
     * about who may read it.
     */
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
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
    /**
     * The label names what the number counts, because the chips cannot.
     *
     * It read `Density`, and `23-watching-live.png` shows the result: *Density  8  24  60*
     * — a property, then three bare numbers, with nothing on the screen saying eight of
     * what. The sentence that says it is `densityChoice` above, and that is the option's
     * *hint*: announced to a screen reader and drawn nowhere.
     *
     * §6.55 already found and fixed the wrong unit here — the hint used to say "a minute"
     * when the code counts a four-second window — so this control has now been wrong about
     * its unit twice, once by saying the wrong one and once by drawing none.
     *
     * `Most on screen` and not `Reactions on screen`: the number is a **cap**, and a label
     * that reads as an exact count is the near-true kind this build keeps rejecting. Three
     * words, because it sits in a control row beside *Pause*, *Hold* and two seeks.
     */
    densityLabel: 'Most on screen',
    /**
     * What the empty reaction band says while nothing is crossing it.
     *
     * §6.61 looked at the screenshots and found the top of Watching Mode — the part the
     * whole product is built around — was an unmarked black gap until somebody else's
     * reaction happened to arrive. A space that is the feature should say so.
     */
    /**
     * The instruction the whole feature rests on, and the reason it is a *tap* rather
     * than a form: the clock starts from the press, and can be corrected afterwards.
     */
    startHint: 'Tap the moment you press play. You can nudge the timing at any point.',
    /** What the band above the pad is, for somebody who cannot see it moving. */
    reactionsHeading: 'Reactions from other viewers',
    streamResting: 'Other people’s reactions appear here as you reach their moments',

    /*
     * What listening says. Five sentences that were typed on each platform separately —
     * `app/src/watching/ListenSync.tsx` and `mobile/src/fingerprint/listen.ts` — and two
     * of them had already drifted apart before anybody looked.
     *
     * `docs/design/seams.md` is why they are here rather than in `waiting` above. Every
     * one of these is the product describing a **seam**: the join between a microphone in
     * a room and a timeline somebody else contributed. Chalmers & Galani's rule is that a
     * seam is revealed *selectively*, and the CHI 2019 test is whether the person can act
     * on the revelation — so each of these either names an action or says plainly that
     * there is not one. They are the hardest sentences in the product to word, and they
     * were the ones with no owner.
     */

    /**
     * The reference store could not be reached. Distinct from there being no reference,
     * because the wrong one of these sends somebody off to spend a whole episode recording
     * a timeline that may already exist — §6.57's rule in the flagship.
     *
     * Both platforms already typed this one identically, which is the case the copy layer
     * exists for and the case that looks safest right up until it isn't.
     */
    listenLookupFailed: (why: string) =>
      `Could not check for a timeline (${why}). Sync by hand for now.`,
    /**
     * No reference exists yet. The two platforms said different things: the web named the
     * action and the phone named the reward — *"Sync by hand and you can contribute one"*
     * against *"you could be the first"*. §6.51's rule is that the better version wins, and
     * here neither was: one sentence has both halves, because what to do now and why it is
     * worth doing are two different questions and a person standing in front of an
     * unmapped episode has both.
     */
    listenUnmapped: 'Nobody has mapped this episode yet. Sync by hand, and you could be the first.',
    /** Listening ran and matched nothing. Names the two things that actually help. */
    listenNoMatch: 'Could not place that. Try again somewhere quieter, or sync by hand.',
    /** The microphone is open and has heard nothing it recognises yet. Not a failure. */
    listenNothingYet: 'Listening — nothing recognised yet',
    /**
     * How sure the match is, and the honest state of it.
     *
     * Two events, so two sentences: `listenPlaced` is the one-shot sync and
     * `listenFollowing` is continuous listening correcting drift. One **noun** across
     * both, which is the fix — the web said "confident" and the phone said "sure" for the
     * same quantity out of the same function.
     *
     * **The percentage is known to be the wrong shape and is kept deliberately.**
     * `seams.md` §7: Chalmers' own prescription is a sensed position shown as an *extent*
     * rather than a point, and an extent would pass the agency test where a percentage
     * does not — nobody does anything different at 73% than at 62%, but "within about two
     * seconds" tells you whether to nudge.
     *
     * It is not derivable here. `confidence` is the share of matched landmarks agreeing on
     * one offset, and `core/src/fingerprint/agreement.ts` records the same audio measuring
     * 0.46 one way and 0.17 the other purely from which microphone was worse — a number
     * that halves while the position is identical is not describing the position. The only
     * positional bound available is the frame, `HOP_SIZE / SAMPLE_RATE` = 23.22ms, far
     * below anything a person can perceive. The `toleranceMs` of 5,000 in that file is a
     * trap: it bounds two *contributors'* reaction times, not this match.
     *
     * So the percentage stays until somebody runs the calibration — matches at known
     * offsets, across confidences, positional error recorded. A plausible-looking "± 2s"
     * derived from an uncalibrated number would be a fabricated seam, which is worse than
     * an honest one of the wrong shape.
     */
    listenPlaced: (percent: number) => `Synced, ${percent}% sure.`,
    listenFollowing: (percent: number) => `Following along, ${percent}% sure`,

    /*
     * The bridge, which is three states and only one of them has an action.
     *
     * These are the most carefully reasoned seam sentences in the product and until now
     * they were typed in `app/src/remote/RemoteDrawer.tsx` with no owner. `seams.md` §5.
     *
     * The phone has no second renderer for them — it talks to the television directly over
     * the Wi-Fi and needs no bridge at all — and that is exactly the condition under which
     * a sentence gets typed locally and drifts a year later, so they are here now rather
     * than when a second reader appears.
     *
     * The split between the last two is the whole point and §6.171 is the entry: a relay
     * that closes with **1008** has *declined* the connection and will decline the next one
     * for the same reason. "It will reconnect on its own" was said for that, every five
     * seconds — a promise the app cannot keep. One of these two states has something a
     * person can do about it and the other does not, and they say so differently.
     */
    bridgeConnecting: 'Connecting to your bridge…',
    bridgeRefused:
      'The relay would not accept this connection. Check the address and token in your ' +
      'settings, then reload.',
    bridgeOffline: 'Bridge offline. It will reconnect on its own.',
    /**
     * The tenth seam, and the one nothing said anything about at all.
     *
     * On a web build without the two `VITE_` variables, `RemoteDrawer` returns `null`: no
     * handle, no edge tab, no sentence. The capability is simply not there, and §6.167
     * decided to *keep* that edge tab on the argument that it is the web's only route to
     * the remote — a decision about a control nobody on such a build can see.
     *
     * Hiding the **controls** is right. A build-time variable is not something a person
     * can act on, and a dead remote panel is worse than none. But what that conceals is not
     * "this connection is down"; it is *"this product has a remote"*, and those are
     * different seams stacked at the same place. `seams.md` §10.
     *
     * **This is the weakest of the three repairs that document filed, and the reason is
     * worth keeping.** For the person who runs this repository the bridge is entirely
     * actionable — a documented process they can start. For a stranger on a deployed URL it
     * is not, and neither is the phone app, which is not on any store. So this sentence
     * cannot end in an instruction without over-promising. What it can honestly do is what
     * `localFirst` two lines up does: answer the question before it is asked, and say where
     * the thing lives rather than pretend it is one press away.
     *
     * Shown only when the bridge is unconfigured — the seam is visible exactly where it
     * exists and nowhere else, which is Weiser's "literally visible, effectively invisible"
     * read as narrowly as it will go.
     */
    bridgeAbsent:
      'This build has no remote. The phone app drives a television over your Wi-Fi ' +
      'directly; the web needs a small bridge running on a machine of your own.',
  },

  title: {
    /** The season list before it has one. */
    loadingEpisodes: 'Loading episodes…',
    /** An episode that has not aired, tagged on the row rather than said in a sentence. */
    notYet: 'Not yet',
    /** An air date the provider does not have. Not "unknown": it has not been announced. */
    tba: 'TBA',
    /**
     * The date on an episode row that has not happened yet.
     *
     * One verb, typed identically into both title screens — `` `Airs ${episode.airDate}` ``
     * on each — which is §6.98's shape in a template literal, where the duplication sweep in
     * `copy.test.ts` cannot see it: `typedLiterals` reads quoted strings and JSX text, and a
     * backtick is neither. Two copies that no guard could report.
     *
     * `when` comes from `formatDay`, like every other date this app shows, so this reads
     * *"Airs Tomorrow"* and *"Airs Sun, Sep 6"* rather than *"Airs 2026-09-06"* — which is
     * what both screens printed on every episode row of every show, while the calendar
     * two tabs away said "Sun, Sep 6" for the same episode.
     *
     * The word stays a verb: the row already carries a *Not yet* tag, so the date does not
     * have to say "not yet" again — it says *when*.
     */
    airs: (when: string) => `Airs ${when}`,
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
    /** The section's own name, which both platforms drew and neither owned. */
    heading: 'Where to watch',
    /**
     * The country picker's own name, which is what a radiogroup needs and neither had.
     *
     * The web spelled `aria-label="Country"` by hand and the phone declared no group at
     * all — twenty-four radios loose in a `View`, so a screen reader met "US, radio" with
     * nothing saying what the question was. One name in `copy.ts` for the same reason
     * `COPY.stats.period` is one: a group whose name is written twice is a group whose
     * name drifts, and `choice.test.ts` already holds Stats to exactly that.
     */
    country: 'Country',
    /** The three ways a provider offers something, which is the row's own vocabulary. */
    stream: 'Stream',
    rent: 'Rent',
    buy: 'Buy',
    /**
     * Not the same sentence as "nowhere to watch it", which is what this used to say
     * when the request failed — a statement about the world made from a network error.
     */
    failed: 'Could not check where this is streaming just now.',
    /**
     * The third thing this section can be, and the one it could not say.
     *
     * An imported title has no provider ID until matching gives it one, so there is
     * nothing to look availability up *by* — and the fixture provider answered anyway,
     * which is how the title page of an unidentified show came to name a streaming
     * service in somebody's country and credit JustWatch for it. Not "nowhere to watch",
     * not "could not check": nothing was ever asked, and this says so.
     */
    unmatched: 'Match this show to a real one and we can say where it is streaming.',
  },

  /**
   * Content warnings, the one section where being told the wrong thing has a cost.
   *
   * Both platforms wrote these three sentences out by hand — identically, and with a
   * comment on each side saying *"Not the same sentence — see the web's copy of this"*,
   * which is a pair of files agreeing to keep two copies in step by hand. §6.175.
   */
  warnings: {
    /** The control's name when the section is shut; `controls.hideWarnings` when it is open. */
    heading: 'Content warnings',
    /**
     * §6.57 on the screen where it matters most: somebody avoiding a trigger would read
     * "nobody has flagged anything" as a fact about the title rather than as a request
     * that never arrived.
     */
    failed:
      'Could not read the warnings for this title. Nothing here means nothing is known, ' +
      'not that there is nothing.',
    empty: 'Nobody has flagged anything yet. If you have seen it, you can below.',
    /** What the list is worth, and the promise that it hides nothing. */
    provenance:
      'Community-reported, so treat it as a heads-up rather than a guarantee. Nothing ' +
      'here hides anything.',
  },

  /**
   * The screens, by the name a person sees on the way to them.
   *
   * Eight words that were typed into a masthead on one platform and a masthead on the
   * other, while the *same eight words* sat in `TAB_BAR` and `MORE_INDEX` naming the
   * controls that lead there. Not eight duplications — sixteen, counting the tables.
   *
   * They are keys here rather than reads of those tables because they are two decisions
   * that happen to agree: what the control is called, and what the page is titled. The
   * agreement is the thing worth holding, so `copy.test.ts` asserts it rather than
   * arranging for it — the shape §6.176 gave `upNext.name`, which folded in here with the rest.
   */
  screens: {
    upNext: 'Up Next',
    discover: 'Discover',
    watchlist: 'Watchlist',
    more: 'More',
    upcoming: 'Upcoming',
    lists: 'Lists',
    people: 'People',
    stats: 'Stats',
    /**
     * The feature, named the same in the two places that name it: the settings section that
     * configures it, and the title a session falls back to before it knows what is on.
     * Renaming one without the other is the drift this group exists to stop.
     */
    watching: 'Watching',
  },

  /**
   * What a title *is*, which the product says on four screens and had typed on six.
   *
   * `kind` is a field on every title and these are its two faces. The row's meta line, the
   * search result, the list entry and the suggestion all draw from here now.
   */
  kinds: {
    show: 'Series',
    film: 'Film',
  },

  /**
   * The six ways this product says it is working on something.
   *
   * `Loading…` alone was typed into eleven files on the web and five on the phone — one
   * decision, sixteen copies, and the ellipsis convention with it. The other five name what
   * is being waited for, which is why they are five keys and not one.
   */
  waiting: {
    loading: 'Loading…',
    syncing: 'Syncing…',
    searching: 'Searching…',
    checking: 'Checking…',
    restoring: 'Restoring…',
    /** The microphone is open. Watching Mode's, and the only one that costs battery. */
    listening: 'Listening…',
    uploading: 'Uploading…',
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
    /**
     * The other sealed state, and the one that had no owner at all.
     *
     * `sealed` above is *watched, not yet synced*; this is *not watched*, which replaces
     * the screen rather than emptying it. Both platforms typed this heading and this
     * sentence for themselves, identically, for as long as the screen has existed —
     * §6.175's measurement, and the reason `19-comments-sealed` was registered against a
     * sentence it does not show.
     */
    unwatchedHeading: 'Hidden until you watch it',
    unwatched:
      'Comments on this episode stay sealed until you have seen it. Nothing here can spoil ' +
      'you, because the server will not send them.',
    /** The gate before the gate: no account, so no conversation to be sealed from. */
    needsAccount: 'Comments need an account. Sync is not configured on this build.',
    /**
     * Not an absence: the effort dial is a control, and this is what it did. §6.57's
     * distinction one more time — "nothing was said" and "you filtered it out" are
     * different claims about somebody's own screen.
     */
    allFiltered: 'Everything is filtered out at this level.',
    /** A comment that did not post, rather than a button that did nothing. */
    postFailed: 'Could not post that',
    /** The effort dial's name — what it filters by, rather than what it is called. */
    effortLabel: 'How much effort a comment has to show',
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
     * A search that came back empty, which is not a search that failed. Both platforms
     * carried this sentence *and* a comment on each side explaining the distinction —
     * one of them beginning "See the web's copy". §6.175.
     */
    noMatch: 'Nobody by that name.',
    /** The search section's own heading. */
    findHeading: 'Find people',
    /**
     * The four sections of the screen, and the four controls that move somebody between
     * them. The controls are two **pairs** — the §6.176 lesson from `Publish` beside
     * `Make private`: a control's two states are one decision, and a platform that renames
     * half of it is drift the near-match comparison scores at zero and cannot see.
     */
    following: 'Following',
    followers: 'Followers',
    blocked: 'Blocked',
    you: 'You',
    handleHeading: 'Handle',
    follow: 'Follow',
    unfollow: 'Unfollow',
    block: 'Block',
    unblock: 'Unblock',
    /**
     * The lists themselves, when the asking failed.
     *
     * They said "Nobody yet" — your own social graph, reported as empty because a
     * request came back with an error. The code that returned the empty list said so in
     * a comment, and the swallowed-failure guard carried a written excuse for it, and it
     * stayed that way until somebody read the excuse back. §6.59.
     */
    listFailed: 'Could not load these just now. Nothing has changed — try again.',
    /**
     * The two empty social graphs, which were four literals until §6.162.
     *
     * `<PersonList empty="Nobody yet. Search above to find someone." />` was typed into
     * `app/src/screens/People.tsx` and again into `mobile/app/people.tsx`, and `empty="Nobody
     * yet."` twice more beside it. §6.98 gave the words one owner and `copy.test.ts` compares
     * what the two platforms say — which is why these never showed up: the four literals
     * agreed, by hand, for as long as nobody edited one of them. Found by enumerating the
     * empty states rather than by the guard, which is the point of enumerating them.
     *
     * Two sentences rather than one because they are two claims. Following is empty and there
     * is something you can do about it; followers is empty and there is not.
     */
    followingEmpty: 'Nobody yet. Search above to find someone.',
    followersEmpty: 'Nobody yet.',
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
    /**
     * The one setting that is a habit rather than a preference, and why it is offered
     * off: anyone working through several episodes wants to stay put.
     */
    openCommentsHint: 'How TV Time worked. Needs an account.',
    /**
     * What clearing the cache does and, more importantly, what it does not do. Somebody
     * pressing a button called *Clear* on a screen holding ten years of history needs
     * that answered before they press it, not after.
     */
    cacheBlurb:
      'Artwork and episode listings are cached from the metadata provider and expire ' +
      'automatically. Clearing them never touches your own history, and shows carried ' +
      'over from an import keep their names.',
    /** What the press did — nothing, or a number. A function, for `catchUp.marked`'s reason. */
    cacheEmpty: 'Nothing cached to clear.',
    cacheCleared: (many: number) =>
      many === 1 ? 'Cleared 1 cached record.' : `Cleared ${many} cached records.`,
    cacheHeading: 'Metadata cache',
    /** The switch's own name; `openCommentsHint` under it is why it is offered off. */
    openComments: 'Open the conversation after marking watched',
  },
  catchUp: {
    /**
     * The sheet's way out, named the same on both platforms.
     *
     * The web announced *"Cancel catching up"* / *"Done catching up"*; the phone's header
     * button carried no name at all, so a reader got the printed word — *"Done"* — in a
     * sheet where that is every dialog's word. Doc 6 §5: every name carries what tells it
     * from its neighbours.
     *
     * Found by extending `copy.test.ts` past the screens to the **components**, which is
     * where it had never looked: `PAIRS` maps `app/src/screens` to `mobile/app`, and both
     * platforms have twenty-three same-named files under `ui/` that nothing compared.
     * §6.147.
     */
    cancel: 'Cancel catching up',
    done: 'Done catching up',
    /**
     * The sheet's own four sentences, which both platforms typed for themselves until
     * §6.175 swept for literals appearing verbatim on both sides.
     *
     * `nothingToMark` is deliberately not "up to date": it reports what the *press* did,
     * which is nothing, rather than describing the show. The plural is a function for the
     * same reason `sync.retrying` is — a screen that builds its own plural is a screen
     * that can build it differently from the other one, and these two did build it
     * separately, character for character, on both platforms.
     */
    nothingToMark: 'Already up to date — nothing to mark.',
    marked: (many: number) =>
      many === 1 ? 'Marked 1 episode as watched.' : `Marked ${many} episodes as watched.`,
    /** Not "nothing to catch up on" — the show has not started. §6.57's distinction. */
    nothingAired: 'No episodes have aired yet.',
    /** Why a grid of numbers is safe to read: it is the whole point of the sheet. */
    pickSeason: 'Pick a different season',
    spoilerFree:
      'How far have you got? Nothing here shows episode names, so you cannot be spoiled ' +
      'by catching up.',
  },
  import: {
    /**
     * What we can read, and the one caveat — owned here because the two platforms had
     * written them separately and had already drifted.
     *
     * The web promised "anything we cannot read is listed rather than silently dropped"
     * and the phone did not, on a screen where **both** list every file and its outcome.
     * A promise true of both platforms, made by one. §6.98's finding again, on the screen
     * a migrant meets first.
     *
     * The filenames lose the web's `<code>` in the move, which is the trade `COPY` exists
     * to make: a shared sentence that reads plainly on both beats a marked-up one that
     * only one platform has and that nothing holds the other to.
     */
    formats:
      'A TV Time GDPR zip, a Reviewies export, a CSV from the rescue tool, Trakt, Simkl or Letterboxd — or a recovered DioCache.db straight off your phone. Files are recognised by what is in them, not what they are called, and anything we cannot read is listed rather than silently dropped.',
    /**
     * The -wal, which is the difference between a complete history and one quietly
     * missing its most recent months, so it has to be asked for by name.
     *
     * A **footnote**, not a note. §6.138 filed it as a caveat above the fold; measured,
     * the first-run screen scrolls zero and its content ends around 560 points of 844, so
     * it costs nothing anybody needs. What it was doing was standing at the same weight as
     * the paragraph above it while applying to one of the seven sources this screen names.
     * The warning stays — it cannot move to the picker, which imports on selection with no
     * step in between, and the importer's own warning arrives only after the slow run that
     * already lost the months. §6.147.
     */
    wal: 'If you have a DioCache.db, pick its DioCache.db-wal at the same time. TV Time wrote its most recent months there, and importing the database alone loses them without telling you.',
    /**
     * Why the matcher stops and asks, in the words the ask-flow's own safety argument
     * uses: the honest reason is not "we failed", it is that more than one answer looked
     * right and picking one would be a guess about somebody's history.
     *
     * §6.175 found both platforms typing this out — the phone with that argument in a
     * comment above it and the web with a different one, which is two files agreeing to
     * keep one sentence in step by hand.
     */
    /** The matcher's own heading, and its two failures. §6.57 keeps them apart. */
    heading: 'Match imported shows',
    providerFailed: 'Could not reach the metadata provider',
    fileFailed: 'Could not read that file',
    /** A candidate whose first-air date the provider does not carry. */
    yearUnknown: 'Year unknown',
    ambiguous:
      'More than one show could be this. Picking the wrong one would move your history ' +
      'onto it.',
    /**
     * The third state, and the one that was missing.
     *
     * An ask with no candidates is not an ambiguity — it is a miss. Saying "more than one
     * show could be this" above an empty list tells somebody the opposite of the truth and
     * then offers them nothing but giving up. The web separated the two; the phone kept
     * showing the ambiguous sentence to an empty list until a real import on a device put
     * it in front of somebody. Doc 10 §5, and 6.86.
     */
    notFound:
      'Nothing came back under that name — it may be listed differently, or be a show ' +
      'the provider has never had.',
  },
} as const;
