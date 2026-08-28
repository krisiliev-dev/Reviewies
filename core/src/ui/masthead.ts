/**
 * A screen's own name, at the top of it.
 *
 * The type has been right since §6.112 and `type.test.ts` holds it: three treatments, a
 * masthead at `s30` in the display face, a page heading at `s24` and a sub-heading at `s20`,
 * both in the title face. What nothing held is **the space around it**.
 *
 * Twenty `<h1>`s on the web carry seven different spacings for those three treatments —
 * `mb-1`, `mb-2`, `mb-3`, `mb-4`, none, with and without `px-1`. The five tab roots on the
 * phone are worse in a quieter way: three of the five set `marginBottom: 8` inside their
 * `heading` style and two set nothing, so two screens' titles sit against their content and
 * three do not. Nobody chose either.
 *
 * The type was uniform because a guard made it so; the space was not because no guard could
 * see it. That is the argument for the component rather than a sixth clause.
 *
 * ## The phone's pushed screens keep UIKit's header, and the reason is not the one written
 *
 * `docs/design/components.md` §3 asked for this component to replace the phone's ten
 * pushed-screen headers, and gave as the payoff: *"the nine pushed screens get
 * `accessibilityRole="header"` for the first time — on the web export today their titles
 * are not headers at all."* That sentence is **false**, and it was repeated into this
 * file's own header and into a `masthead.test.ts` clause before anybody checked it.
 *
 * expo-router's bundled `HeaderTitle` renders `role="heading" aria-level="1"`. Opening the
 * export and reading the document confirms it: `/stats` gives
 * `<h1 role="heading" aria-level="1">Stats</h1>`. The titles have been headings all along.
 *
 * What the same reading found instead is the defect below — every *other* heading on the
 * phone is an `<h1>` too. That was worth the sprint; replacing a working native header to
 * gain a role it already has was not. What remains as an argument for the replacement is
 * visual: a pushed title is in the system face at the system size while every tab root is
 * in Archivo Narrow on our scale, which is real and belongs with the layout work in #160.
 */
import { space, text } from '../tokens.ts';
import type { HeadingDepth } from './section.ts';

/**
 * `depth` is the heading level, and it is here for the reason given in `section.ts`: it
 * is the property a screen reader navigates by, and it was the one decision this
 * component did not own. `page` is also depth 1 — a screen has one name whether it is a
 * tab root or pushed — and `sub` is 2 because it introduces a block inside that screen.
 */

export type MastheadLevel = 'masthead' | 'page' | 'sub';

/**
 * Three treatments and one gap each. The gap is the part that was drifting.
 *
 * `sub` carries **zero**, and zero is not a step: the space scale starts at 2 because there
 * is no such thing as two pixels of deliberate nothing. A sub-heading is a sentence
 * introducing the block directly under it — Up Next's "Bring your history with you" — and a
 * gap there would separate it from the thing it introduces. Absence is the decision, so it
 * is written as `0` rather than dressed up as a token.
 */
export const MASTHEAD = {
  masthead: { size: text.s30, face: 'display', weight: 'bold', gapBelow: space.s16, depth: 1 },
  page: { size: text.s24, face: 'title', weight: 'semibold', gapBelow: space.s12, depth: 1 },
  sub: { size: text.s20, face: 'title', weight: 'semibold', gapBelow: 0, depth: 2 },
} as const satisfies Record<
  MastheadLevel,
  {
    size: number;
    face: 'display' | 'title';
    weight: 'bold' | 'semibold';
    gapBelow: number;
    depth: HeadingDepth;
  }
>;
