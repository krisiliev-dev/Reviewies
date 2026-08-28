/**
 * The edge of the screen, which is the one measurement every screen makes and nothing owned.
 *
 * `docs/design/direction.md` chooses LATE EDITION, and the first property its comparison
 * names is **full-bleed rows on hairlines** — a printed artefact you mark up, where the rule
 * runs to the paper's edge and only the words are inset. `mobile/src/ui/Row.tsx` says the
 * same thing in a comment of its own: *"Full bleed and ruled, not a card."*
 *
 * It has never been true, and it could not have been. Every screen wraps its rows in its own
 * padding, so the rule stops short at both ends and the row reads as a card with three sides
 * missing. The design harness measures it now: **21 rules across seven screens, every one of
 * them 16..374 of 390.** The component's claim and its container disagreed, and no clause
 * reading `Row.tsx` could ever have seen it, because `Row.tsx` is correct.
 *
 * ## What the measurement found underneath
 *
 * The edge is a raw number, and the two platforms do not agree on it:
 *
 * - the phone writes the literal `16` in **fourteen** screen containers — uniform, but by
 *   coincidence rather than by decision, and `space.s16` sat unread beside it;
 * - the web writes Tailwind's **default** scale, off the token namespace entirely, at
 *   **three different values**: `p-6` (24px) on Up Next, Watchlist, Lists and Not Found,
 *   `p-4` (16px) on ten screens, `p-3` on Watching Mode.
 *
 * So Up Next — the screen this product opens on — has a 24px edge on the web and a 16pt edge
 * on the phone. Every other layer in this system got an owner sprints ago: space, radius,
 * type, colour, tracking, leading, heading depth. The measurement every single screen makes
 * had none, which is why it drifted in the one direction nobody photographs side by side.
 */
import { space } from '../tokens.ts';

/**
 * One edge, and the row's escape from it.
 *
 * `edge` is what a screen insets its content by. `bleed` is the negative of it, which is how
 * a row reaches the paper's edge while its words stay in the column: the row cancels the
 * container's padding on both sides and re-applies it to itself. That is the whole mechanism,
 * and it lives here rather than in each renderer so the two numbers cannot come apart — a
 * bleed that does not match the edge is a row that either falls short or overhangs, and
 * overhang is a horizontal scrollbar on the web and a clipped rule on the phone.
 */
export const SCREEN = {
  edge: space.s16,
  bleed: -space.s16,
} as const;

/**
 * Screens that do not take the standard edge, and why.
 *
 * Watching Mode only. It is the one immersive route — no tab bar, no masthead, the frame
 * given over to the stream — and `docs/design/direction.md`'s refusal 6 is about exactly this
 * kind of screen running out of width. It is not a page of rows and has none to bleed.
 *
 * Named here rather than left as a difference somebody notices later, and `screen.test.ts`
 * fails if the list outlives the screen it excuses — the §6.41 rule, applied before the
 * excuse has had time to go stale.
 */
export const EDGE_EXEMPT: Record<string, string> = {
  WatchingMode: 'Immersive: no tab bar, no masthead, and no rows to bleed to the edge.',
};
