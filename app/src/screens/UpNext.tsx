import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getHistory,
  getUpNext,
  markWatched,
  unwatchLatest,
  unmatchedImportCount,
  type UpNextEntry,
} from '@reviewies/core/data/repo';
import { db } from '../data/db';
import { Poster } from '../ui/Poster';
import { CatchUp } from '../ui/CatchUp';
import { ImportFiles, ImportFormats } from '../ui/ImportFiles';
import { MatchImports } from '../ui/MatchImports';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { openCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { requestFill } from '@reviewies/core/calendar/refresh';
import { getUpcoming } from '@reviewies/core/calendar/upcoming';
import { formatDay } from '@reviewies/core/time';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { useImporting } from '../useImporting';
import { COPY } from '@reviewies/core/copy';
import { Button } from '../ui/Button';
import { Choice } from '../ui/Choice';
import { CrossOff } from '../ui/CrossOff';
import { Row as BaseRow } from '../ui/Row';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';
import { Coming } from '../ui/Coming';
import { Past } from '../ui/Past';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';
import { UP_NEXT_VIEWS, VIEW_PARAM, viewFrom, type UpNextView } from '@reviewies/core/ui/segments';

/**
 * The home screen, and the one the whole product is judged on.
 *
 * From r/tvtime, stated more forcefully than any other requirement:
 * "The only important thing in an app is that it opens directly to the page where I
 * can see and mark the next episodes of my shows."
 *
 * So: no dashboard, no feed, no onboarding carousel. The list, and a button.
 *
 * ## It has three jobs now, and it had one
 *
 * `docs/design/architecture.md` sections 3 and 4. The past goes **above** the present, because
 * every tracking app people arrived here from puts the evening you have had over the
 * position you are at — and this one, whose subject is a record of attention already spent,
 * had no past at all. And what is **coming** is the screen's second half rather than a
 * seventh destination called Upcoming that nobody could tell from the Watchlist.
 *
 * The sentence above still governs all three. The masthead and the segment control are the
 * only chrome; the list is what the screen opens on, which is what `Present` below is
 * for; and neither of the two new halves is allowed to be the thing you land in.
 *
 * `architecture.md` section 9 is the cost, stated rather than glossed: this is now the longest
 * screen in the product, and if it becomes the screen everything is on, that is where to
 * look first.
 */
export function UpNext() {
  const [params, setParams] = useSearchParams();
  const on = viewFrom(params.get(VIEW_PARAM));

  return (
    <div className="p-s16">
      <Masthead className="px-1">{COPY.screens.upNext}</Masthead>
      {/*
        One screen, two halves — not two screens. The masthead above does not change, the
        tab does not move, and `MORE_INDEX` no longer names the second one. `segments.ts`
        owns the keys, the labels and the order, so the two platforms cannot draw a
        different pair of chips.

        In the address rather than in state alone, so a deep link reaches it and so the
        design harness can photograph it by walking rather than only by pressing — §6.157's
        finding was that every state reachable only through a control is a state the design
        record quietly loses.
      */}
      <div className="mb-4 px-1">
        <Choice<UpNextView>
          name={COPY.upNext.showing}
          options={UP_NEXT_VIEWS}
          value={on}
          // The key is always written, including for the default. `expo-router`'s
          // `setParams` cannot remove one, so a web that dropped it and a phone that could
          // not would be two different addresses for one state — and `segments.ts` exists
          // because two platforms writing their own version of this is how they drift.
          onChange={(next) => setParams({ [VIEW_PARAM]: next }, { replace: true })}
        />
      </div>

      {on === 'coming' ? <Coming /> : <OutNow />}
    </div>
  );
}

/** The half this screen opens on: what you have watched, what is next, and how to mark it. */
function OutNow() {
  // useLiveQuery re-runs on any write to these tables, so marking watched updates
  // the list with no manual invalidation.
  const entries = useLiveQuery(() => getUpNext(), [], undefined);
  const libraryCount = useLiveQuery(() => db.library.count(), [], 0);
  /**
   * The catch-up sheet lives here rather than inside a row, because catching up to
   * the end removes that row from Up Next — and a sheet owned by the row would
   * vanish mid-confirmation, leaving no sign that anything happened.
   */
  const [catchingUp, setCatchingUp] = useState<{ seriesId: string; seriesName: string }>();
  const [imported, setImported] = useState<ImportReport>();
  // Not an episode count: an import now writes the episodes it knows were watched, so
  // "no episodes" stopped meaning "nothing matched" the moment that landed.
  const unmatched = useLiveQuery(() => unmatchedImportCount(), [], undefined);
  // Still working is a third thing, distinct from empty and from unreadable. §6.80.
  const importing = useImporting();

  /**
   * A show can be in the library before its episodes are. §6.154, and `requestFill`
   * carries the reasoning: the four adding sites report `Tracking` and fetch afterwards,
   * so the fetch is no longer guaranteed to finish. This is the screen where that shows —
   * an empty Up Next for a show you just added — and so it is the screen that closes it.
   */
  /**
   * What is coming, but only when there is nothing to watch. §6.164.
   *
   * `getUpcoming` walks every tracked show's episodes, which on the 1,220-episode library
   * §6.156 measured is not free — so it is asked only in the branch that needs it. The
   * dependency is the *count* rather than the array: `useLiveQuery` re-runs on any write to
   * these tables anyway, and depending on the array itself would re-run this on every mark.
   */
  const waiting = useLiveQuery(
    async () => (entries && entries.length === 0 ? (await getUpcoming())[0] : undefined),
    [entries?.length],
    undefined,
  );

  useEffect(() => {
    void requestFill();
  }, []);

  if (entries === undefined) {
    return <Note className="p-6">{COPY.waiting.loading}</Note>;
  }

  /**
   * Just imported.
   *
   * Held until dismissed rather than swapped out the moment the library is no longer
   * empty. The import puts shows in the library, which used to change what this screen
   * renders mid-write and take the result with it — you got no confirmation that the
   * thing you came here to do had worked.
   *
   * No `Past` above it, and that is a decision rather than an oversight: the import has
   * just written a few hundred watches, so the history is at its longest exactly here, and
   * burying the one confirmation somebody came for under forty struck rows would undo what
   * the paragraph above is about. The past is drawn on the two branches that mean *you have
   * a library*, which this one is the minute before.
   */
  if (imported) {
    return (
      <div className="flex flex-col gap-3">
      {/*
       * The arrival line is a heading under the screen's own title.
       *
       * These two states used to `return` a page with no "Up Next" on it at all: the tab
       * bar said one thing and the page said another, and somebody one minute into the app
       * lost the only word telling them where they were. The phone has never done that —
       * it draws the title and puts the arrival heading beneath — and §6.107 widened the
       * gap rather than finding it, by giving the web's `<h1>` the tab-root treatment. A
       * heading that is a *sentence* is not a screen title, and 30/700 read like one.
       *
       * The title is unconditional now, because it is drawn by `UpNext` above this and no
       * branch in here can return without it.
       */}
        <Masthead level="sub">{COPY.upNext.historyIsIn}</Masthead>
        <p>
          Imported {imported.watches} watch{imported.watches === 1 ? '' : 'es'}
          {imported.watchlist > 0 && `, ${imported.watchlist} watchlist items`}.
        </p>
        {/* An export carries names and dates and no provider IDs, so what has landed is
            a set of shows with no artwork, no air dates and no episode lists beyond what
            was watched. Matching them is the next thing to do, and it is offered here
            rather than mentioned, because here is where somebody is standing. */}
        <Note>{COPY.upNext.importedExplained}</Note>
        {/* Not auto-started here: this panel has just explained what matching is for, and
            starting it underneath that explanation would talk over itself. The Up Next
            screen below runs it without asking. */}
        <MatchImports autoStart={false} />
        <button
          onClick={() => setImported(undefined)}
          className="tap self-start text-s14 text-ink-secondary underline"
        >{COPY.controls.later}</button>
      </div>
    );
  }

  // Caught up is a different screen from never started, and only one of them is
  // somebody's first minute with the app.
  if (entries.length === 0 && libraryCount !== 0) {
    return (
      <Present writing={importing || unmatched}>
        <div className="pt-2">
        {/* Three states, not two. "Nothing here yet … until they are matched" plus a
            button was what somebody saw after importing years of history: an empty
            screen and a chore, so matching runs itself now and the sentence says what
            is happening (doc 10 §4). §6.80 found the third: while the import is still
            running, both of those are claims about a library that is still being
            written, and the count in them keeps changing. */}
        <Note>
          {importing
            ? COPY.upNext.stillImporting(importing)
            : unmatched
              ? COPY.upNext.matchingImport(unmatched)
              : waiting
                ? COPY.upNext.caughtUpWaiting(waiting.seriesName, formatDay(waiting.day))
                : COPY.upNext.allCaughtUp}
        </Note>
        {/* Run where the gap is felt, not filed under a settings screen — but never
            over a library still being written. Matching what has landed so far leaves
            the rest of the import behind it, unmatched and unoffered. */}
        {unmatched && !importing ? <MatchImports /> : null}
        {/*
          Secondary while the import is running. §6.162.

          `02a-import-reading.png` is the first photograph anyone has taken of this state, and
          it shows one sentence — "Still reading your TV Time export" — under a **filled
          primary** button reading *Find something to watch*. The app is busy carrying
          somebody's history across and the loudest thing on the screen invites them to leave.
          First run gets this right, where searching is explicitly the alternative to
          importing; here one Button served all three states and the loudest tone won.

          Not removed — leaving is allowed and the screen would be a dead end without it. It
          stops being the offer, which is what a tone is for.
        */}
        {/*
          The offer follows the state. §6.164.

          Caught up **and waiting** is the one case where what is coming is the answer: the
          sentence above names the next episode, and the rest of it is now the other half of
          this same screen rather than a screen away behind More. So the offer is a segment
          change rather than a navigation — `docs/design/architecture.md` section 4 — which is also
          why it is `onPress` and not `to`.
        */}
        {waiting && !importing && !unmatched && <SeeUpcoming />}
        <Button
          to="/discover"
          tone={importing || waiting ? 'secondary' : 'primary'}
          size="page"
          label={COPY.controls.findToWatch}
          name={COPY.controls.findToWatch}
          className="mt-5"
        />
        </div>
      </Present>
    );
  }

  /**
   * The first minute.
   *
   * This app exists because TV Time shut down, and for a long time the first thing it
   * said to somebody arriving with years of history in a zip file was "Nothing tracked
   * yet" and a search box. The import that would have rescued all of it was two taps
   * away on a tab called Data — a word nobody in that position would think to open.
   *
   * So the migration is the offer, and searching is the alternative rather than the
   * other way round.
   */
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {/* A heading under the screen's own title — see the note on the arrival state. */}
        <Masthead level="sub">{COPY.upNext.bringHistory}</Masthead>
        <Note>{COPY.upNext.tvTimeGone}</Note>
        <ImportFormats />
        <ImportFiles label={COPY.controls.importFromTvTime} onImported={setImported} primary />
        <Note className="mt-2 px-1">{COPY.upNext.nothingToImport}</Note>
        {/* The secondary of the two. It was the bright one and the import was the muted
            one, which is the opposite of what this screen is for — the migration is the
            offer and searching is the fallback. Nothing but looking at it would have
            said so: both were named, both were reachable, both were big enough. */}
        <Button
          to="/discover"
          tone="secondary"
          size="page"
          label={COPY.controls.findToWatch}
          name={COPY.controls.findToWatch}
          className="self-start"
        />
      </div>
    );
  }

  return (
    <Present writing={importing || unmatched}>
      {/*
        Here too, and this is the whole point of the second copy.
        *
        * The offer used to live only in the branch above — the one that renders when Up
        * Next is *empty* — and the comment beside it already said what that costs:
        * "matching what has landed so far leaves the rest of the import behind it,
        * unmatched and unoffered". It does, and worse than the sentence suggests. The
        * first show to match produces an Up Next entry, the screen leaves the empty
        * branch, this panel unmounts, and the shows still waiting have nowhere in the
        * app to be matched from. A control offered only while it is not needed.
        *
        * Measured: after importing the demo library the calendar read "2 imported shows
        * still need matching" and Up Next showed one matched show and no way to match
        * the other two. Those two were asks — ambiguous matches — which is not a race
        * that resolves itself but a state that lasts until somebody answers it.
      */}
      {unmatched && !importing ? <MatchImports /> : null}

      {/* §6.64's undo — two tabs racing at the same button showed the row changing under
          the click, and the mis-tap needs the same way back — used to be a banner here,
          two hundred points from the tap that caused it and above a list that had already
          reflowed. It sits beside the ring now, within reach of the thumb that made the mark. */}

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <UpNextRow key={entry.seriesId} entry={entry} onCatchUp={setCatchingUp} />
        ))}
      </ul>

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
 * `docs/design/architecture.md` section 3. Both requirements are real and they are not in
 * conflict: the history belongs *up*, and the app has to open on the episodes you can mark.
 * So the layout puts one above the other and this scrolls past it once, on arrival — which
 * is how a transcript works, and an evening's watching is a transcript.
 *
 * **Once**, guarded by a ref rather than by a dependency list. `useLiveQuery` re-renders
 * this subtree on every write in the app, and marking an episode is a write: without the
 * guard, crossing something off would yank the page back to a position that had just
 * changed under it, on the one action the product exists for.
 *
 * `block: 'start'` on a marker rather than `scrollTop = n` on the container: the scroll is
 * owned by `<main>` in `App.tsx`, three components up, and a screen reaching for it by
 * selector is a screen that breaks when the shell changes. `behavior` is left at the
 * default — an animated scroll on arrival is a screen that moves while you are reading it.
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
function Present({
  writing,
  children,
}: {
  /** Truthy while the library is still arriving: an import in flight, or rows to match. */
  writing?: string | number;
  children: React.ReactNode;
}) {
  /*
   * The history is asked for here rather than inside `Past`, and it is one query rather
   * than two. The scroll has to wait for the rows it is scrolling past — `useLiveQuery`
   * answers on a later tick, so an effect that fired on the first render would scroll a
   * column with nothing above it, spend its one arrival, and leave the screen at the top
   * for ever. That is the same screen as not scrolling at all and considerably harder to
   * see, so the condition is the data rather than a timer.
   */
  const past = useLiveQuery(async () => (writing ? [] : getHistory()), [writing], undefined);
  const present = useRef<HTMLDivElement>(null);
  const arrived = useRef(false);

  useEffect(() => {
    if (arrived.current || !past?.length) return;
    arrived.current = true;
    present.current?.scrollIntoView({ block: 'start' });
  });

  return (
    <>
      <Past entries={past} />
      <div ref={present}>{children}</div>
    </>
  );
}

