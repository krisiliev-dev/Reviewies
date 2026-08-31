import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { COPY } from '@reviewies/core/copy';
import { db } from '@reviewies/core/data/db';
import { addToLibrary, addToWatchlist } from '@reviewies/core/data/repo';
import { getEpisodesCached } from '@reviewies/core/metadata/index';
import type { Suggestion } from '@reviewies/core/discover/recommend';
import { BOX, BOX_COLUMNS, backLines, boxFacts, boxUnder } from '@reviewies/core/ui/box';
import { NOTE } from '@reviewies/core/ui/note';
import { POSTER_GLYPH_SCALES, POSTER_PLATE, posterInitials } from '@reviewies/core/ui/poster';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { leadingOf, radius, theme } from './theme';
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
  const { width, fontScale } = useWindowDimensions();
  const columns = BOX_COLUMNS.phone;
  const boxWidth = Math.floor(
    (width - SCREEN.edge * 2 - BOX.gap * (columns - 1)) / columns,
  );

  /*
   * The synopsis's line box, in the points `onLayout` reports.
   *
   * Not a `lineHeight` being written, which is the property `phoneTextScaling.test.ts`
   * refuses a font scale on: this is a **box**, the same allowance `TAB_BAR_HEIGHT` takes
   * and for the same reason. React Native draws a stored leading at `lineHeight * fontScale`
   * and `onLayout` hands back real points, so the number of lines that fit in a measured
   * height is only right if the multiplier is in it. `NOTE.footnote` rather than a 12 and a
   * 1.43 typed here, because `Note` is what draws this paragraph.
   */
  const line = leadingOf(NOTE.footnote.size, NOTE.footnote.leading) * fontScale;

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
              <Box key={item.id} item={item} width={boxWidth} line={line} onActed={onActed} />
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
  line,
  onActed,
}: {
  item: Suggestion;
  width: number;
  line: number;
  onActed: () => void;
}) {
  /** Which face is up. A reveal, registered in `core/src/ui/reveals.ts`. */
  const [over, setOver] = useState(false);
  const [added, setAdded] = useState<'library' | 'watchlist'>();
  /**
   * The height of the face this box was showing a moment ago, and the height of the other
   * one.
   *
   * `h-full` is what the web's grid gives the back for nothing: a grid item is as tall as
   * its row, so a box that turns over cannot change the shelf. The phone lays its shelf out
   * with `flexWrap`, which has no such thing, and this is that fact measured rather than
   * computed — the front's own laid-out height, which is already the row's, taken from the
   * face that was up before the press.
   */
  const [face, setFace] = useState<number>();
  /** The ground the back's own layout left the synopsis, and what fits in it. */
  const [ground, setGround] = useState<number>();

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
      <View style={[styles.back, { width, height: face ?? Math.round(width / BOX.ratio) }]}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.under}>{boxFacts(item)}</Text>
        {/* The synopsis, which is the reason the back exists. Line-limited to the ground the
            panel has, because a box in a grid whose height is its neighbours' cannot take a
            paragraph of any length — `backLines` in `core/src/ui/box.ts` carries what that
            used to be spelled as, and what one number cost at each width. */}
        {item.overview ? (
          <View
            style={styles.ground}
            onLayout={(e) => setGround(e.nativeEvent.layout.height)}
          >
            <Note
              level="footnote"
              numberOfLines={ground === undefined ? undefined : backLines(ground, line)}
            >
              {item.overview}
            </Note>
          </View>
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
        <View style={styles.ways}>
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
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setOver(true)}
      accessibilityRole="button"
      accessibilityLabel={COPY.controls.turnOver(item.name)}
      // The row's own height, read off the face that is up. See `face` above.
      onLayout={(e) => setFace(e.nativeEvent.layout.height)}
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
   * Exactly as tall as the face it replaced — a height, not a floor.
   *
   * `05-discover-back.png` asked for a floor: the turned-over box was shorter than its
   * neighbours' fronts, so the row collapsed and the shelf jumped under the thumb that had
   * just pressed it. The floor written for that was **the plate's height**, on the argument
   * that the title and the line under it grow with the reader's setting and a minimum
   * computed from them would be a second guess at a number `Row` already owns.
   *
   * The first reading with real artwork measured what that bought. The plate is 260 points
   * of a 304-point front, so the floor sat 44 points under the thing it was meant to match
   * and could not bind; and with a real synopsis in it the back had gone the other way, to
   * **330** — `r4-discover` scrolls 2720pt against `r4-discover-back`'s 2746, twenty-six
   * points of shelf appearing under the thumb. The same defect the floor was written for,
   * from the other side, with the floor still in the file describing a fix the screen did
   * not show.
   *
   * The argument against computing the height was right, and the answer is not to compute
   * it: `onLayout` on the front hands back the row's own height, already scaled, already
   * stretched, with no second guess at anything. The web has had exactly this from its grid
   * — the back is `h-full` — since the shelf was built.
   *
   * `width / BOX.ratio` survives as the value before a face has ever been laid out, which
   * on this screen cannot happen: a box is turned over by pressing its front.
   */
  back: {
    gap: 6,
    padding: 12,
    borderRadius: radius.plate,
    backgroundColor: theme.groundRaised,
  },
  /**
   * The room the synopsis is measured in, and clipped by.
   *
   * `flex: 1` is what makes the ground a thing that can be measured at all: the panel has a
   * height now, so this child is handed whatever the title, the fact line and the four
   * controls did not take, and `onLayout` reports it. `overflow: 'hidden'` covers the one
   * layout pass between that measurement and the `numberOfLines` it produces.
   */
  ground: { flex: 1, overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  /**
   * The two ways off the back: to the title's page, and back to the front.
   *
   * The web gets this row from `flex flex-wrap items-center gap-4` and the gap is the same
   * number on both — 16, `space.s16` — because these are two words side by side in a
   * 173-point box and a smaller gap makes them read as one phrase.
   */
  ways: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
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
