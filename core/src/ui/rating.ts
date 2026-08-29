/**
 * What a rating looks like on a row you are reading down, before you give one.
 *
 * ## §6.129's rule, on the third and fourth screens it was written for
 *
 * `compose.ts` states it: *on a screen whose purpose is reading, composing is revealed,
 * not resident* — and its own header says the rule exists "so the third and fourth screens
 * do not each decide it again". It has been applied to the comments composer (§6.129) and
 * the calendar's notification panel (§6.134), and nowhere else in four sprints.
 *
 * The title page is the case it was waiting for. A season's episode list is something you
 * read down; rating an episode is composing. And the numbers are worse there than anywhere
 * the rule has been applied so far:
 *
 * - `StarRating` is **240 points wide** — ten touch targets at the 24 WCAG 2.5.8 asks for —
 *   and its own doc says "its callers give it a line of its own rather than putting it
 *   beside something";
 * - the episode row puts it beside *React* and *Talk* in a row about 350 wide;
 * - it is drawn once per **watched** episode, so §6.141's first foot shot of `15-title`
 *   is **sixty empty star outlines** down one screen, all of them saying nothing.
 *
 * One of `StarRating`'s two call sites honours its rule and one does not: the title's own
 * rating gets a captioned block of its own. §6.133's question is whether that sentence is a
 * rule or an excuse that expired, and the measurement answers it — it is a rule, and the
 * episode row is where it was being broken.
 *
 * ## What stays
 *
 * An unwatched row offers no rating at all, so **the control's presence is itself a state
 * signal**, and that is worth keeping rather than tidying away. What changes is only what
 * the offer looks like before it is taken.
 */

/**
 * Does a row open on the five stars?
 *
 * `false`, and the same `false` as `COMPOSE_OPEN` for the same reason. A row shows what it
 * knows — a rating if there is one — and the way to change it, and the five appear when
 * asked for.
 */
export const RATING_OPEN = false;

/**
 * What a row shows in place of the stars.
 *
 * `given` is a rating you already have: one star and the number, which is the *information*
 * and reads down a season at a glance in a way ten outlines never did. `none` is the offer.
 *
 * Both are one control, and the same control — pressing either reveals the five. That is
 * why this is one function rather than two constants: a row with a rating and a row without
 * differ in what they say, not in what they do.
 */
export function ratingLabel(value: number | undefined): string {
  return value === undefined ? 'Rate' : value.toFixed(1);
}

/**
 * Whether the row is showing a rating or offering to take one, for the announced name.
 *
 * The name has to carry the episode — `row.ts`'s rule, since a season of these is the same
 * word down the page — so this returns the verb and the call site supplies the rest.
 */
export function ratingAction(value: number | undefined): 'Rate' | 'Change your rating of' {
  return value === undefined ? 'Rate' : 'Change your rating of';
}
