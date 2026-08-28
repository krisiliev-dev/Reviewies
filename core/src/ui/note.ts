/**
 * The sentence under a heading that explains what the thing is.
 *
 * Twenty-eight styles on the phone and about seventy class strings on the web, all the same
 * role wearing different names: `blurb`, `muted`, `note`, `hint`, `footnote`, `toggleHint`,
 * `deliveryNote`, `startBlurb`. The census found what happens when a role has no owner:
 *
 * - **Six line-heights for one role on the phone** — 15, 16, 17, 19, 20, 22, and absent —
 *   against **none at all on the web**, which inherited the body's.
 * - **Eleven web sites with no size either**, inheriting 16 where the phone drew 14. Same
 *   shape as the six unsized `<h2>`s: not a decision, an omission that reads as one.
 * - Two real levels underneath, which is what the table below keeps: a paragraph under a
 *   heading, and a footnote under a control.
 *
 * ## Two levels, and what separates them
 *
 * | | `note` | `footnote` |
 * |---|---|---|
 * | size | `s14` | `s12` |
 * | leading | `l143` | `l143` |
 * | ink | secondary | secondary |
 *
 * One channel — size — and that is deliberate, unlike `Section`. These two are not container
 * and contents; they are the same voice at two volumes, and a footnote that also changed
 * colour would be a third ink step in a palette whose tertiary is already at the 4.51 floor.
 * `docs/design/tokens.md` §3 has the number: there is no headroom below `ink.secondary` for
 * a role that appears under every control in the app.
 */
import { leading, text } from '../tokens.ts';

export type NoteLevel = 'note' | 'footnote';

export const NOTE = {
  note: { size: text.s14, leading: leading.l143 },
  footnote: { size: text.s12, leading: leading.l143 },
} as const satisfies Record<NoteLevel, { size: number; leading: number }>;

/**
 * Secondary, never tertiary.
 *
 * `ink.tertiary` is 4.51:1 on `raised` — the floor of the whole system, with nothing under
 * it. A note is read, not glanced at, so it sits on the step that has room.
 */
export const NOTE_INK = 'inkSecondary';
