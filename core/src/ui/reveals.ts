/**
 * Every place the product hides content behind a control, and the shot that proves somebody
 * has looked at it open.
 *
 * ## What this is for
 *
 * §6.157 found `18-lists-in.png` shows two **collapsed** list rows and the signed-in pass
 * has never opened one — so the row that shows a list's titles has never been photographed,
 * on either platform, in thirty-odd sprints of design review.
 *
 * That is a hole in the method rather than in one screen. Every capture script walks to a
 * *route* and shoots it as it arrives. A route's other states are reached only when somebody
 * happened to write the walk — §6.130's Watching Mode shots exist for exactly that reason —
 * and nothing anywhere says which states are missing. The register says.
 *
 * ## Why the reveals in particular
 *
 * Because the product deliberately created them. §6.129's rule — *on a screen whose purpose
 * is reading, composing is revealed, not resident* — has been applied five times now
 * (§6.129, §6.134, §6.141, §6.156, and the four that predate the rule), and **every
 * application moves content out of the arriving shot**. The design track's coverage got
 * worse each time the product got better, and nothing connected the two.
 *
 * ## What a reveal is
 *
 * A control that replaces content with itself, where what is behind it is worth looking at.
 * A *preference toggle* is not one — `Settings.openComments` is a checkbox whose two states
 * are both fully visible. The test is whether a screenshot of the closed state omits
 * something a design review would want to judge.
 */

export interface Reveal {
  /**
   * What the state is called in each screen's source, matching `screens` positionally.
   *
   * Two entries, not one, because the two platforms do not always agree on the name: the
   * lists disclosure is `openId` on the web and `open` on the phone, which is a drift this
   * register now records rather than hides.
   */
  states: readonly [string, string];
  /** The screens that have it — web first, then phone. */
  screens: readonly [string, string];
  /** What is behind it, and therefore what the shot is of. */
  shows: string;
  /** The shot name a capture script must file. */
  shot: string;
}

/**
 * The reveals, and where each one's open state is photographed.
 *
 * `shot` is checked against the capture scripts by `app/src/ui/reveals.test.ts`, so a reveal
 * added here without a shot fails, and a shot deleted from a capture script fails. Neither
 * can be quietly true.
 */
export const REVEALS: readonly Reveal[] = [
  {
    states: ['writing', 'writing'],
    screens: ['app/src/screens/EpisodeComments.tsx', 'mobile/app/comments/[targetId].tsx'],
    shows: 'the composer §6.129 moved off the arriving screen',
    shot: '21-comments-writing',
  },
  {
    states: ['tuning', 'tuning'],
    screens: ['app/src/screens/Calendar.tsx', 'mobile/app/calendar.tsx'],
    shows: 'the three notification options and the delivery block, §6.134',
    shot: '09-calendar-tuning',
  },
  {
    states: ['ratingOpen', 'ratingOpen'],
    screens: ['app/src/screens/TitleDetail.tsx', 'mobile/app/title/[id].tsx'],
    shows: "an episode row's five stars, §6.141",
    shot: '15-title-rating',
  },
  {
    states: ['openId', 'open'],
    screens: ['app/src/screens/Lists.tsx', 'mobile/app/lists.tsx'],
    shows: "a list's titles — the state §6.157 found nothing had ever photographed",
    shot: '18-lists-open',
  },
  {
    states: ['open', 'open'],
    screens: ['app/src/social/ContentWarnings.tsx', 'mobile/src/ui/ContentWarnings.tsx'],
    shows: 'what a show is warned for, and the vote that maintains it',
    shot: '15-title-warnings',
  },
  {
    states: ['open', 'open'],
    screens: ['app/src/social/AddToList.tsx', 'mobile/src/social/AddToList.tsx'],
    shows: 'which lists a title can join',
    shot: '15-title-addtolist',
  },
  {
    states: ['noting', 'noting'],
    screens: ['app/src/screens/Search.tsx', 'mobile/app/(tabs)/search.tsx'],
    shows: 'the "why you saved it" note, written at the moment of saving',
    shot: '04-search-noting',
  },
  {
    /** Found by the sweep, not by reading — see the clause's third case. */
    states: ['editing', 'editing'],
    screens: ['app/src/screens/Watchlist.tsx', 'mobile/app/(tabs)/watchlist.tsx'],
    shows: 'the same note, edited later, which is the half a migrant actually uses',
    shot: '06-watchlist-editing',
  },
  {
    /** Also found by the sweep. */
    states: ['picking', 'picking'],
    screens: ['app/src/ui/WhereToWatch.tsx', 'mobile/src/ui/WhereToWatch.tsx'],
    shows: 'the country list, which decides every streaming answer on the page',
    shot: '15-title-country',
  },
  {
    /**
     * Two states with two names, because the two platforms open this from different
     * places — and §6.167 is why.
     *
     * The web's drawer owns its own trigger: an edge tab, mounted app-wide in `App.tsx`,
     * and the web's only route to the remote. The phone's is mounted on Watching Mode
     * alone, and a floating tab over a screen that is a grid of twenty targets covered
     * two of them — `23-watching-live.png`. So on the phone the trigger is a named
     * `Remote` button in the control row and the state lives on the screen.
     */
    states: ['open', 'remoteOpen'],
    screens: ['app/src/remote/RemoteDrawer.tsx', 'mobile/app/watching/[targetId].tsx'],
    shows: 'the remote, which is the one reveal that was already photographed open',
    shot: '24-watching-remote',
  },
];

