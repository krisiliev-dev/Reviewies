import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
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
import { tap, theme } from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';
import { useImporting } from '../../src/useImporting';
import { Button } from '../../src/ui/Button';
import { CrossOff } from '../../src/ui/CrossOff';
import { Row as BaseRow } from '../../src/ui/Row';
import { Masthead } from '../../src/ui/Masthead';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';

/**
 * The home screen, and the one the whole product is judged on.
 *
 * From r/tvtime, stated more forcefully than any other requirement:
 * "The only important thing in an app is that it opens directly to the page where I
 * can see and mark the next episodes of my shows."
 *
 * So: no dashboard, no feed, no onboarding carousel. The list, and a button. Same
 * rule as the web version, and the logic behind it is the same code.
 */
export default function UpNextScreen() {
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
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ActivityIndicator color={theme.workingMark} style={styles.loading} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Masthead>{COPY.upNext.name}</Masthead>

        {/* §6.64's undo — the row can change under the press when two devices are racing,
            and the ordinary mis-tap needs the same way back — used to be a banner here,
            a screen away from the tap that caused it and above a list that had already
            reflowed. It sits beside the ring now, within reach of the thumb that made the mark. */}

        {imported ? (
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
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.later}>Later</Text>
            </Pressable>
          </View>
        ) : entries.length === 0 && libraryCount === 0 ? (
          /**
           * The first minute.
           *
           * This app exists because TV Time shut down, and what it said to someone
           * arriving with years of history in a zip was "Nothing tracked yet" and a
           * search box — the import that would have rescued all of it two taps away
           * behind a tab called Data. So the migration is the offer, and searching is
           * the alternative rather than the other way round.
           */
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
              to="/search"
              tone="secondary"
              size="page"
              label={COPY.controls.findToWatch}
              name={COPY.controls.findToWatch}
            />
          </View>
        ) : entries.length === 0 ? (
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
              where the calendar is the answer — the sentence above names the next episode and
              the rest of what is coming is a screen away behind More.

              Searching is never removed: leaving is allowed and this screen would be a dead
              end without it. It stops being the offer, which is what a tone is for.
            */}
            {waiting && !importing && !unmatched ? (
              <Button
                to="/calendar"
                tone="primary"
                size="page"
                label={COPY.upNext.seeUpcoming}
                name={COPY.upNext.seeUpcoming}
              />
            ) : null}
            <Button
              to="/search"
              tone={importing || waiting ? 'secondary' : 'primary'}
              size="page"
              label={COPY.controls.findToWatch}
              name={COPY.controls.findToWatch}
            />
          </View>
        ) : (
          <>
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
          </>
        )}
      </ScrollView>

      {catchingUp && (
        <CatchUp
          seriesId={catchingUp.seriesId}
          seriesName={catchingUp.seriesName}
          onDone={() => setCatchingUp(undefined)}
        />
      )}
    </SafeAreaView>
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
