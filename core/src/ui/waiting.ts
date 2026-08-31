/**
 * How long a wait has to last before the screen says it is waiting.
 *
 * ## The measurement this exists because of
 *
 * `design/between.mjs` presses every control the accessibility tree offers and counts the
 * distinct states painted between the press and the settled screen. On the web build it
 * measured **9 of 24 interactions painting an intermediate state**, and ten of the eleven
 * states in them carried `COPY.waiting.loading`. The durations, in full, because the
 * argument is entirely in them:
 *
 * ```
 * 13ms  17ms  17ms  19ms  20ms  20ms  25ms  32ms  33ms  44ms
 * ```
 *
 * Thirteen milliseconds is under one frame at 60Hz. Forty-four is under three. Nothing in
 * that list is a message: the word appears and is gone inside a single fixation, so the
 * eye cannot have landed on it, and what the reader gets is not the word *Loading…* but a
 * flicker where a word briefly was.
 *
 * ## Why the answer is not to delete the branch
 *
 * Because the branch is doing a real job on the other end of the distribution.
 * `core/src/ui/emptyStates.ts` states the rule it serves — *"'I could not look' is not
 * 'there is nothing'"* — and a screen with no waiting state has only one way to draw both.
 * A watchlist that renders its empty sentence while the query is still in flight is making
 * a claim about somebody's own library that it has not checked. §6.104 is the same shape
 * one step further out: `WhereToWatch` answered *"Example Streaming"* for a title nothing
 * had identified, because a module with two outcomes had three cases.
 *
 * So the loading state stays. What changes is **when it is allowed to speak**.
 *
 * ## The number, and where it is not from
 *
 * **200ms, and it is not Google's 200.** The published "good" INP threshold is also 200 and
 * has nothing to do with this: `design/response.mjs`'s header refuses it at length as an
 * ecosystem-achievability figure calibrated against CrUX, and this file would refuse it on
 * the same ground. The coincidence of the digits is worth naming precisely so nobody later
 * reads one as evidence for the other.
 *
 * This 200 is the **fixation cycle**. Reading proceeds in saccades and fixations, and a
 * fixation in ordinary reading lasts on the order of 200–250ms (Rayner 1998, reviewing
 * three decades of eye-movement work). A word that is on the screen for less than one
 * fixation cannot have been fixated: the eye was somewhere else for the whole of its
 * appearance. That is the literal content of the finding above — *"a word that brief cannot
 * be read"* — turned into a threshold, and it is the same **kind** of number as the 100ms
 * `design/response.mjs` designs the press to: a property of the reader, not of the platform.
 *
 * What it is a bound on is the other way round from a display duration. The rule is not
 * *"show the word for at least 200ms"* — that would mean holding content back to make a
 * placeholder look deliberate, which buys nothing for the reader and costs them the answer.
 * The rule is *"do not start saying it until the wait has already outlasted a fixation"*: by
 * then there is a wait worth naming, and the word that names it is going to stand long
 * enough to be read.
 *
 * The residual case is honest and small: a query that lands at 205ms paints the word for
 * 5ms. That is the known cost of a threshold with no minimum display time, it is the right
 * side of the trade here, and it is written down rather than designed around.
 *
 * ## What this is not for
 *
 * Not for the press itself. `design/between.mjs` measures how long a control takes to look
 * pressed against a separate 100ms bound, and nothing here may delay that — the press is
 * feedback the person caused, this is a claim the app is making about its own state, and
 * they answer to different clocks.
 */

/**
 * The wait a screen has to have been in before it is allowed to say so, in milliseconds.
 *
 * Shared rather than typed per screen: the eleven web loading branches were eleven
 * independent decisions to render a word immediately, which is how a build ends up
 * flickering on nine interactions out of twenty-four with nobody having chosen it.
 */
export const SAY_WE_ARE_LOOKING = 200;
