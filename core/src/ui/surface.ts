/**
 * What each ground step means, and which way a press goes.
 *
 * There are three grounds — `groundWell`, `ground`, `groundRaised` — and `elevation` in
 * the token file has named them `sunken / base / raised` since it was written. **No
 * renderer has ever read it.** `flat.test.ts` reads it to assert that no shadow props
 * exist, which is a different question, and `coreWiring.test.ts` records the export as
 * reached only by that test. Third token in this build to have a name, a meaning and no
 * consumers, after `ratio.poster` (§6.118) and heading depth (§6.120).
 *
 * ## The app has two press conventions and did not know it
 *
 * Measured by pressing, in `design/capture.mjs`, because a style that exists only while
 * the pointer is down is in no stylesheet a source clause can read:
 *
 * - `Key` and Watching Mode's pad **sink** to `groundWell`;
 * - `Row`, `Choice` and `Button` **rise** to `groundRaised`.
 *
 * Four controls say a press rises and two say it sinks, in one product. Nothing had ever
 * compared them, because each is defensible alone and no screen shows both.
 *
 * ## And the rise is the one that breaks
 *
 * `groundRaised` is also the **card fill**. `lists.tsx`, `people.tsx`, `account.tsx` and
 * `comments/[targetId].tsx` all wrap rows in it, and the web does the same on five
 * screens. A row inside a card presses to the colour it is already painted, so **nothing
 * happens** — no feedback at all on the highest-frequency gesture in the product.
 *
 * That is not an inference. Wrapping Up Next's rows in the fill the other four screens use
 * and re-running the harness prints `-> rgb(28, 25, 30) on rgb(28, 25, 30)`. It is not
 * photographable on today's routes only because every card containing pressable rows is
 * behind an account, which is luck rather than design.
 *
 * ## So a press sinks, and the reason is arithmetic rather than taste
 *
 * Measured against both grounds, in dark:
 *
 * | press | on `ground` | on `groundRaised` |
 * | --- | --- | --- |
 * | rise to `groundRaised` | 1.080 | **1.000 — invisible** |
 * | sink to `groundWell` | 1.046 | 1.129 |
 *
 * The rise is *slightly* stronger on the page — 1.080 against 1.046 — and that is a real
 * cost, stated rather than hidden. It is paid because the sink is the only one of the two
 * that is never zero, and because a press that vanishes on four screens is a worse failure
 * than a press that is a little quieter on the rest. Both are faint; on the phone the
 * haptic carries the confirmation and this is the corroboration.
 */
import { border, elevation } from '../tokens.ts';

/**
 * Where a control goes while it is held. One direction, for every control on both
 * platforms — the thing that had two answers.
 *
 * It had three for two more days. §6.122 changed `app/src/ui/Button.tsx` and never opened
 * `core/src/ui/button.ts`, which went on saying `PRESSED = { fill: 'groundRaised' }` — so
 * the phone's `Button`, one of the four this header names as rising, kept rising, and
 * §6.184 measured it pressing to `rgb(28, 25, 30)` on a card painted `rgb(28, 25, 30)`.
 * The same reading this header prints, on the control it names, after the fix.
 *
 * The lesson is where the fix went rather than that one was missed: a renderer was edited
 * to satisfy a decision whose home is a table, and the table is the only thing the other
 * platform reads. Both `PRESSED` and this constant say so at their own definitions now.
 */
export const PRESS = elevation.sunken;

/**
 * And where a control goes when its rest state is not a ground.
 *
 * `PRESS` steps the ground, which is the right answer for every control that *sits* on one
 * — a row, a choice, a key, a pad cell, a secondary button. A `primary` button does not sit
 * on a ground; it is a plate, `actionFill`, with `actionLabel` printed on it. Stepping the
 * ground under a plate repaints the box and leaves the label alone, and §6.185 measured what
 * that costs: near-black `actionLabel` on near-black `groundWell` at **1.05:1**, in the
 * export, on `/data`'s "Export everything (JSON)". Not dimmer — gone.
 *
 * The rule is one sentence and it covers both cases: **a press steps the control's own
 * surface one step down.** For most controls that surface is the ground. For a filled one it
 * is the fill. Same direction, and the same magnitude — `actionFillPressed` is 1.065 from
 * `actionFill` where the ground steps are 1.046 and 1.080.
 *
 * This is not a second convention arriving by the back door, which is the thing §6.122 was
 * cleaning up when it wrote `PRESS`. It is the same convention, said in the one place it had
 * only ever been said for controls with no fill of their own.
 */
