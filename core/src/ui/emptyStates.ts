/**
 * Every screen this product can show with nothing on it, and whether anybody has looked.
 *
 * ## What this is for
 *
 * §6.161 spent a whole sprint arguing about two sentences — `stillImporting` and
 * `matchingImport` — and finished without noticing that **no photograph in this repository
 * shows either of them**. `design/screens/02-import-done.png` is the panel *after* the
 * import lands. Up Next has three empty states and the design record holds none.
 *
 * That is the other half of §6.157's hole. `reveals.ts` registers the states behind a
 * *control*, because the product deliberately made them and the design track kept losing
 * coverage each time it did. The states behind *data* are the ones nobody makes on purpose:
 * a screen is empty because the person is new, or has watched everything, or picked a period
 * with nothing in it. Every capture pass in `design/` imports a full library on its first
 * screen and never comes back, so the whole design record is of a populated app.
 *
 * ## Why it is a register and not a list of screenshots
 *
 * Because "no shot exists" and "no shot is possible" look identical in a directory listing,
 * and §6.146 is the rule that they must not. An empty state a harness cannot reach is a state
 * nobody has judged, and that has to be a written line with a reason beside it — not a gap.
 *
 * ## What counts
 *
 * A state where a screen's main content is **absent**, and the screen says something about
 * the absence. Three things are deliberately not here, each for its own reason:
 *
 *  - **Failures.** "I could not look" is not "there is nothing" — §6.57 separated them and
 *    `app/failures.mjs` photographs them by breaking the provider.
 *  - **Gates.** A screen replaced by "this needs an account" is not empty; it is elsewhere.
 *  - **Reveals.** Behind a control, and `reveals.ts` already owns them.
 *
 * `NOT_AN_EMPTY_STATE` names the ones that were considered and left out, so the sweep is a
 * decision rather than an omission.
 */

export interface EmptyState {
  /** The `COPY` path that owns the sentence, dotted from the root of `copy.ts`. */
  copy: string;
  /** The screens that render it — web first, then phone. */
  screens: readonly [string, string];
  /** What the person is being told, and therefore what the shot has to show. */
  says: string;
  /**
   * The shot a capture script must file, or `null`.
   *
   * `null` needs a `why`: an unphotographed state is a state nobody has judged, and §6.146
   * is that a harness which cannot produce a case has an opinion about the screen.
   */
  shot: string | null;
  /** Required when `shot` is null: what stands between the harness and this screen. */
  why?: string;
}

/**
 * The empty states, and where each one is photographed.
 *
 * Held by `app/src/ui/emptyStates.test.ts`: every `copy` path must exist, every named screen
 * must reference it, every non-null `shot` must be filed by a capture script, and every
 * empty-looking key in `copy.ts` must be here or in `NOT_AN_EMPTY_STATE`.
 */
/**
 * Why the two import states have no photograph, said once. §6.163.
 *
 * They were attempted separately and failed for one cause, so the cause is written once and
 * cited twice rather than drifting into two accounts of the same measurement.
 */
const reason =
  'Both this and its neighbour need a library that has landed and not yet been matched, and §6.163 measured that no such moment exists in this build: against `FixtureProvider` the import resolves every name as it reads it. Walking straight to the calendar — bypassing Up Next, the only screen `MatchImports` mounts on — still found a full calendar. The one way in is a provider that answers slowly, and that knob would live in `core/src/metadata/fixtures.ts`, which is what a build with no TMDB token actually uses. Product code added for a harness, so it is declined rather than deferred.';

