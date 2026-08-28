/**
 * One emoji on Watching Mode's pad — the control this product is actually for.
 *
 * The pad is most of the flagship screen and it is the last surface `accentFill.test.ts`
 * named as having no component: *"the remainder are surfaces with no component yet:
 * Watching Mode's emoji pad, the remote's device list, `data.tsx`'s switch row. A
 * component has to exist before a guard can point at it."*
 *
 * Nothing had ever photographed it. Sprint 43 did (`22-watching-start`,
 * `23-watching-live`), and the photograph is what found the thing worth owning.
 *
 * ## The two platforms disagree about whether you can react before you press play
 *
 * The web disables every cell until the clock is going:
 * `disabled={!clock.running && clock.positionMs === 0 && !autoSynced}`, at 30% opacity.
 * The phone does not — `22-watching-start` shows twenty live-looking cells sitting above
 * a "Start watching" button that has not been pressed.
 *
 * The web is right, and not as a matter of taste. A reaction **is a timestamp**: it is
 * stored as `tMs`, replayed to other people at that moment, and cross-validated by
 * content at that offset. Tapping "Funny" before the clock starts records a real row at
 * `0` — a false datum that the phone then contributes to everyone else's stream. So the
 * rule is the component's, not a screen's:
 *
 * > **A pad cell is inert until there is a clock to attach a moment to.**
 *
 * ## And a disabled cell does not fade
 *
 * The web's `disabled:opacity-30` is the treatment `appearance.test.ts` bans on a filled
 * action and for the reason it gives: a faded control reads as broken rather than as
 * waiting. Twenty cells at 30% is a pad that looks like a failed render. Off here is
 * `SURFACE_OFF` — the fill goes, a hairline arrives, the ink steps to tertiary — which
 * is what `Key` has drawn since it was written, under a name that said "key" until this
 * component needed it too. The renderers import it from `ui/surface` directly rather than
 * through an alias here — a second name for one value is the drift, not the fix.
 */
import { radius, space, text } from '../tokens.ts';

/**
 * Four across, square.
 *
 * Both platforms already agreed on this and neither said why: it is the widest grid whose
 * cell still clears the 44pt comfortable-target floor on the narrowest phone this app
 * supports (320pt less a 12pt gutter each side and three 8pt gaps leaves 68pt), and the
 * count that keeps the twenty curated reactions on one screen without scrolling. The pad
 * is tapped in the dark; scrolling to reach "Popcorn" is the failure this avoids.
 */
export const PAD = {
  columns: 4,
  gap: space.s8,
  radius: radius.plate,
  /** The emoji itself. Big enough to read at arm's length in a dark room. */
  glyph: text.s30,
  /** Square: the height follows the width the grid gives it, and cannot disagree. */
  ratio: 1,
} as const;

/**
 * What a cell is announced as.
 *
 * The emoji is hidden from the reading order on both platforms, because read aloud it is
 * its Unicode name — "face with tears of joy" — followed by the label under it, which
 * announces one control twice under two names. The label alone is not it either: "Funny"
 * does not say it is something you do.
 */
export function padName(label: string): string {
  return `React with ${label.toLowerCase()}`;
}

/**
 * Whether the pad can be tapped, and why there is no sentence to go with it.
 *
 * The first version of this returned the reason as copy — *"Start watching first — a
 * reaction is a moment in the episode"* — for the screen to print above the grid, on
 * §6.104's rule that a thing which is off should say why rather than be quietly off.
 * `22-watching-start` is why it does not any more.
 *
 * The condition that holds the pad back is **the same condition** that shows the start
 * block, on both platforms. So the photograph had three sentences about starting stacked
 * on top of each other — "Tap the moment you press play", a filled "Start watching", and
 * then the reason — and the third pushed the last row of the pad under the search box,
 * costing the screen the one property it is built around: twenty reactions reachable
 * without scrolling, in the dark.
 *
 * §6.104's rule is satisfied, and by the right thing. The explanation is the start block,
 * it is forty points above the pad, and it comes first in the reading order — so a
 * screen-reader user meets "Tap the moment you press play" before the first dimmed cell.
 * A control does not have to carry its own reason when the screen has already given it.
 */
export function padLive(clockStarted: boolean): boolean {
  return clockStarted;
}