/**
 * Revealed states that are deliberately not in the register, and why.
 *
 * The §6.41 rule: an excuse outliving its condition is the next thing to mislead somebody,
 * so `reveals.test.ts` fails when one of these stops existing.
 */
export const NOT_A_REVEAL: Record<string, string> = {
  // Both states are already on screen: nothing is hidden behind a control.
  openComments: 'A preference checkbox on Settings; both its states are in the arriving shot.',
  chosen: "§6.156's open season — one expanded and the rest as rows, both in one shot.",
  focused: 'A field\'s focus ring, which is a state of a control rather than a container for content.',
  undoable: "CrossOff's six-second Undo, photographed by `capture.mjs`'s press-and-look step.",

  // In-flight: a control waiting on a write or a fetch. §6.80's "still working" is a
  // *third* state and the screens that have one are photographed showing it.
  busy: 'A control mid-write. What it hides is itself, and the wait is the point.',
  running: 'Matching, in flight. Up Next photographs it saying "Matching… n of m".',
  restoring: 'An import in flight, which §6.127 gave a visible state of its own.',
  uploading: 'An image being attached, in flight.',
  voting: 'A content-warning vote in flight.',
  searched: 'Whether a people search has been run yet, not a container for anything.',
  registered: 'Whether this device took push registration; the note beside it is always drawn.',
  ready: "The phone's boot gate, before the router mounts. `FULL_SCREEN` already names it.",

  // Failures. §6.104's rule is that these are said out loud, and `app/failures.mjs`
  // photographs them by breaking the provider rather than by opening a control.
  failed: 'A failure said out loud; `app/failures.mjs` is the pass that photographs it.',
  actionFailed: 'The same, on a follow or an unfollow that did not go through.',
  changeFailed: 'The same, on renaming a list or changing whether it is public.',
  createFailed: 'The same, on creating a list that the server then refuses.',
  listsFailed: "The same, on a profile's lists.",
  gated: 'Says the conversation needs an account. It replaces the screen rather than hiding in it.',
  unmatched: 'Says a title has no provider match, in place, instead of a streaming answer.',

  // Watching Mode's own machinery, photographed by §6.130's three walked shots.
  watched: 'Whether this episode is already watched, deciding what the composer offers.',
  autoSynced: 'Whether the stream has been synced once; a fact, not a panel.',
  dismissedDrift: 'Whether the drift warning was waved away; the warning itself is the shot.',
  streamHeld: 'Whether the phone is holding the stream, drawn on the control that does it.',
  streamPaused: 'The same on the web, drawn on the control that does it.',
};
