# The Late Edition canvas

The working files behind the visual concept published at
<https://claude.ai/code/artifact/ba1e6e15-0803-41d8-8fb5-8d4db782864f>.

Every `.dc.html` is one artboard; `canvas.json` places them. To change the canvas, edit
these and re-seed — never edit the published page's source, and never edit a seeded
output file. They live here rather than in a temporary directory because the concept is
the deliverable, and a scratch directory does not survive a container restart.

`Before.dc.html` is a recreation of the shipping Discover screen, built from the real
values in `mobile/src/ui/theme.ts` rather than from memory, so the comparison against
`After.dc.html` is honest. If the shipping design changes, that file is stale and the
comparison quietly stops being true.