export const EMPTY_STATES: readonly EmptyState[] = [
  {
    copy: 'upNext.stillImporting',
    screens: ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx'],
    says: 'the import is running and the shows will appear as they land — §6.127',
    shot: '02a-import-reading',
  },
  {
    copy: 'upNext.matchingImport',
    screens: ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx'],
    says: 'the import landed and matching is filling in what it could not carry',
    shot: null,
    why:
      'Attempted twice. Arriving at Up Next after the import, the screen already says "Matching… 0 of 0" over a full list. ' +
      reason,
  },
  {
    copy: 'upNext.caughtUpWaiting',
    screens: ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx'],
    says: 'caught up, and what is next — the state §6.164 found this screen had nothing to say to',
    shot: '00-caughtup-upnext',
  },
  {
    copy: 'upNext.allCaughtUp',
    screens: ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx'],
    says: 'nothing has aired that you have not seen, and nothing is coming either',
    shot: '00-caughtup-finished',
  },
  {
    copy: 'watchlist.empty',
    screens: ['app/src/screens/Watchlist.tsx', 'mobile/app/(tabs)/watchlist.tsx'],
    says: 'nothing saved yet, and where to save something from',
    shot: '00-watchlist-empty',
  },
  {
    copy: 'discover.empty',
    screens: ['app/src/screens/Discover.tsx', 'mobile/app/(tabs)/discover.tsx'],
    says: 'nothing to suggest until something is tracked',
    shot: '00-discover-empty',
  },
  {
    copy: 'calendar.empty',
    screens: ['app/src/screens/Calendar.tsx', 'mobile/app/calendar.tsx'],
    says: 'nothing airing in the next two months, and what to do about it',
    shot: '00-calendar-empty',
  },
  {
    copy: 'calendar.emptyUnmatched',
    screens: ['app/src/screens/Calendar.tsx', 'mobile/app/calendar.tsx'],
    says: 'nothing airing *because* imported shows still need matching — §6.56',
    shot: null,
    why:
      'Attempted by walking to the calendar without visiting Up Next, and the calendar was full. ' +
      reason,
  },
  {
    copy: 'stats.empty',
    screens: ['app/src/screens/Stats.tsx', 'mobile/app/stats.tsx'],
    says: 'nothing watched in this period, with the way out of it — §6.146',
    shot: '00-stats-empty',
  },
  {
    copy: 'lists.empty',
    screens: ['app/src/screens/Lists.tsx', 'mobile/app/lists.tsx'],
    says: 'no lists yet, and that one can be made above',
    shot: '00-lists-empty',
  },
  {
    copy: 'lists.listEmpty',
    screens: ['app/src/screens/Lists.tsx', 'mobile/app/lists.tsx'],
    says: 'this list has nothing on it — a claim about somebody’s own work, so §6.57 applies',
    shot: '00-list-empty',
  },
  {
    copy: 'comments.empty',
    screens: ['app/src/screens/EpisodeComments.tsx', 'mobile/app/comments/[targetId].tsx'],
    says: 'nobody has said anything about this episode yet — an invitation, not a status',
    shot: '00-comments-empty',
  },
  {
    copy: 'comments.sealed',
    screens: ['app/src/screens/EpisodeComments.tsx', 'mobile/app/comments/[targetId].tsx'],
    says: 'the conversation is sealed until your watch has synced — not empty, withheld',
    /**
     * Three sprints, three different answers, and this is the third.
     *
     * §6.175 found it registered against `19-comments-sealed` — a photograph of the *other*
     * sealed state, whose capture assertion reads `/Hidden until you watch it/`. Re-pointing
     * it meant reading the branch, and the branch could not be reached: `fetchComments`
     * returned `gated: comments.length === 0 && !hasWatched` while both screens render
     * `gated ? sealed : empty` only inside their `watched ?` branch. So it became
     * `shot: null` with "the product is what stands in the way" as the §6.146 reason.
     *
     * §6.177 removed that reason by giving the client the fact it was missing —
     * `watchPending`, whether *this episode's* watch is still in the outbox — and the
     * harness the ability to produce it, by holding the `watches` table's writes. So the
     * state is reachable, photographed, and the register says so.
     */
    shot: '00-comments-syncing',
  },
  {
    copy: 'comments.unwatched',
    screens: ['app/src/screens/EpisodeComments.tsx', 'mobile/app/comments/[targetId].tsx'],
    says: 'the conversation is withheld because you have not seen the episode — the spoiler gate',
    /**
     * The state `19-comments-sealed` has been a photograph of all along. It was registered
     * nowhere because both platforms typed its two sentences out by hand, so nothing that
     * sweeps `copy.ts` could find it. §6.175.
     */
    shot: '19-comments-sealed',
  },
  {
    copy: 'warnings.empty',
    screens: ['app/src/social/ContentWarnings.tsx', 'mobile/src/ui/ContentWarnings.tsx'],
    says: 'nobody has flagged this title yet — and the section says so rather than staying shut',
    /**
     * The reveal's own shot, which has been a photograph of this state all along: the
     * seeded set has no warnings in it, so pressing the control has always opened onto
     * *"Nobody has flagged anything yet."* §6.175 filed a second capture step for it and
     * the file came out byte-identical, which is how that was found.
     *
     * One photograph, two registers, two different claims about it — `reveals.ts` that
     * the section opens when pressed, this one that it says something when empty. The
     * same arrangement as `00-people-empty`, which answers for both social graphs.
     */
    shot: '15-title-warnings',
  },
  {
    copy: 'lists.emptyInPicker',
    screens: ['app/src/social/AddToList.tsx', 'mobile/src/social/AddToList.tsx'],
    says: 'you have no lists to add this to yet, and the box below makes one',
    shot: '00-addtolist-empty',
  },
  {
    copy: 'people.followingEmpty',
    screens: ['app/src/screens/People.tsx', 'mobile/app/people.tsx'],
    says: 'you follow nobody yet, and the search above is how that changes',
    /** One shot for both halves: they are drawn one above the other on the same screen. */
    shot: '00-people-empty',
  },
  {
    copy: 'people.followersEmpty',
    screens: ['app/src/screens/People.tsx', 'mobile/app/people.tsx'],
    says: 'nobody follows you — the one empty state with nothing to offer about it',
    shot: '00-people-empty',
  },
];

