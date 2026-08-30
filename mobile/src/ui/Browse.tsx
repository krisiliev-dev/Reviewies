import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { COPY } from '@reviewies/core/copy';
import { db } from '@reviewies/core/data/db';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import type { Suggestion } from '@reviewies/core/discover/recommend';
import { BOX, BOX_COLUMNS, boxFacts, boxUnder } from '@reviewies/core/ui/box';
import { POSTER_GLYPH_SCALES, POSTER_PLATE, posterInitials } from '@reviewies/core/ui/poster';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { radius, theme } from './theme';
import { Button } from './Button';
import { Note } from './Note';
import { Section } from './Section';

/**
 * The shelf: boxes you look along, and turn over.
 *
 * `docs/design/architecture.md` section 5 and `core/src/ui/box.ts` carry the decisions, and the
 * web's twin at `app/src/ui/Browse.tsx` carries the rest. In short: Discover was a list of
 * shows with buttons, which is the right shape for results and the wrong shape for browsing.
 *
 * The reason a title is here is a **section head** rather than a line on every box — all
 * three design directions arrived at that independently and `direction.md` records it as
 * "verbatim the same fix". It is also the only way it fits: a box is 173 points wide and
 * "Because you watched The Long Dark and Salt Flats" is not.
 */
export function Browse({
  items,
  onActed,
}: {
  items: readonly Suggestion[];
  onActed: () => void;
}) {
  /*
   * The box's width, measured rather than guessed at a percentage.
   *
   * `width: '48%'` and a gap is two numbers that have to agree and cannot be checked; this
   * is the arithmetic `BOX_COLUMNS` describes — the frame, less the screen's two edges, less
   * the gaps between the columns, divided by the columns. The artwork's height then comes
   * from `BOX.ratio`, which is `ratio.poster`, which is the one number `poster.ts` records a
   * whole sprint being written out by hand instead.
   */
  const { width } = useWindowDimensions();
  const columns = BOX_COLUMNS.phone;
  const boxWidth = Math.floor(
    (width - SCREEN.edge * 2 - BOX.gap * (columns - 1)) / columns,
  );

  return (
    <View style={styles.shelf}>
      {groupsOf(items).map(([because, group]) => (
        <View key={because || 'trending'}>
          {/* Nothing over the trending group: the screen's blurb already says the feed is a
              chart rather than a recommendation, and a heading repeating it is §6.169's
              defect at a different altitude. */}
          {because ? <Section>{because}</Section> : null}
          <View style={styles.grid}>
            {group.map((item) => (
              <Box key={item.id} item={item} width={boxWidth} onActed={onActed} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The shelf, in groups, in the order the feed gave them.
 *
 * A `Map` rather than a sort: `getSuggestions` ranks by score and re-ordering the shelf to
 * tidy the headings would throw that away.
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
function Box({
  item,
  width,
  onActed,
}: {
  item: Suggestion;
  width: number;
  onActed: () => void;
}) {
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
      <View style={[styles.back, { width, minHeight: Math.round(width / BOX.ratio) }]}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.under}>{boxFacts(item)}</Text>
        {/* The synopsis, which is the reason the back exists. Line-limited, because a box in
            a grid whose height is its neighbours' cannot take a paragraph of any length. */}
        {item.overview ? (
          <Note level="footnote" numberOfLines={BOX.backLines}>
            {item.overview}
          </Note>
        ) : null}
        {/* The two actions, here rather than on the front — `box.ts` has the argument. */}
        <View style={styles.actions}>
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
        </View>
        <Button
          size="inline"
          tone="quiet"
          onPress={() => setOver(false)}
          label={COPY.controls.done}
          name={COPY.controls.turnBack(item.name)}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setOver(true)}
      accessibilityRole="button"
      accessibilityLabel={COPY.controls.turnOver(item.name)}
      style={[styles.front, { width }]}
    >
      <Art url={item.posterUrl} name={item.name} width={width} />
      <Text style={styles.title} numberOfLines={BOX.lines.title}>
        {item.name}
      </Text>
      {/* Genre, then year — the two facts a spine carries besides the name. `box.ts` owns
          the composition so the web cannot punctuate it differently. */}
      <Text style={styles.under} numberOfLines={BOX.lines.under}>
        {boxUnder(item)}
      </Text>
    </Pressable>
  );
}

/**
 * The artwork, at the box's own width.
 *
 * Not `Poster`, and the reason is geometry rather than taste: every size in `POSTER_SIZE` is
 * a **fixed width** with the height derived from the ratio, because a poster beside a row is
 * 44 points wide wherever it appears. A box is as wide as its column. The *decisions* are
 * still shared — `posterInitials` for the monogram, `POSTER_PLATE` for the plate and its
 * band — so an unmatched title looks like itself here and on every row.
 */
function Art({ url, name, width }: { url?: string; name: string; width: number }) {
  const plate = { width, height: Math.round(width / BOX.ratio) };
  if (!url) {
    return (
      <View style={[styles.plate, styles.fallback, plate]}>
        {/* Hidden, as every other plate's monogram is: the name is on the box already, and
            two letters read aloud are two letters. */}
        {/* The plate cannot grow, so neither does the mark inside it — `poster.ts` has the
            measurement and the argument, and the constant so that this is the same decision
            rather than a second one spelled `false`. */}
        <Text aria-hidden allowFontScaling={POSTER_GLYPH_SCALES} style={styles.monogram}>
          {posterInitials(name)}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.plate, plate]}>
      <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { gap: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: BOX.gap },
  front: { gap: 6 },
  /*
   * At least as tall as the artwork it replaced.
   *
   * `05-discover-back.png` is what asked for this: the turned-over box was shorter than its
   * neighbours' fronts, so the row it sits in collapsed and the shelf jumped under the
   * thumb that had just pressed it. The web gets this from the grid — a grid item stretches
   * to its row and the back is `h-full` — and the phone lays its shelf out with
   * `flexWrap`, which has no such thing, so the floor is stated.
   *
   * The plate's height rather than the whole front's: the title and the line under it are
   * one and two lines of type that grow with the reader's setting, and a minimum computed
   * from them would be a second guess at a number `Row` already owns. The artwork is the
   * part that is fixed, and it is most of the box.
   */
  back: {
    gap: 6,
    padding: 12,
    borderRadius: radius.plate,
    backgroundColor: theme.groundRaised,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  /*
   * No `fontWeight`. The phone cannot thicken a named family — once `fontFamily` is set,
   * Android ignores the weight and iOS synthesises one — so the face *is* the weight, and
   * `type.test.ts` holds every phone style to that. `Row` states the same three properties
   * and no fourth.
   */
  title: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  under: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  plate: {
    borderRadius: POSTER_PLATE.radius,
    borderBottomWidth: POSTER_PLATE.band,
    borderBottomColor: theme.ground,
    overflow: 'hidden',
  },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.groundWell },
  monogram: {
    color: theme.inkSecondary,
    fontSize: BOX.monogram,
    fontFamily: type.family.title.name,
  },
  image: { width: '100%', height: '100%' },
});
