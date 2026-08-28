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
 * ## What this deliberately does not do
 *
 * `docs/design/components.md` §3 specifies a `Masthead` that also replaces the phone's nine
 * pushed-screen headers — `headerShown: false` on the Stack, a drawn back chevron, and
 * `accessibilityRole="header"` on nine titles that are not headers today. That is worth
 * doing and it is a **navigation** change across ten files, not a component extraction: it
 * trades UIKit's back-label and large-title behaviour for a three-line wrap at 200%.
 * It belongs with the layout work in #160, and doing half of it here would leave the app
 * with two kinds of header and no guard able to say which a screen has.
 */
import { space, text } from '../tokens.ts';

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
  masthead: { size: text.s30, face: 'display', weight: 'bold', gapBelow: space.s16 },
  page: { size: text.s24, face: 'title', weight: 'semibold', gapBelow: space.s12 },
  sub: { size: text.s20, face: 'title', weight: 'semibold', gapBelow: 0 },
} as const satisfies Record<
  MastheadLevel,
  {
    size: number;
    face: 'display' | 'title';
    weight: 'bold' | 'semibold';
    gapBelow: number;
  }
>;
