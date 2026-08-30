/**
 * A surface's own halves, held in one table — the pass `tabIcon.ts` gave the tab bar, for
 * a control one level down.
 *
 * `docs/design/architecture.md` section 4. Up Next has two halves now: what is **out** and what is
 * **coming**. That is a `Choice`, and a `Choice` needs three things agreed between the two
 * platforms — the keys, the labels, and the order — which is exactly the list `TAB_BAR`
 * exists because the tab bar had written out twice and drifted on.
 *
 * ## The key is in the address, and that is not a second destination
 *
 * `?on=coming` on the web, the same parameter on expo-router. A segment whose state lives
 * only in a component is a segment a deep link cannot reach and the design harness can only
 * photograph by pressing — and §6.157's finding was that every state reached only by
 * pressing is a state the design record loses.
 *
 * It is worth being clear about what this is *not*, because the whole point of the move was
 * to have fewer destinations: the address carries the state of **one screen**, the way a
 * scroll position or an open panel would if either were addressable. The tab bar does not
 * move, the masthead does not change, `MORE_INDEX` no longer names it, and there is no
 * second route. `architecture.md`'s fifth refusal is the version of this that was rejected —
 * keeping Upcoming reachable both ways, which would have left the confusion alive for the
 * convenience of a bookmark.
 */
import { COPY } from '../copy.ts';

/** The query parameter both routers read. One spelling, so a deep link works on both. */
export const VIEW_PARAM = 'on';

export type UpNextView = 'now' | 'coming';

/**
 * The two halves, in order, as `Choice` wants them.
 *
 * `outNow` against `upcoming`, and the opposition is deliberate: *has it come out or not*
 * is the only axis these two differ on. The word somebody already knows — Upcoming — keeps
 * its meaning here while losing its address, which is the whole of the repair. A pair of
 * labels that did not obviously oppose each other would have re-created the finding
 * ("I am unsure what the difference is") inside one screen instead of between two.
 *
 * `now` is first and is the default, for `TAB_BAR`'s reason about Up Next being the initial
 * route: the most forcefully stated requirement in the research is that the app opens onto
 * the episodes you can mark, and a screen that opens on next month's schedule is not that.
 */
export const UP_NEXT_VIEWS = [
  { key: 'now', label: COPY.upNext.outNow },
  { key: 'coming', label: COPY.screens.upcoming },
] as const satisfies readonly { key: UpNextView; label: string }[];

/**
 * The view an address is asking for, with anything else reading as the default.
 *
 * A bad value is not an error state: `?on=banana` is a mistyped or stale link, and the
 * honest answer to one is the screen's front page rather than a message about a parameter.
 * `NotFound` is for an address that is not a screen; this is a screen.
 */
export function viewFrom(raw: string | null | undefined): UpNextView {
  return raw === 'coming' ? 'coming' : 'now';
}
