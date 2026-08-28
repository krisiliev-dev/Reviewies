/**
 * A section label and the thing it labels, which is one object and had no owner.
 *
 * `Section` draws the label. Nothing drew the pair, so every screen assembled it by hand
 * and they disagree twice over.
 *
 * ## The label has two treatments
 *
 * `data.tsx`, `stats.tsx` and the web's `Settings.tsx` use `Section` — the eyebrow at
 * `s12`, caps, tracked, secondary ink. `account.tsx`, `people.tsx`,
 * `comments/[targetId].tsx`, and the web's `AccountPanel.tsx` and `People.tsx` use a
 * hand-written `s16` in the title face, inside a raised card.
 *
 * They are the same job — name the block below you — and `people.tsx` does **both, in one
 * scroll view**: `<Section>Find people</Section>` at line 229 and a boxed `s16` "You" at
 * line 114. That is not a considered distinction between two kinds of block. It is drift,
 * and one file doing it both ways is the proof.
 *
 * ## And the gap has three values
 *
 * Between the label and what it labels: `12` on the phone's data, account and people
 * screens, `8` in comments, and `mb-1` — **4px** — on the web's account panel. The same
 * shape as §6.119's finding about the gap under a screen title, one level down.
 *
 * ## Why this is a component rather than a rule
 *
 * `data.tsx` already had it. A local `Block` at the bottom of that file, with a comment
 * that reads: *"this is the box, `Section` is the label on it, and one file holding both
 * under one name is how the label ended up hand-written nine times."* The diagnosis was
 * correct and it was written where only that screen could benefit from it.
 */
import { space } from '../tokens.ts';

/**
 * One gap, on the scale.
 *
 * `space.s12`, which is what three of the five phone sites already used and the most
 * defensible of the three: the label sits closer to its content than blocks sit to each
 * other (`24` between blocks on data, `16` elsewhere), which is the whole of what makes a
 * label read as belonging to what follows rather than floating between two things.
 */
export const BLOCK = { gap: space.s12 } as const;
