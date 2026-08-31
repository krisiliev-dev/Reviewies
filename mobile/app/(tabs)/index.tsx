import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getHistory,
  getUpNext,
  markWatched,
  unwatchLatest,
  unmatchedImportCount,
  type UpNextEntry,
} from '@reviewies/core/data/repo';
import { openCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { requestFill } from '@reviewies/core/calendar/refresh';
import { getUpcoming } from '@reviewies/core/calendar/upcoming';
import { formatDay } from '@reviewies/core/time';
import { db } from '@reviewies/core/data/db';
import { Poster } from '../../src/ui/Poster';
import { CatchUp } from '../../src/ui/CatchUp';
import { ImportFiles, ImportFormats } from '../../src/ui/ImportFiles';
import { MatchImports } from '../../src/ui/MatchImports';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { REACH, tap, theme } from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';
import { useImporting } from '../../src/useImporting';
import { Button } from '../../src/ui/Button';
import { Choice } from '../../src/ui/Choice';
import { CrossOff } from '../../src/ui/CrossOff';
import { Row as BaseRow } from '../../src/ui/Row';
import { Masthead } from '../../src/ui/Masthead';
import { Coming } from '../../src/ui/Coming';
import { Past } from '../../src/ui/Past';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';
import { UP_NEXT_VIEWS, VIEW_PARAM, viewFrom, type UpNextView } from '@reviewies/core/ui/segments';

/**
 * The home screen, and the one the whole product is judged on.
 *
 * From r/tvtime, stated more forcefully than any other requirement:
 * "The only important thing in an app is that it opens directly to the page where I
 * can see and mark the next episodes of my shows."
 *
 * So: no dashboard, no feed, no onboarding carousel. The list, and a button. Same
 * rule as the web version, and the logic behind it is the same code.
 *
 * ## It has three jobs now, and it had one
 *
 * `docs/design/architecture.md` sections 3 and 4. The past goes **above** the present, and what is
 * **coming** is this screen's second half rather than a seventh destination called Upcoming
 * that nobody could tell apart from the Watchlist. The sentence above still governs both:
 * the list is what the screen opens on, which is what `present` below is for.
 */
export default function UpNextScreen() {
  const params = useLocalSearchParams<{ on?: string }>();
  const on = viewFrom(params[VIEW_PARAM]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Body on={on} />
    </SafeAreaView>
  );
}

/**
 * The masthead, the two chips, and whichever half is showing.
 *
 * The scroll lives here rather than in each half, because the past and the present are one
 * scrolling column and the arrival position is measured across both. §6.157's finding is
 * why the segment is in the address rather than in state alone: a state reachable only by
 * pressing is a state the design record loses.
 */
function Body({ on }: { on: UpNextView }) {
  /*
   * The column, held here and handed down.
   *
   * React Native has no `scrollIntoView` and no way for a child to reach the scrolling
   * ancestor it happens to be inside, so the handle travels as a prop. One column, owned by
   * the component that renders it — the alternative is a context provider for a single
   * value, or a module-level handle that outlives the screen and is wrong the second time
   * anybody mounts two of them.
   */
  const column = useRef<ScrollView>(null);
  /*
   * How tall the column is, which is how much trailing room the present needs under it.
   *
   * `Present`'s header carries the decision; this is the measurement it needs, and it is
   * taken here because this is the component that owns the view being measured. A number
   * rather than `Dimensions.get('window')`: the tab bar, the header and both safe areas are
   * outside this `ScrollView`, so its own layout height is the only figure that is a
   * *screenful of this column* rather than a screenful of the device.
   *
   * `onLayout` is safe for this where it was not safe for the arrival, and the difference is
   * exactly the one `Present` records below: on `react-native-web` a layout event is a
   * `ResizeObserver`, which reports a **size** faithfully and a position never. This asks it
   * for a size. React bails out of a re-render when the value is unchanged, so a layout that
   * repeats costs nothing.
   */
  const [frame, setFrame] = useState(0);
  return (
    <ScrollView
      ref={column}
      contentContainerStyle={styles.content}
      onLayout={(event) => setFrame(event.nativeEvent.layout.height)}
    >
      <Masthead>{COPY.screens.upNext}</Masthead>
      <Choice<UpNextView>
        name={COPY.upNext.showing}
        options={UP_NEXT_VIEWS}
        value={on}
        // The key is always written, including for the default: `setParams` cannot remove
        // one, and a web that dropped it and a phone that could not would be two addresses
        // for one state. `segments.ts` owns the spelling for both.
        onChange={(next) => router.setParams({ [VIEW_PARAM]: next })}
      />
      {on === 'coming' ? <Coming /> : <OutNow column={column} frame={frame} />}
    </ScrollView>
  );
}

type Column = RefObject<ScrollView | null>;

/** The half this screen opens on: what you have watched, what is next, and how to mark it. */
function OutNow({ column, frame }: { column: Column; frame: number }) {
  const entries = useLive(() => getUpNext(), []);
  const libraryCount = useLive(() => db.library.count(), []);
  // Owned by the screen rather than by the row that opens it. A catch-up completes by
  // removing its own row from Up Next, so a sheet living inside that row unmounts at
  // the exact moment it has something to tell you.
  const [catchingUp, setCatchingUp] = useState<{ seriesId: string; seriesName: string }>();
  // Held until dismissed rather than swapped out the moment the library stops being
  // empty. Importing puts shows in the library, which is exactly what stops this being
  // the first-run screen — and took the confirmation with it.
  const [imported, setImported] = useState<ImportReport>();
  // Not an episode count: an import now writes the episodes it knows were watched, so
  // "no episodes" stopped meaning "nothing matched" the moment that landed.
  const unmatched = useLive(() => unmatchedImportCount(), []);
  /**
   * What is coming, but only when there is nothing to watch. §6.164.
   *
   * `getUpcoming` walks every tracked show's episodes, which on the 1,220-episode library
   * §6.156 measured is not free — so it is asked only in the branch that needs it. The
   * dependency is the *count* rather than the array, because depending on the array would
   * re-run this on every mark.
   */
  const waiting = useLive(
    async () => (entries && entries.length === 0 ? (await getUpcoming())[0] : undefined),
    [entries?.length],
  );
  // Still working is a third thing, distinct from empty and from unreadable. §6.80.
  const importing = useImporting();

  /**
   * A show can be in the library before its episodes are. §6.154, and `requestFill`
   * carries the reasoning: the four adding sites report `Tracking` and fetch afterwards,
   * so the fetch is no longer guaranteed to finish. This is the screen where that shows —
   * an empty Up Next for a show you just added — and so it is the screen that closes it.
   */
  useEffect(() => {
    void requestFill();
  }, []);

  if (entries === undefined) {
    return <ActivityIndicator color={theme.workingMark} style={styles.loading} />;
  }

  if (imported) {
    /*
     * No `Past` above it, and that is a decision rather than an oversight: the import has
     * just written a few hundred watches, so the history is at its longest exactly here,
     * and burying the one confirmation somebody came for under forty struck rows would
     * undo what this panel is for. The past is drawn on the two branches that mean *you
     * have a library*, which this one is the minute before.
     */
    return (
      <View style={styles.empty}>
        <Masthead level="sub">{COPY.upNext.historyIsIn}</Masthead>
        <Text style={styles.emptyText}>
          Imported {imported.watches} watch{imported.watches === 1 ? '' : 'es'}
          {imported.watchlist > 0 ? `, ${imported.watchlist} watchlist items` : ''}.
        </Text>
        {/* An export carries no provider IDs, so what has landed is a set of shows
            with no artwork, no air dates and no episode lists beyond what was
            watched. Matching them is offered here rather than mentioned, because
            here is where somebody is standing. */}
        <Text style={styles.emptyText}>{COPY.upNext.importedExplained}</Text>
        {/* Not auto-started here: this panel has just explained what matching is
            for, and starting it underneath that explanation would talk over
            itself. Up Next runs it without asking once this is dismissed. */}
        <MatchImports autoStart={false} />
        <Pressable
          onPress={() => setImported(undefined)}
          style={tap}
          hitSlop={REACH.inline}
          accessibilityRole="button"
        >
          <Text style={styles.later}>{COPY.controls.later}</Text>
        </Pressable>
      </View>
    );
  }

  if (entries.length === 0 && libraryCount === 0) {
    /**
     * The first minute.
     *
     * This app exists because TV Time shut down, and what it said to someone
     * arriving with years of history in a zip was "Nothing tracked yet" and a
     * search box — the import that would have rescued all of it two taps away
     * behind a tab called Data. So the migration is the offer, and searching is
     * the alternative rather than the other way round.
     */
    return (
      <View style={styles.empty}>
        <Masthead level="sub">{COPY.upNext.bringHistory}</Masthead>
        <Text style={styles.emptyText}>{COPY.upNext.tvTimeGone}</Text>
        <ImportFormats />
        <ImportFiles label={COPY.controls.importFromTvTime} onImported={setImported} primary />
        <Text style={styles.emptyText}>{COPY.upNext.nothingToImport}</Text>
        {/* The secondary of the two. It was the bright one and the import was the
            muted one — the opposite of what this screen is for. The web had the
            same inversion, and neither was visible to any check: both controls were
            named, reachable and big enough. */}
        <Button
          to="/discover"
          tone="secondary"
          size="page"
          label={COPY.controls.findToWatch}
          name={COPY.controls.findToWatch}
        />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <Present column={column} frame={frame} writing={importing || unmatched}>
        <View style={styles.empty}>
          {/* Three states, not two. This screen used to say "Nothing here yet. N shows
              came from an import and have no episode lists until they are matched" —
              the web's pre-doc-10 §4 sentence, which reads as a chore and which the
              web stopped saying a long time ago. §6.80 found it still here, and found
              the third state underneath it: for five and a half seconds of a 266-row
              import, N was a count still growing and the button below matched a
              library that was still being written. */}
          <Text style={styles.emptyText}>
            {importing
              ? COPY.upNext.stillImporting(importing)
              : unmatched
                ? COPY.upNext.matchingImport(unmatched)
                : waiting
                  ? COPY.upNext.caughtUpWaiting(waiting.seriesName, formatDay(waiting.day))
                  : COPY.upNext.allCaughtUp}
          </Text>
          {/* Offered where the gap is felt, not filed under a settings screen — but
              never over an import still in flight. */}
          {unmatched && !importing ? <MatchImports /> : null}
          {/*
            The offer follows the state. §6.162, §6.164.

            `02a-import-reading.png` was the first photograph of the importing state and it
            showed one sentence — "Still reading your TV Time export" — under a **filled
            primary** reading *Find something to watch*: the app carrying somebody's history
            across while the loudest thing on screen invited them to leave. First run gets
            this right, where searching is explicitly the alternative to importing; here one
            Button served every state and the loudest tone won.

            §6.164 found the same shape one state over. Caught up **and waiting** is the case
            where what is coming is the answer — and since `architecture.md` section 4 it is the
            other half of *this* screen rather than a screen away behind More, so the offer
            changes the segment instead of navigating.

            Searching is never removed: leaving is allowed and this screen would be a dead
            end without it. It stops being the offer, which is what a tone is for.
          */}
          {waiting && !importing && !unmatched ? (
            <Button
              onPress={() => router.setParams({ [VIEW_PARAM]: 'coming' satisfies UpNextView })}
              tone="primary"
              size="page"
              label={COPY.upNext.seeUpcoming}
              name={COPY.upNext.seeUpcoming}
            />
          ) : null}
          <Button
            to="/discover"
            tone={importing || waiting ? 'secondary' : 'primary'}
            size="page"
            label={COPY.controls.findToWatch}
            name={COPY.controls.findToWatch}
          />
        </View>
      </Present>
    );
  }

  return (
    <Present column={column} frame={frame} writing={importing || unmatched}>
      {/*
        Here too, and this is the whole point of the second copy.

        The offer used to live only in the empty branch above, and the comment
        beside it already said what that costs — "matching what has landed so far
        leaves the rest of the import behind it, unmatched and unoffered". It does,
        and worse: the first show to match produces an entry, the screen leaves the
        empty branch, that panel unmounts, and the shows still waiting have nowhere
        in the app to be matched from. A control offered only while it is not needed.

        Measured after importing the demo library: the calendar read "2 imported
        shows still need matching" and this screen showed one matched show and no
        way to match the other two. Those two were asks — ambiguous matches — which
        is not a race that resolves itself but a state that lasts until answered.
      */}
      {unmatched && !importing ? <MatchImports /> : null}
      {entries.map((entry) => (
        <Row key={entry.seriesId} entry={entry} onCatchUp={setCatchingUp} />
      ))}

      {catchingUp && (
        <CatchUp
          seriesId={catchingUp.seriesId}
          seriesName={catchingUp.seriesName}
          onDone={() => setCatchingUp(undefined)}
        />
      )}
    </Present>
  );
}

/**
 * The past above, the present below, and the screen arriving at the present.
 *
 * `docs/design/architecture.md` section 3, and the web's twin carries the argument: both
 * requirements are real and they do not conflict. The history belongs *up*; the app has to
 * open on the episodes you can mark. So the layout puts one above the other and this
 * scrolls past it once, on arrival.
 *
 * **Once**, guarded by a ref rather than by a dependency list, and this matters more here
 * than on the web: `useLive` re-runs every query in the app on *any* write, because
 * expo-sqlite's change listener fires per statement. Without the guard, crossing an episode
 * off would yank the column back to a position that had just changed under it — on the one
 * action this product exists for, on the platform it is now built around.
 *
 * `onLayout` rather than a measured ref: React Native has no `scrollIntoView`, and the y a
 * layout event reports is already relative to the `ScrollView`'s content. `animated: false`
 * because an arrival that slides is a screen that moves while you are reading it.
 */
/**
 * ## Not while the library is being written
 *
 * `importing` is not a nicety and it is not only about cost. §6.80's third state is
 * "still working", and a past drawn over an import is a list that reorders under you at
 * three hundred rows a second — a *history* whose whole claim is that it is the order
 * things happened in, redrawn faster than anybody can read it.
 *
 * The cost is real too, and it is the phone's. `useLive` re-runs **every** query in the
 * app on any write, because expo-sqlite's change listener fires per statement — its own
 * header says so — so a 266-row import ran `getHistory` a few hundred times, each walking
 * forty watches and their titles. `mobile/smoke.mjs` measured the result: the import stopped
 * landing inside the ten seconds that suite samples for, on a build where the web's
 * equivalent was unaffected. `docs/design/architecture.md` section 9 named this screen's
 * length as the risk to look at first; this is the first place it bit.
 */
/**
 * ## The trailing room, which is what makes the arrival possible at all
 *
 * `scrollTo` does not fail when it is asked for more than the column has; it clamps, and a
 * clamp reads exactly like an arrival if you only look at the number it left behind. Up
 * Next's past is capped but long and its present is a few rows, so the ask was almost always
 * past the end and the screen came to rest at the bottom of itself with the present still
 * most of a screen down.
 *
 * Measured on the export, and the bound is quoted with it because the whole reason this is
 * being repaired is that once it was not: **`scrollTop 359` of a possible `359`** — the
 * entire range — with ten struck rows above the first one that could be marked. The web's
 * twin read `450 of a possible 450, the present 615pt down an 844pt frame`.
 * `architecture.md` section 8 had recorded that first figure alone as proof the screen
 * arrived; a number without the bound it is being compared against cannot tell an arrival
 * from an end-stop, and this one was an end-stop.
 *
 * ## A floor, not a spacer
 *
 * What the arrival needs is that the present be at least as tall as the frame it is being
 * scrolled to the top of. Spelled as a trailing **spacer** that would add an empty screen to
 * every Up Next, including the fifty-row one `architecture.md` section 9 names as the thing
 * to watch; spelled as a **floor** it is inert exactly there, because a present that already
 * fills the frame needs nothing added. The three states, and the price of each:
 *
 * - **Many rows** — inert, nothing added, nothing to scroll past.
 * - **One live row** — the row lands at the top with about a screen of quiet under it. That
 *   is the cost, and the thing it buys is the row not being two thirds of the way down a
 *   screen of things already crossed off.
 * - **Caught up** — a repair rather than a cost. This state arrived 47pt short of its own
 *   bottom and clipped *Find something to watch* under the tab bar; against a floor there is
 *   nothing left to clip.
 *
 * No past, no floor: nothing is being scrolled past, so there is no arrival to make room for,
 * and a floor there would only make a short screen scrollable for nothing.
 *
 * The frame is `Body`'s measurement of its own `ScrollView` rather than the window, because
 * the tab bar, the header and both safe areas are outside it. The web writes the same
 * decision as `min-h-dvh`, which is the nearest thing that renderer has to "a screenful".
 */
function Present({
  column,
  frame,
  writing,
  children,
}: {
  column: Column;
  /** One screenful of *this column*, measured by `Body` off the `ScrollView` it owns. */
  frame: number;
  /** Truthy while the library is still arriving: an import in flight, or rows to match. */
  writing?: string | number;
  children: ReactNode;
}) {
  /*
   * One query, here, rather than one inside `Past` and another to decide when to scroll.
   * The condition for the scroll is the data and not a timer: `useLive` answers on a later
   * tick, so a layout pass that fired before the rows existed would spend the one arrival
   * on a column with nothing above it and leave the screen at the top for ever — the same
   * screen as not scrolling at all, and considerably harder to notice.
   */
  const past = useLive(async () => (writing ? [] : getHistory()), [writing]);
  const marker = useRef<View>(null);
  const arrived = useRef(false);

  /**
   * Where the present begins, measured against the column rather than reported by a layout
   * event — and this took a browser to find out.
   *
   * The first version read `event.nativeEvent.layout.y` straight off `onLayout`, which is
   * what that field is for on a device. On `react-native-web` it is **always 0**: the
   * implementation reports a `ResizeObserver` entry's `contentRect`, whose `x` and `y` are
   * the element's own padding offsets rather than its position in anything. So the guard
   * below (`y <= 0`) declined to scroll, every time, and the phone's export arrived at the
   * top of the past while the web arrived at the present.
   *
   * Nothing in this repository could have said so. It is not a type error, not a rule any
   * source guard states, and `phoneTextScaling.test.ts`'s neighbours are all about what the
   * source *says*. It was found by serving the export and reading `scrollTop` — a number,
   * because "it looked fine" is not an answer to a question about a scroll position, and
   * `docs/design/on-a-device.md` opens with exactly that sentence.
   *
   * `measureLayout` is the API that means what this needs on **both** platforms: on a device
   * it walks the shadow tree, and on the web `react-native-web` implements it with two
   * `getBoundingClientRect`s and a subtraction, which is correct. Measured against the
   * scroll view's *inner* node — the content view — because a `scrollTo` is in content
   * coordinates and the outer node is the window onto them.
   *
   * ## And it is run from an effect, not from `onLayout`
   *
   * The second half of the same finding, and the export said so twice before it was heard.
   * `onLayout` looks like the right trigger — something moved, measure it — and on a device
   * it is one, because a layout event fires when a view's *position* changes. On
   * `react-native-web` it is a `ResizeObserver`, which fires when a view's **size** changes
   * and never when it merely moves. This wrapper's size does not change when the past
   * arrives above it; only its position does. So the observer fired once, before the query
   * had answered, and never again.
   *
   * An effect with no dependency list runs after **every** commit, including the one that
   * draws the past, which is exactly the signal this needs — and it is what the web's twin
   * has always done, for no better reason than that the web has no `onLayout` to be tempted
   * by. `arrived` is what keeps it to one.
   */
  const arrive = () => {
    /*
     * `!frame` is the third condition and it is the same rule as `!past?.length`: do not
     * spend the one arrival before the thing it depends on exists. The room under the
     * present is `frame` tall, so a scroll taken before the first layout would be a scroll
     * into a column that has not been given anywhere to go — and `arrived` would then refuse
     * the one that could have worked.
     */
    if (arrived.current || !past?.length || !frame) return;
    const node = column.current;
    const view = marker.current;
    if (!node || !view) return;
    const inner = (node as unknown as { getInnerViewNode?: () => unknown }).getInnerViewNode?.();
    view.measureLayout(
      (inner ?? node) as never,
      (_x, y) => {
        // Nothing above the present is nothing to scroll past, and consuming the one
        // arrival on that would leave the screen at the top for ever.
        if (y <= 0) return;
        arrived.current = true;
        node.scrollTo({ y, animated: false });
      },
      // A measurement that cannot be taken leaves the screen where it is, which is the
      // behaviour this whole component is an improvement on rather than a dependency of.
      () => {},
    );
  };

  // Every commit, and `arrive` is what makes it once. See above for why this is not
  // `onLayout`.
  useEffect(arrive);

  return (
    <>
      <Past entries={past} />
      {/*
        The floor, and only where there is a past to scroll past — see the header. This is
        what turns a `scrollTo` that used to clamp into one the column can actually honour.
      */}
      <View ref={marker} style={past?.length ? { minHeight: frame } : undefined}>
        {children}
      </View>
    </>
  );
}

function Row({
  entry,
  onCatchUp,
}: {
  entry: UpNextEntry;
  onCatchUp: (series: { seriesId: string; seriesName: string }) => void;
}) {
  const { episode } = entry;
  const router = useRouter();
  /**
   * Which episode this row's ring was last filled for, so that the fill is a confirmation
   * of something rather than a decoration.
   *
   * The row is keyed by series and its `episode` becomes the *next* one the moment the
   * query re-runs, so a plain boolean would carry the mark across onto an episode nobody
   * has watched. Holding the id instead makes it self-clearing: it stops matching the
   * second the list moves on. It is also what undo has to name — `unwatchLatest` on the
   * episode now in the row would take back the wrong one.
   *
   * The `busy` flag this replaces put a disabled state on the most-pressed control in the
   * product while a local SQLite write completed. `crossOff.ts` says why there is no such
   * state: a control that waits claims the app is asking somebody's permission.
   */
  const [markedId, setMarkedId] = useState<string>();
  const justMarked = markedId === episode.id;

  function onWatched() {
    // Optimistic by construction: the write goes to SQLite and the change listener
    // re-runs the query. Nothing waits on a network round-trip, and nothing here
    // awaits it either.
    void markWatched({
      targetId: episode.id,
      seriesId: entry.seriesId,
      runtimeMin: episode.runtimeMin,
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMarkedId(episode.id);

    // How TV Time worked, and named as a failing in two of its successors. Only when
    // there is an account behind it — otherwise there is no conversation to open and
    // this would be a dead end. Catching up in bulk uses its own control, which never
    // navigates, so this cannot interrupt a run of episodes.
    //
    // The web has done this since it shipped; the phone, which is the platform this
    // product is now built around, quietly did not.
    if (openCommentsAfterWatch() && syncConfigured()) {
      router.push(`/comments/${encodeURIComponent(episode.id)}`);
    }
  }

  function undoMark() {
    // The id, not `episode.id`: by now the row is showing the next episode.
    if (markedId) void unwatchLatest(markedId);
    setMarkedId(undefined);
  }

  const code = episodeCode(episode.season, episode.number);
  const named = episodeName(episode.name, episode.number);

  return (
    <BaseRow
      title={entry.seriesName}
      code={code}
      meta={named}
      // A count, not a vague "NEW" badge — the most repeated complaint on Trakt's roadmap.
      // In `count` rather than `tag`: this was `17 MORE` for one sprint, and a number
      // whose unit has been shortened away to fit a pill is the badge it was replacing.
      count={
        entry.remaining === 0
          ? COPY.upNext.lastOne
          : `${entry.remaining} more episode${entry.remaining === 1 ? '' : 's'}`
      }
      lead={
        <Poster
          url={entry.posterUrl}
          name={entry.seriesName}
                  />
      }
      open={{
        // The poster used to be the only target and the words beside it were not one.
        name: [`Open ${entry.seriesName}`, code, named].filter(Boolean).join(', '),
        to: `/title/${encodeURIComponent(entry.seriesId)}`,
      }}
      trailing={
        /* Was a filled "Watched" pill that disabled itself for the length of a local
           write, with its undo a screen away. The ring is the same tap in the dark,
           one-handed, and the way back is beside it. */
        <CrossOff
          watched={justMarked}
          name={
            justMarked
              ? `Unmark ${entry.seriesName} ${code}`
              : `Mark ${entry.seriesName} ${code} watched`
          }
          onChange={(next) => (next ? onWatched() : undoMark())}
          onUndo={undoMark}
          undoName={`Undo marking ${entry.seriesName} ${code} watched`}
        />
      }
      under={
        /* Two controls that are about the row rather than beside it, which is what the
           `under` slot is for. "Caught up further?" sat *inside the words* before, so the
           row's one navigation target had a second control nested in it. */
        <View style={styles.under}>
          {/* Quiet, because it is the exception. Coming back to a show after a week away
              and marking six episodes one at a time is the thing this avoids. */}
          <Button
            size="inline"
            tone="quiet"
            label={COPY.controls.catchUp}
            name={COPY.controls.catchUpOn(entry.seriesName)}
            onPress={() => onCatchUp({ seriesId: entry.seriesId, seriesName: entry.seriesName })}
          />

          {/* Watching Mode, from the screen somebody is actually on.
              *
              * It was reachable on the phone only from a title page — open the show,
              * find the episode, tap there — while the web has offered it in this row
              * since it shipped. The differentiator of the product, three taps deep on
              * the platform the product pivoted to be. Doc 10, second evening. */}
          <Button
            size="inline"
            tone="quiet"
            to={`/watching/${encodeURIComponent(episode.id)}`}
            label={COPY.controls.watchAlong}
            name={`Watch along with ${entry.seriesName} ${code}`}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground },
  loading: { marginTop: 48 },
  content: { padding: SCREEN.edge, gap: 8 },

  empty: { gap: 16, paddingTop: 8 },
  // s20/semibold, the same step and weight as the web's `<h2>` under the screen title.
  // It was 700, which put two bolds one under the other — the title and the sentence
  // beneath it competing rather than ranking.
  later: { color: theme.inkSecondary, fontSize: text.s14, textDecorationLine: 'underline', fontFamily: type.family.body.name },
  emptyText: { color: theme.inkSecondary, fontSize: text.s16, fontFamily: type.family.body.name },
  // Written out in full rather than as `[cta, ctaQuiet]`. This sits inside a
  // `<Link asChild>`, which clones its child and merges props — and an array style
  // through that path reached the DOM as an index-keyed object, which React refuses to
  // set. The export booted to a blank page; the smoke suite caught it.

  // Right-aligned, not stretched. `alignItems: 'stretch'` put the 44pt ring at the *left*
  // edge of the action column with a full-width pill under it, so the one control meant to
  // be in the same place on every row of every list was floating in the middle of the row.
  under: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },

});
