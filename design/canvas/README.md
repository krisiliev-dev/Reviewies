# The Late Edition canvas

The working files behind the visual concept published at
<https://claude.ai/code/artifact/ba1e6e15-0803-41d8-8fb5-8d4db782864f>.

Every `.dc.html` is one artboard; `canvas.json` places them. To change the canvas, edit
these and re-seed — never edit the published page's source, and never edit a seeded
output file. They live here rather than in a temporary directory because the concept is
the deliverable, and a scratch directory does not survive a container restart.

~~`Before.dc.html` is a recreation of the shipping Discover screen, built from the real
values in `mobile/src/ui/theme.ts` rather than from memory, so the comparison against
`After.dc.html` is honest. If the shipping design changes, that file is stale and the
comparison quietly stops being true.~~

**Retired, and the sentence above predicted exactly how.** `Before.dc.html` was committed
2026-08-27 13:32; "fills become rules" removed that palette at 18:00 the same day, four and a
half hours later. Measured: **all eight of its colours, across 48 uses, are absent from every
token table in this build** — `#0b0b0f` where the ground is `#131114`, `#f2f2f7` where the ink
is `#F4EFE7`, and `#ff5c7a`, a pink the product deleted. It was a photograph of an unreachable
build for four days, under a `canvas.json` annotation arguing the chosen direction from *"two
competing pink buttons per card"*.

It is **kept and marked** rather than deleted, because the comparison did its job: the direction
it argued for is the one that shipped. What is retired is the claim that it depicts anything
current. `After.dc.html` measures 11 of 16 in-palette, which is what a proposal should look
like, and the other artboards are proposals too — `Watching.dc.html` is 9 of 22 and that is not
a defect.

The claim is now held rather than trusted: `app/src/wiring/docsReferences.test.ts` reads this
file for any artboard described as built from current values, and checks that one's colours
against the palette. Write the sentence again about a file that has drifted and the clause
fails, which is what the original sentence asked for and could not do for itself.