/**
 * Sentences that look like empty states and are not, and why.
 *
 * The §6.41 rule: an excuse that outlives its condition is the next thing to mislead
 * somebody, so `emptyStates.test.ts` fails when one of these stops existing.
 */
export const NOT_AN_EMPTY_STATE: Record<string, string> = {
  // Failures. §6.57's distinction: "I could not look" is not "there is nothing", and
  // `app/failures.mjs` photographs these by breaking the provider rather than by emptying it.
  'lists.changeFailed': 'A rename or a visibility change that did not go through.',
  'lists.createFailed': 'A list the server refused to create.',
  'lists.itemsFailed': "A list's titles, when the asking failed — the §6.57 sentence.",
  'people.followFailed': 'A follow or unfollow that did not happen.',
  'people.listFailed': 'The social graph, when the asking failed — the §6.59 sentence.',
  'title.loadFailed': 'The title page with no provider and nothing cached.',
  'whereToWatch.unmatched': 'No provider match, so nothing to look availability up by.',

  // Gates. The screen is not empty; it is somewhere else until an account exists.
  'people.withoutAccount': 'Names what still works without sync. A gate, not an absence.',
  'people.signInToFollow': 'The same gate with the destination in it.',
  'lists.needsAccount': 'Says lists need sync configured, in place of the lists.',
  'lists.signInToMake': 'The same gate with the destination in it.',

  // Not about absence at all.
  'discover.blurb': 'A description of what Discover excludes, drawn above a full screen too.',
  'watchlist.notePlaceholder': "The note field's placeholder, which is a prompt rather than a state.",
  'watching.streamResting': 'What the reaction band says while nothing is crossing it — a band, not a screen.',
  'settings.cacheEmpty':
    'The result of a press, not the state of a screen: "Nothing cached to clear" is what ' +
    'the button just did. Its sibling `cacheCleared` is a count, which is what makes the ' +
    'pair a report rather than an absence.',
  'comments.allFiltered':
    'Absence caused by a control the person moved. The effort dial has hidden them; the ' +
    'conversation is not empty, and saying it were would be the §6.57 mistake in reverse.',
  'people.noMatch':
    'A search that came back empty, which is about the query rather than about the screen ' +
    '— and it sits beside its own §6.57 sibling for a search that failed.',
  'catchUp.nothingToMark':
    'What the press did, which was nothing. The sheet is not empty: it has just told you ' +
    'that you were already up to date.',
  'catchUp.nothingAired':
    'The show has not started. `NOT_AN_EMPTY_STATE` rather than an entry because the sheet ' +
    'is a reveal and `reveals.ts` owns the shot of it.',
};
