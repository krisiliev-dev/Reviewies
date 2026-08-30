import { useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import type { Suggestion } from '@reviewies/core/discover/recommend';
import { BOX, BOX_COLUMNS, boxFacts, boxUnder } from '@reviewies/core/ui/box';
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
        {/* The synopsis, which is the reason the back exists. Clamped, because a box in a
            grid whose height is its neighbours' cannot take a paragraph of any length. */}
        {item.overview ? (
          <Note level="footnote" className="line-clamp-6">{item.overview}</Note>
        ) : null}
        {/* The two actions, here rather than on the front — `box.ts` has the argument. */}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
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
        <Button
          size="inline"
          tone="quiet"
          onPress={() => setOver(false)}
          label={COPY.controls.done}
          name={COPY.controls.turnBack(item.name)}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOver(true)}
      aria-label={COPY.controls.turnOver(item.name)}
      className="tap flex w-full flex-col gap-1.5 text-left active:bg-ground-well"
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