/**
 * The way to the other half, from the state that needs it.
 *
 * Its own component because it needs the search params and the branch that draws it is
 * three levels of condition deep. `replace`, so that pressing this and then going back
 * does not walk through a segment change.
 */
function SeeUpcoming() {
  const [, setParams] = useSearchParams();
  return (
    <Button
      onPress={() => setParams({ [VIEW_PARAM]: 'coming' as UpNextView }, { replace: true })}
      tone="primary"
      size="page"
      label={COPY.upNext.seeUpcoming}
      name={COPY.upNext.seeUpcoming}
      className="mt-5"
    />
  );
}

function UpNextRow({
  entry,
  onCatchUp,
}: {
  entry: UpNextEntry;
  onCatchUp: (series: { seriesId: string; seriesName: string }) => void;
}) {
  const { episode } = entry;
  const navigate = useNavigate();

  /**
   * Which episode this row's ring was last filled for, so that the fill is a confirmation
   * of something rather than a decoration.
   *
   * The row is keyed by series and its `episode` becomes the *next* one the moment the
   * live query re-runs, so a plain boolean would carry the mark across onto an episode
   * nobody has watched. Holding the id instead makes it self-clearing: it stops matching
   * the second the list moves on. It is also what undo has to name — `unwatchLatest` on
   * the episode now in the row would take back the wrong one.
   */
  const [markedId, setMarkedId] = useState<string>();
  const justMarked = markedId === episode.id;

  function onWatched() {
    // Optimistic by construction: the write goes to IndexedDB and useLiveQuery
    // re-renders. Nothing waits on a network round-trip — and nothing here awaits it,
    // because the ring has no state in which it is waiting.
    void markWatched({
      targetId: episode.id,
      seriesId: entry.seriesId,
      runtimeMin: episode.runtimeMin,
    });
    setMarkedId(episode.id);
    navigator.vibrate?.(10);

    // How TV Time worked, and named as a failing in two of its successors. Only when
    // there is an account behind it — otherwise there is no conversation to open and
    // this would be a dead end. Catching up in bulk uses its own control, which never
    // navigates, so this cannot interrupt a run of episodes.
    if (openCommentsAfterWatch() && syncConfigured()) {
      navigate(`/comments/${encodeURIComponent(episode.id)}`);
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
      open={{
        // The poster used to be the only target and the words beside it were not one.
        name: [`Open ${entry.seriesName}`, code, named].filter(Boolean).join(', '),
        to: `/title/${encodeURIComponent(entry.seriesId)}`,
      }}
      lead={
        <Poster
          url={entry.posterUrl}
          name={entry.seriesName}

        />
      }
      trailing={
        /* Was a filled "Watched" pill whose undo appeared as a banner at the top of the
           screen. The ring is the same tap in the dark, one-handed, and the way back is
           beside it rather than above a list that has already reflowed. */
        <CrossOff
          watched={justMarked}
          name={justMarked ? `Unmark ${entry.seriesName} ${code}` : `Mark ${entry.seriesName} ${code} watched`}
          onChange={(next) => (next ? onWatched() : undoMark())}
          onUndo={undoMark}
          undoName={`Undo marking ${entry.seriesName} ${code} watched`}
        />
      }
      under={
        /* Two controls about the row rather than beside it, which is what `under` is for.
           "Caught up further?" sat *inside the words* before, so the row's one navigation
           target had a second control nested in it. Wrapping is kept: at twice the text
           size these two together are wider than a phone, and `flex-nowrap` used to push
           them past the right edge — half a control is as unusable as none, and the
           smoke's 200% check only noticed ones that were entirely gone. */
        <div className="flex flex-wrap items-center gap-4">
          {/* For anyone who binged away from the app. The alternative is the show page,
              which lists the name of every episode ahead of you. */}
          {entry.remaining > 0 && (
            <Button
              size="inline"
              tone="quiet"
              label={COPY.controls.catchUp}
              name={COPY.controls.catchUpOn(entry.seriesName)}
              onPress={() => onCatchUp({ seriesId: entry.seriesId, seriesName: entry.seriesName })}
            />
          )}
          {/* A `Button`, because moving this into `under` as a bare underlined link made
              it 66×16 — a target a third of the height a thumb needs, on the row people
              open this app for. It was a bordered pill before the migration and the
              component is what keeps 44 from being something each call site remembers. */}
          <Button
            size="inline"
            tone="quiet"
            to={`/watching/${encodeURIComponent(episode.id)}`}
            label={COPY.controls.watchAlong}
            name={`Watch along with ${entry.seriesName} ${code}`}
          />
        </div>
      }
    />
  );
}
