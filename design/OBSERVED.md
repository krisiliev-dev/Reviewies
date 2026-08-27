# Seen directly while briefing the design team

Recorded here so they do not depend on being rediscovered. Each was observed in the
14 screenshots in `design/screens/`, captured from the shipping build.

## Stats opens on a period the imported history cannot fill

`08-stats.png`. The default window is **This year**. A person arriving from TV Time has
just imported a decade of history that mostly is not in the current year, so the screen
that should reward the import reads:

> Watched **0m** · Episodes **0** · Titles **0** · Longest streak **0 days**
> Nothing watched in this period yet.

with a **Show all time** button underneath. The information is all there — it is one tap
away — but the default makes a full library look like an empty one. Section 6.55 chose
what each screen opens on; this default was chosen for somebody who has been using the
app for a year, not for somebody on their first day, and the first day is the one that
decides whether there is a second.

## Every Discover card carries the same sentence

`05-discover.png`. Three cards, three different titles, and identical reason lines:
"Because you watched Halt and Catch Fire and The Leftovers". A reason that never varies
is not a reason, and repeating it three times makes the recommendation look automated
rather than considered.

## The poster slot has no design for having no poster

`05-discover.png`. An absent poster renders as a flat grey rectangle with the title
repeated inside it in small grey text — so the title appears twice, once illegibly. Every
real library has titles the provider has no art for, and imported-but-unmatched rows have
none at all until matching finishes, which is precisely the first-run state.

## Up Next after an import is three sentences and a button

`03-upnext.png`. The home screen of a TV tracker, on the day somebody arrives with 264
watches, is a heading, two lines of grey prose, a progress line, and one pink pill on an
otherwise empty black screen. It is honest — section 6.80 made it honest — but it is
the least interesting possible rendering of the most interesting moment.

## The screens are mostly empty below the fold

`08-stats.png` uses roughly the top fifth of the display. `03-upnext.png` uses less.
A tracker is a data-dense product and this reads as a settings screen.
