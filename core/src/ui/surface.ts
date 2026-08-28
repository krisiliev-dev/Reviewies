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
import { elevation } from '../tokens.ts';

/**
 * Where a control goes while it is held. One direction, for every control on both
 * platforms — the thing that had two answers.
 */
export const PRESS = elevation.sunken;

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