export const PRESS_FILL = 'actionFillPressed';

/**
 * What a raised fill is for, now that it is not also the press.
 *
 * A card is a **summary or a form** — one object the eye takes in whole. It is not a
 * container for a list: `docs/design/direction.md`'s fifth argument for LATE EDITION is
 * density as an information-design problem, and it names "rules instead of card fills"
 * first. A list of things gets rules, which is what `Row` already draws.
 */
export const SURFACE = {
  /** The page. Everything sits on this unless it has a reason not to. */
  page: elevation.base,
  /** A summary or a form: one object, taken in whole. Never a list of things. */
  card: elevation.raised,
  /** Held down, and the inside of a plate. */
  sunk: elevation.sunken,
} as const;

/**
 * Every place the sunken ground is painted and left there, and why.
 *
 * `SURFACE.sunk` two entries up says what the fill means — *held down, and the inside of
 * a plate* — and a press is self-limiting: it exists while a finger is on it. A **static**
 * sunken fill is the other half, and until §6.167 nobody had counted them.
 *
 * The one that started it: `15-title.png` draws the streaming service as a `groundWell`
 * plate **inside** the `groundRaised` *Where to watch* card. Two steps down from its own
 * container, on the only element in a hundred and thirty screenshots darker than the thing
 * it sits in, and it is not a control and not an input — it is the name of a service. It
 * read as a hole punched in the card. The names are ink on the card now, separated the way
 * every other fact in this build is separated, and the eleven that remain are here with
 * their reasons.
 *
 * The shape is `bareControl.test.ts`'s: a table with a sentence per entry, so the next one
 * has to be argued for rather than typed. Every one of these is a **well** — something
 * sits *in* it — which is what `SURFACE.sunk` says the fill is for. `sunkenFill.test.ts`
 * sweeps both platforms against it.
 *
 * ## The register found its own bad entry within a sprint, which is the point of writing one
 *
 * Two of the eleven were More's figure plates, excused here as *"a number set into the
 * page"*. §6.168 photographed `light-09-more.png` and sampled it: the plates are
 * `groundWell` inside a `SURFACE.card`, so they are not on the page at all — they are two
 * steps below their own container, which is the very defect the provider chip was fixed
 * for one screen earlier. Writing a reason down is what let the next reading check it
 * against a picture. They are figures on the card now, and the register is nine.
 */
export const SUNK_FILLS: Record<string, string> = {
  'app/src/ui/Poster.tsx': 'the well artwork sits in, and the ground behind a poster that has none',
  'mobile/src/ui/Poster.tsx': 'the well artwork sits in, and the ground behind a poster that has none',
  'mobile/app/comments/[targetId].tsx': 'the well an attached image sits in, before it has loaded',
  'mobile/src/ui/CatchUp.tsx': 'the sheet is a well over the screen it covers',
  'mobile/src/social/AddToList.tsx': 'the sheet is a well over the screen it covers',
  'mobile/src/watching/ListenSync.tsx': 'the level meter is a trough the bar moves in',
  'app/src/ui/Browse.tsx':
    'the well a browse box\u2019s artwork sits in, and the ground behind a box that has none \u2014 the same well `Poster` paints, at the one size measured by its column rather than by the table',
  'mobile/src/ui/Browse.tsx':
    'the well a browse box\u2019s artwork sits in, and the ground behind a box that has none \u2014 the same well `Poster` paints, at the one size measured by its column rather than by the table',
  'app/src/ui/MatchImports.tsx':
    'a filled action with nothing to do: the fill goes down rather than fading, which is `SURFACE_OFF` below',
};

/**
 * A control that is present and not yet pressable: the fill goes, a hairline rule
 * arrives, the ink steps to tertiary.
 *
 * Never an opacity. A faded fill gives a dark block with dark lettering on it — the
 * reason `appearance.test.ts` bans `disabled:opacity` on a filled action, found by
 * looking at one — and at twenty cells the web's `disabled:opacity-30` made Watching
 * Mode's whole pad read as a failed render rather than as a pad waiting for a clock.
 *
 * This was `KEY_DISABLED` in `ui/key.ts` and the name became wrong the moment a second
 * control needed it. It is not a property of keys; it is what "off" looks like on a
 * surface, which is this file's subject. `Button` spells the same three values in its
 * own tone table and stays there on purpose: `quiet` has no rule to lose, so the tones
 * genuinely differ and one constant would not fit them.
 */
export const SURFACE_OFF = {
  rule: border.hairline,
  colour: 'strokeHairline',
  ink: 'inkTertiary',
} as const;
