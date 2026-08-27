# The three directions

Each was written independently from a different starting point, without sight of the
others:

| | Starting point | Signature move |
|---|---|---|
| **Late Edition** | the *artefact* of television — the listings page, the VHS spine, the test card | the cross-off: a ring at the row's edge, a stroke drawn through the title |
| **Bias Light** | the *act* of watching — darkness, the glow, the pause, turning to say something | the cut to black: the write lands first, the ritual is decoration over a completed action |
| **TEST CARD** | the *record* — ten years of somebody's attention as the object | the strip: one vertical bar per watch, scrubbed with a thumb |

## Read these from disk, never from a summary

The first judging round was handed `JSON.stringify(directions).slice(0, 24000)`. Late
Edition alone is 24,219 characters, so the judges and the synthesis director scored **one
direction and none of the other two**, then declared a winner. The director reported the
gap honestly, which is the only reason it was caught; the numbers in
`docs/design/direction.md` were never a comparison.

Anything that judges, compares or builds on these reads the files. Embedding them in a
prompt is how the first round failed, and a bigger slice would only move the cliff.
