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

/**
 * Discover's other half-state: what you typed.
 *
 * `?q=` on both, and it is the same decision as `?on=` above rather than a second one — the
 * state of **one screen**, in its address, where a link and a reload and the design harness
 * can all reach it. Which is why it lives in this file: the point of `segments.ts` is that
 * the two platforms cannot spell a screen's own state two different ways, and a second file
 * inventing `?query=` would be the drift this one exists to prevent.
 *
 * ## The defect it closes, measured
 *
 * `docs/research/11-what-a-task-costs.md` §7.2. Both platforms held the query in `useState`;
 * the difference was the navigator. expo-router keeps the tab screen mounted under a pushed
 * title, so going back on the phone still shows your results; react-router unmounts it, so
 * the web comes back to the *shelf* with an empty field. `design/cost.mjs` walked the
 * looking-before-committing task on both and priced the difference at **four characters, one
 * extra press and one extra mental operation** — and the phone was only right by accident,
 * since neither platform survives a reload or a shared link.
 *
 * ## What a search in the address means for the rest of the web app
 *
 * Three things, and each is a decision rather than a consequence:
 *
 * 1. **The write is a `replace`, always.** A search field writes on every keystroke, and a
 *    pushed entry per keystroke would turn the browser's Back button into a backspace key —
 *    five presses to leave a screen you typed five letters on. `replace` means Back still
 *    means *the screen before Discover*, which is what it meant before this landed.
 * 2. **`/discover` and `/discover?q=` are one screen, not two.** `queryFrom` reads a missing
 *    key and an empty one identically, so a link either platform writes is read the same way
 *    by both. That is the property `?on=` is really after — the two platforms agreeing about
 *    what an address *means* — and it holds without requiring them to agree on whether an
 *    empty value is spelled out. The web drops the key when the field is cleared, because a
 *    bookmark of an empty search should be a bookmark of Discover.
 * 3. **A shared link runs somebody else's search.** That is the feature; it is also the whole
 *    of what it does. The query reaches only `MetadataProvider.search`, which is a read
 *    against the provider — nothing in an address can add to a library, and the shelf's
 *    exclusions are computed from the reader's own data, not from the link.
 *
 * The parameter is `q` because that is what the web has called this since search engines
 * had one, and an address is the one part of an interface whose conventions are not ours.
 */
export const QUERY_PARAM = 'q';

/**
 * The search an address is asking for.
 *
 * An array is expo-router's shape when a key appears twice; the first is the answer, for the
 * same reason `viewFrom` treats nonsense as the default — a mistyped or stale link deserves
 * the screen, not a message about a parameter. Whitespace is left exactly as typed: trimming
 * belongs to the screen deciding whether to search, and a query is somebody's text.
 */
export function queryFrom(raw: string | string[] | null | undefined): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' ? first : '';
}
