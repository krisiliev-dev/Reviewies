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
    screens: ['app/src/ui/Coming.tsx', 'mobile/src/ui/Coming.tsx'],
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
    /**
     * ## The reveal that left, and why the register is one shorter
     *
     * `noting` was here: the search row's note composer, on both platforms, photographed as
     * `04-search-noting`. It is gone because the control that opened it is announced
     * *"Add {name} to your watchlist"* and opening a field is not adding. Six controls carry
     * that name; four wrote the row on the press and these two did not, and the state they
     * opened instead hid Track, Seen it and Add to list with no Cancel offered.
     *
     * The register is the right place to record that, because the reveal rule cuts both
     * ways. §6.129 — *composing is revealed, not resident* — is about a screen whose purpose
     * is **reading**, and a search result row is not that screen: the row exists to be acted
     * on, its three controls are the point of it, and a reveal that replaces them is not
     * moving a composer out of the way but taking the row away. The note is still revealed,
     * on the watchlist row where §6.167 put it — `06-watchlist-editing` below is that shot,
     * and it is the same field.
     *
     * This entry's removal was not noticed by reading, either. `reveals.test.ts`'s first
     * clause failed the moment `noting` left the two screens, which is the register working:
     * a state cannot be deleted from the product and left standing here.
     */
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
     * The catch-up sheet, which two registers each believed the other was holding.
     *
     * `emptyStates.ts` excuses two of this sheet's sentences by name — `catchUp.nothingToMark`
     * and `catchUp.nothingAired` — and the reason it gives for both is *"`NOT_AN_EMPTY_STATE`
     * rather than an entry because the sheet is a reveal and `reveals.ts` owns the shot of
     * it."* It did not. There was no entry here, no capture script pressed the control, and
     * across the 158 shots the design record held when this was found there was **no
     * photograph of the sheet in any state**. One register pointed at another, the other had
     * never heard of it, and the gap read from either side as somebody else's coverage.
     *
     * It is not a minor state to have lost. *Catch up* is one of exactly two controls under
     * every row of Up Next — the screen `docs/design/direction.md` stakes the product on —
     * and the sheet behind it is where somebody who binged away from the app puts six
     * episodes back. `COPY.catchUp` holds seven sentences for it and none had ever been seen.
     *
     * ## Why the sweep did not catch it, which is the part worth keeping
     *
     * `reveals.test.ts`'s third clause is the half that is supposed to make this register
     * self-maintaining — *"a screen reveals something the register has never heard of"* — and
     * its needle is
     *
     *     const [name, setName] = useState<…>(false | SOMETHING_OPEN)
     *
     * an initialiser of `false` or a `*_OPEN` constant. This sheet's closed state is not
     * `false`; it is **absent**. `const [catchingUp, setCatchingUp] = useState<{ seriesId:
     * string; seriesName: string }>()` holds the series the sheet is *for*, so closed is
     * `undefined` and the needle has nothing to match. Every other reveal in this register
     * happens to be a boolean, which is why the clause has looked complete for as long as it
     * has existed.
     *
     * Broadening it was tried and measured rather than assumed, and the measurement is why
     * the needle is unchanged. Matching `useState()` with no argument at all finds **49**
     * names across the two apps, of which roughly forty-five are data — `error`, `items`,
     * `lists`, `summary`, `providers`, `results`, `session` — so `NOT_A_REVEAL` would grow by
     * forty-five excuses and become the thing practice 4 warns about, a rule people route
     * around. A tighter one — no initialiser, setter called from an `onPress`, state gating a
     * block — finds 8, of which none is a reveal and **`catchingUp` is not among them**: its
     * setter is handed down as the `onCatchUp` prop and pressed a component away, so the
     * press and the gate are never in one file.
     *
     * So the honest state of it: the sweep covers reveals whose closed state is a boolean,
     * and an object-shaped reveal has to be put here by hand. That sentence is in this header
     * rather than nowhere, because a clause that looks exhaustive and is not is how this one
     * was missed for as long as the sheet has existed.
     */
    states: ['catchingUp', 'catchingUp'],
    screens: ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx'],
    shows: 'the catch-up sheet — the season grid and the last episode you watched in it',
    shot: '03-upnext-catchup',
  },
  {
    /**
     * The browse box's other face, and the only reveal in the register whose *content* is
     * the reason it exists rather than a panel attached to it.
     *
     * `docs/design/architecture.md` section 5. The front of a box carries genre, year and title;
     * the synopsis and the two actions are on the back, because a shelf of twenty boxes each
     * carrying **Track** and **Watchlist** is forty controls with two names between them —
     * `row.ts`'s naming rule broken twenty times over. So the box is one control with two
     * faces, and the face a design review has to judge is the one behind the press.
     */
    states: ['over', 'over'],
    screens: ['app/src/ui/Browse.tsx', 'mobile/src/ui/Browse.tsx'],
    shows: 'the back of a browse box — the synopsis, what it is, and the two actions',
    shot: '05-discover-back',
  },
  {
    /**
     * The filter row, opened. `architecture.md` section 6.
     *
     * `compose.ts`'s rule, sixth application, and every previous application cost the design
     * track a shot — which is the whole reason this register exists. Registered the same hour
     * the panel was written rather than three sprints later.
     *
     * ## What the shot shows is two of the three, and `shows` said three
     *
     * `05-discover-filters.png` carries **KIND** and **STANDING**. There is no **GENRE**
     * group in it, and this entry claimed there was for as long as it has existed — the
     * register asserting a thing about a photograph nobody had put beside it, which is
     * §6.157's own defect at one remove: that sprint found a reveal registered and shot
     * closed; this is one registered and shot incomplete.
     *
     * The cause is in `Filters.tsx` and it is correct behaviour: the genre group draws only
     * `genres.length > 1`, because *"a single-option radiogroup is a control that cannot do
     * anything"*. The fixture shelf cannot clear that bar. It offers **one** box —
     * `05-discover.png` is the picture — carrying one genre, so the group is hidden on a full
     * fixture shelf and hidden again on the emptied one this reveal is actually taken over,
     * the walk having parked the last film so `00-discover-empty` has something to
     * photograph. Two independent reasons, either of them enough.
     *
     * So the state is not merely unphotographed, it is **unreachable by the pass that owns
     * the shot**, and §6.146's rule is that this must be a written line rather than a gap:
     * the shelf that has more than one genre on it is the *real* one, and the real passes do
     * not open reveals. `shows` now says what the picture has in it, and the sentence below
     * says what is missing and why, so nobody reads the two-group photograph as the whole
     * panel again.
     *
     * The genre group is the one worth reaching, which is what makes this worth writing down
     * rather than trimming: it is the only `Choice` in the product besides Stats' years that
     * takes `scroll`, and `core/src/ui/choice.ts` argues that decision at length —
     * *"long is not the same as data-shaped"* — against a control no photograph in the design
     * record shows. Reaching it means a filters reveal in `capture-real.mjs`, where the shelf
     * is TMDB's and carries a dozen genres; that is not done.
     */
    states: ['open', 'open'],
    screens: ['app/src/ui/Filters.tsx', 'mobile/src/ui/Filters.tsx'],
    shows:
      'the kind and standing groups Discover can be narrowed by — not genre, which needs ' +
      'more than one genre on the shelf and so cannot appear on the fixture pass at all',
    shot: '05-discover-filters',
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
