/**
 * What a reading screen opens on: what there is to read, or the panel for changing it.
 *
 * ## What the photograph showed
 *
 * `comments/[targetId]` is the last route the design track had never seen — it needs an
 * account *and* a watched episode, so no harness could reach it until sprint 42 walked
 * there. `20-comments-in.png` is what it found: an effort filter, a 350px empty text box,
 * "Attach a screenshot" and "Post", and only then, 880 pixels down a 844-pixel viewport,
 * the first word anybody wrote. You arrive at a conversation and the conversation is
 * below the fold.
 *
 * Both platforms do it, in the same order, which is the tell that it was never a decision:
 * `mobile/app/comments/[targetId].tsx` and `app/src/screens/EpisodeComments.tsx` were
 * ported from one another and neither ever asked what the screen is *for*.
 *
 * ## And the research says what it is for
 *
 * Doc 8, on why people stayed with TV Time: *"I could've used any other tracking app, but
 * I stayed with TVTime because I enjoyed reading the comments."* People ranked its
 * successors by how many comments an episode had. Reading is the draw; writing is what
 * some of those readers also do. A screen that spends its first screenful on an empty
 * form has the ratio backwards.
 *
 * ## The rule
 *
 * On a screen whose purpose is reading, **composing is revealed, not resident**. One
 * control where the form was; the form appears in its place when asked for, and folds
 * away again once the thing is posted.
 *
 * This is not a new invention here. `search.tsx`'s note editor already works exactly this
 * way (`noting`, and a `Button` that sets it), and so does the phone's quick-log. The rule
 * exists so the third and fourth screens do not each decide it again — which is how the
 * gap under a section label ended up with three values (`BLOCK`) and the screen edge with
 * five (`SCREEN`).
 */

/**
 * Does the composer stand open when the screen loads?
 *
 * No, and the value is here rather than as a `useState(false)` in two files so that a
 * screen which *should* open composed — one whose entire purpose is the writing — has to
 * say so against a stated default rather than by quietly passing `true`.
 */
export const COMPOSE_OPEN = false;

/**
 * The same rule, and the second screen it turned out to describe.
 *
 * The calendar is called **Upcoming** and opened on "Tell me about": three notification
 * options with a sub-line each, a paragraph about the iPhone Home Screen, and up to four
 * conditional notes — 470 points of a 900-point screen, above the thing you came for. On
 * both platforms. `dark-05-calendar.png` and `design/screens/09-calendar.png` are the
 * pair, and they are identical, which is what made it a decision rather than drift.
 *
 * §6.129 wrote the rule for a composer and nothing had applied it since; this is what it
 * looks like when the resident thing is a *setting* rather than a form. The collapsed
 * state is not a bare control either — it states the current choice, which is most of
 * what the open panel was there to tell you.
 */
export const SETTINGS_OPEN = false;

/**
 * The control that opens it, and the one that gives up on it.
 *
 * "Say something" rather than "Add a comment": the noun in "comment" is the artefact,
 * and what a person is doing is talking about an episode with people who have seen it.
 * `COPY` owns the words the product says; these two are the composer's own hinge, and
 * they live beside the rule that makes the hinge exist.
 */
export const COMPOSE = {
  open: 'Say something',
  cancel: 'Never mind',
} as const;

/**
 * There is no constant here for the words on either control that opens or closes a panel.
 *
 * A `SETTINGS.close` briefly lived here and was wrong: five surfaces say "Done" — two
 * content-warning panels, two catch-up sheets, and the calendar — and a catch-up sheet is
 * not a setting, so the name would have belonged to one of its callers. It is
 * `COPY.controls.done`. And the word that *opens* a settings panel is not a word at all:
 * the row states the current choice, which the screen is the only thing that knows.
 */
