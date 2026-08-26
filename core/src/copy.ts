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
  },

  lists: {
    /** The phone's, which says why rather than reciting the build's configuration. */
    needsAccount: 'Lists need an account — they are meaningful mainly when they can be shared.',
    empty: 'No lists yet. Make one above, then add titles to it.',
    /** The web's: "Empty so far" does not say what the list is empty of. */
    listEmpty: 'Nothing on this list yet.',
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
     * Parameterised, because the destination genuinely has two names: the web keeps
     * accounts on the Data tab of Settings and the phone has an Account screen. The
     * sentence is shared; the noun is not.
     */
    signInToFollow: (where: string) =>
      `Sign in on the ${where} to follow people. Your history stays on this device either way.`,
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
