import { useLayoutEffect, useRef, useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import type { Suggestion } from '@reviewies/core/discover/recommend';
import { BOX, BOX_COLUMNS, backLines, boxFacts, boxUnder } from '@reviewies/core/ui/box';
import { POSTER_PLATE, posterInitials } from '@reviewies/core/ui/poster';
import { Button } from './Button';
import { Note } from './Note';
import { Section } from './Section';

/**
 * The shelf: boxes you look along, and turn over.
 *
 * `docs/design/architecture.md` section 5 and `core/src/ui/box.ts` carry the decisions. In short:
 * Discover was *"a list of shows with buttons"*, which is the right shape for results and
 * the wrong shape for browsing, and what was wanted was **browsable** — large boxes with
 * genre, year and title on them, *"as if a person is in a CD shop looking at the CD boxes"*,
 * turning over for the synopsis and the rest.
 *
 * ## The reason is a section head, not a line on every box
 *
 * All three design directions independently arrived at this and `direction.md` records it as
 * *"verbatim the same fix"*: a sentence repeated on every row it appears on is not the line
 * that distinguishes them, it is the group they are in. §6.169 photographed thirty rows each
 * carrying *Popular right now*. So the boxes are grouped by their `because` and the sentence
 * is drawn once, over the group it is true of — which is also the only way it fits, because
 * a box is 173 points wide and that sentence is not.
 */
/**
 * `BOX_COLUMNS` as classes, written out, so the two platforms count the same columns.
 *
 * Tailwind v4 compiles from source text, so `grid-cols-${n}` generates nothing — the same
 * trap `Choice.tsx`'s `GAP` records, and `Poster.tsx` records the sharper version of, where
 * a class with no rule behind it looks exactly like a class. So the table is a lookup keyed
 * by the number, both literals appear in the source, and `browse.test.ts` rebuilds the two
 * names from `BOX_COLUMNS` and compares.
 */
const COLUMNS = { 2: 'grid-cols-2', 3: 'grid-cols-3' } as const;
const AT_WIDTH = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as const;
const NARROW = COLUMNS[BOX_COLUMNS.phone];
const WIDE = AT_WIDTH[BOX_COLUMNS.wide];

export function Browse({
  items,
  onActed,
}: {
  items: readonly Suggestion[];
  onActed: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupsOf(items).map(([because, group]) => (
        <section key={because || 'trending'}>
          {/* Nothing over the trending group: the screen's blurb above already says the
              feed is a chart rather than a recommendation, and a heading saying the same
              thing twice is the §6.169 defect at a different altitude. */}
          {because ? <Section className="px-1">{because}</Section> : null}
          <ul className={`grid gap-s12 ${NARROW} ${WIDE}`}>
            {group.map((item) => (
              <li key={item.id}>
                <Box item={item} onActed={onActed} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The shelf, in groups, in the order the feed gave them.
 *
 * A `Map` rather than a sort: `getSuggestions` ranks by score and re-ordering the shelf to
 * tidy the headings would throw that away. Titles that share a reason are almost always
 * adjacent already, because the reason comes from the seed they were recommended from.
 */
function groupsOf(items: readonly Suggestion[]): Array<[string, Suggestion[]]> {
  const groups = new Map<string, Suggestion[]>();
  for (const item of items) {
    const because = item.trending
      ? ''
      : COPY.discover.because(item.because, item.becauseWatched);
    groups.set(because, [...(groups.get(because) ?? []), item]);
  }
  return [...groups];
}

/**
 * One box, with two faces.
 *
 * The front is a press that turns it over; the back is where the two actions are. `box.ts`
 * says why: a shelf of twenty boxes each carrying **Track** and **Watchlist** is forty
 * controls with two names between them, which is `row.ts`'s naming rule broken twenty times
 * over. One control, named for the title it is about.
 */
function Box({ item, onActed }: { item: Suggestion; onActed: () => void }) {
  /** Which face is up. A reveal, registered in `core/src/ui/reveals.ts`. */
  const [over, setOver] = useState(false);
  const [added, setAdded] = useState<'library' | 'watchlist'>();

  async function cache() {
    await db.titles.put({
      id: item.id,
      kind: item.kind,
      name: item.name,
      year: item.year,
      overview: item.overview,
      posterUrl: item.posterUrl,
      genres: item.genres,
      fetchedAt: Date.now(),
    });
  }

  async function track() {
    await cache();
    /*
     * The feed reloads before the episodes land, for the reason `track` has always given:
     * the show is tracked by the line above, and waiting on twenty-four season requests to
     * say so is a control that looks untouched for half a minute. §6.153.
     */
    await addToLibrary(item.id, item.kind);
    setAdded('library');
    onActed();
    if (item.kind === 'show') void getEpisodesCached(item.id).catch(() => {});
  }

  async function save() {
    await cache();
    await addToWatchlist(item.id, item.kind, `Suggested by ${item.because[0]}`);
    setAdded('watchlist');
    onActed();
  }

  if (over) {
    return (
      <div className="flex h-full flex-col gap-2 rounded-plate bg-ground-raised p-3">
        <p className="text-s14 font-title font-semibold text-ink">{item.name}</p>
        <Note level="footnote">{boxFacts(item)}</Note>
        {/* The synopsis, which is the reason the back exists. Clamped to the ground the
            panel has, because a box in a grid whose height is its neighbours' cannot take a
            paragraph of any length — `backLines` carries what that used to be spelled as. */}
        {item.overview ? <Synopsis>{item.overview}</Synopsis> : null}
        {/* The two actions, here rather than on the front — `box.ts` has the argument.
            No `mt-auto`: the synopsis above takes the ground now, so there is none left to
            push these down with, and a margin that can never bind is a line that says the
            layout does something it does not. */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          <Button
            onPress={track}
            disabled={added === 'library'}
            tone="primary"
            label={added === 'library' ? COPY.controls.tracking : COPY.controls.track}
            name={COPY.controls.trackTitle(item.name)}
          />
          <Button
            onPress={save}
            disabled={added === 'watchlist'}
            tone="secondary"
            label={added === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
            name={COPY.controls.addToWatchlist(item.name)}
          />
        </div>
        {/*
          The way out of the box, and the way off the shelf.

          Before the rework a Discover row was `open={{ name: 'Open …', to: '/title/…' }}`
          plus Track and Watchlist — `e09ac85^:app/src/screens/Discover.tsx:143`. Two of
          those three came over to the back of the box and the third did not, so a title on
          the shelf had no route to where it is streaming, what it warns you about, how
          many seasons it runs to or who is in it, while the *same title* in the results
          list one keystroke away still had one. `box.ts`'s argument for putting the verbs
          on the back is about **twenty boxes each carrying two of them**; it is not an
          argument against a destination, and `architecture.md`'s eight refusals do not
          contain this one. It was dropped rather than decided.

          Beside `Done` and in its register — quiet, inline — rather than up with the two
          filled verbs: this is the way to *read more*, and the box's whole thesis is that
          the front sells nothing and the back is where you decide. Four controls on a
          back, two of them the size of a word. §6.178 is the row that grew to eight.
        */}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            size="inline"
            tone="quiet"
            to={`/title/${encodeURIComponent(item.id)}`}
            label={COPY.controls.details}
            name={`Open ${item.name}`}
          />
          <Button
            size="inline"
            tone="quiet"
            onPress={() => setOver(false)}
            label={COPY.controls.done}
            name={COPY.controls.turnBack(item.name)}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOver(true)}
      aria-label={COPY.controls.turnOver(item.name)}
      /*
       * No `tap`. That class is `index.css`'s floor for *"a text button that is still a
       * target"* — a line of words with nothing else to give it height — and it buys that
       * height with `align-items: center` alongside the `min-height`. On one line in a row
       * that centres the glyphs; on this column it centred the title and the line under it
       * against the plate, each at its own width, while `text-left` right here said
       * otherwise and the phone's twin drew both flush left. A box 173 points wide and 311
       * tall has never needed a 24-point floor. `space.test.ts` holds the general rule.
       */
      className="flex w-full flex-col gap-1.5 text-left active:bg-ground-well"
    >
      <Art url={item.posterUrl} name={item.name} />
      <span className="line-clamp-2 text-s14 font-title font-semibold text-ink">
        {item.name}
      </span>
      {/* Genre, then year — the two facts a spine carries besides the name. `box.ts` owns
          the composition so the phone cannot punctuate it differently. */}
      <span className="line-clamp-1 text-s12 text-ink-secondary">{boxUnder(item)}</span>
    </button>
  );
}

/**
 * The synopsis, clamped to the ground rather than to a number.
 *
 * `core/src/ui/box.ts`'s `backLines` has the measurements and the argument; the short form
 * is that this was `line-clamp-6` and the panel it clamps into is 333 points at a 420
 * window and 383 at 1280, so six lines truncated *and* left 40 to 90 points of the panel
 * empty underneath. A third of a box, on the half of the shelf no design pass had ever
 * photographed with a real paragraph in it.
 *
 * `flex-1 min-h-0` is what makes the ground a measurable thing: the panel is `h-full`, so
 * this child is handed whatever the title, the fact line and the four controls did not
 * take, and its own height is therefore the answer rather than an estimate of it. The
 * clamp then goes on inline, because Tailwind compiles from source text and cannot be
 * handed a number — the trap `COLUMNS` above records, and `Choice.tsx`'s `GAP` before it.
 *
 * ## Why the paragraph is taken out of the flow
 *
 * `h-full` is 100% of a grid row, and a grid row is as tall as its tallest item — so a back
 * that grows makes the row it is measuring against grow with it, and "the ground the panel
 * has" is not a quantity at all. The first build of this measured 396-point panels on a
 * 333-point shelf: the paragraph pushed the row out, the observer read the pushed-out row,
 * and the clamp obligingly agreed to every line.
 *
 * `absolute` breaks that. The words contribute **nothing** to what the panel asks for, so the
 * row is set by the fronts exactly as it was, `h-full` hands the panel that height, `flex-1`
 * hands this wrapper the remainder, and the remainder is a number that was decided before
 * the paragraph was consulted. It is also what makes the back safe: there is no synopsis
 * long enough to move the shelf.
 *
 * ## `top-0`, and not `inset-0`, which drew half a line
 *
 * The first spelling of that was `absolute inset-0`, which pins the bottom as well and so
 * gives the paragraph the wrapper's whole height — 143 points — while the clamp shows eight
 * lines of 17, which is 137. `-webkit-line-clamp` hides what is past the eighth line by
 * clipping at the element's own box, and the element's box was six points taller than the
 * text it was clipping, so the **top of the ninth line printed** under the ellipsis.
 * Photographed at six times scale before it was believed: *"condition worsens and long-…"*
 * with *"hidden family secrets come to"* half-drawn beneath it.
 *
 * Which is the failure this whole clamp exists to avoid, arrived at down a different road —
 * `poster.ts` says it about a monogram, in the same words: a mark so thin it reads as a
 * rendering fault rather than as a stand-in. Pinning only the top leaves the height to the
 * clamped content, so there is no box for a ninth line to be drawn in.
 *
 * A `ResizeObserver` and not a one-off read: the shelf reflows at `sm`, the window resizes,
 * and the panel's height is its row's. `useLayoutEffect` so the first count lands before
 * the browser paints, and `overflow-hidden` so the frame in between could not have spilled
 * either.
 */
function Synopsis({ children }: { children: string }) {
  const ground = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<number>();

  useLayoutEffect(() => {
    const el = ground.current;
    if (!el) return;
    /*
     * The leading is read off the paragraph itself and not off this wrapper, so that the
     * wrapper carries no type at all: `note.test.ts` owns every line height on this platform
     * and a `leading-…` written here to make a measurement convenient would be the fifth
     * hand-written one it was extracted to end.
     */
    const read = () => {
      const line = parseFloat(getComputedStyle(el.firstElementChild ?? el).lineHeight);
      if (line > 0) setLines(backLines(el.clientHeight, line));
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  return (
    <div ref={ground} className="relative min-h-0 flex-1 overflow-hidden">
      {/*
        The four properties `line-clamp-n` is, written out, rather than that utility with the
        count overridden beside it. The front two lines above genuinely are `line-clamp-2`
        and `line-clamp-1` — they clamp to `BOX.lines`, which are constants — so a
        `line-clamp-…` here as well would be a fixed number and a measured one wearing the
        same spelling, and nothing reading the file could tell them apart.
      */}
      <Note
        level="footnote"
        className="absolute inset-x-0 top-0"
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: lines,
          overflow: 'hidden',
        }}
      >
        {children}
      </Note>
    </div>
  );
}

/**
 * The artwork, at the box's own width.
 *
 * Not `Poster`, and the reason is geometry rather than taste: every size in `POSTER_SIZE` is
 * a **fixed width** with the height derived from the ratio, because a poster beside a row is
 * 44 points wide wherever it appears. A box is as wide as its column, which is a different
 * fact — so the width comes from the grid and the height from `BOX.ratio`, which is the same
 * `ratio.poster` the table reads.
 *
 * The *decisions* are still shared: `posterInitials` for the monogram and `POSTER_PLATE` for
 * the plate and its band, so an unmatched title looks like itself here and on every row.
 */
function Art({ url, name }: { url?: string; name: string }) {
  const box = 'w-full rounded-plate border-b-ground overflow-hidden bg-ground-well';
  if (!url) {
    return (
      <span
        style={{ aspectRatio: BOX.ratio, borderBottomWidth: POSTER_PLATE.band }}
        className={`${box} flex items-center justify-center text-s30 font-title font-semibold text-ink-secondary`}
        aria-hidden="true"
      >
        {posterInitials(name)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{ aspectRatio: BOX.ratio, borderBottomWidth: POSTER_PLATE.band }}
      className={`${box} object-cover`}
    />
  );
}
