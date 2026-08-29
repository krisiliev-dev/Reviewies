import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
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
import { syncConfigured } from '@reviewies/core/sync/auth';
import { useImporting } from '../useImporting';
import { COPY } from '@reviewies/core/copy';
import { Button } from '../ui/Button';
import { CrossOff } from '../ui/CrossOff';
import { Row as BaseRow } from '../ui/Row';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';

/**
 * The home screen, and the one the whole product is judged on.
 *
 * From r/tvtime, stated more forcefully than any other requirement:
 * "The only important thing in an app is that it opens directly to the page where I
 * can see and mark the next episodes of my shows."
 *
 * So: no dashboard, no feed, no onboarding carousel. The list, and a button.
 */
export function UpNext() {
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

  if (entries === undefined) {
    return <Note className="p-6">Loading…</Note>;
  }

  /**
   * Just imported.
   *
   * Held until dismissed rather than swapped out the moment the library is no longer
   * empty. The import puts shows in the library, which used to change what this screen
   * renders mid-write and take the result with it — you got no confirmation that the
   * thing you came here to do had worked.
   */
  if (imported) {
    return (
      <div className="flex flex-col gap-3 p-s16">
      {/*
       * The screen keeps its own title, and the arrival line is a heading under it.
       *
       * These two states used to `return` a page with no "Up Next" on it at all: the tab
       * bar said one thing and the page said another, and somebody one minute into the app
       * lost the only word telling them where they were. The phone has never done that —
       * it draws the title and puts the arrival heading beneath — and §6.107 widened the
       * gap rather than finding it, by giving the web's `<h1>` the tab-root treatment. A
       * heading that is a *sentence* is not a screen title, and 30/700 read like one.
       */}
        <Masthead>Up Next</Masthead>
        <Masthead level="sub">Your history is in</Masthead>
        <p>
          Imported {imported.watches} watch{imported.watches === 1 ? '' : 'es'}
          {imported.watchlist > 0 && `, ${imported.watchlist} watchlist items`}.
        </p>
        {/* An export carries names and dates and no provider IDs, so what has landed is
            a set of shows with no artwork, no air dates and no episode lists beyond what
            was watched. Matching them is the next thing to do, and it is offered here
            rather than mentioned, because here is where somebody is standing. */}
        <Note>
          They are in your library under the names your export carried. Matching them to
          the real shows fills in the artwork, the air dates and everything you have not
          watched yet.
        </Note>
        {/* Not auto-started here: this panel has just explained what matching is for, and
            starting it underneath that explanation would talk over itself. The Up Next
            screen below runs it without asking. */}
        <MatchImports autoStart={false} />
        <button
          onClick={() => setImported(undefined)}
          className="tap self-start text-s14 text-ink-secondary underline"
        >
          Later
        </button>
      </div>
    );
  }

  // Caught up is a different screen from never started, and only one of them is
  // somebody's first minute with the app.
  if (entries.length === 0 && libraryCount !== 0) {
    return (
      <div className="p-6">
        <Masthead>Up Next</Masthead>
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
              : COPY.upNext.allCaughtUp}
        </Note>
        {/* Run where the gap is felt, not filed under a settings screen — but never
            over a library still being written. Matching what has landed so far leaves
            the rest of the import behind it, unmatched and unoffered. */}
        {unmatched && !importing ? <MatchImports /> : null}
        <Button
          to="/search"
          tone="primary"
          size="page"
          label="Find something to watch"
          name="Find something to watch"
          className="mt-5"
        />
      </div>
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
      <div className="flex flex-col gap-3 p-6">
        <Masthead>Up Next</Masthead>
        {/* A heading under the screen's own title — see the note on the arrival state. */}
        <Masthead level="sub">Bring your history with you</Masthead>
        <Note>
          TV Time is gone. If you got your data out — or pulled it off your phone — this
          reads it and picks up where you left off.
        </Note>
        <ImportFormats />
        <ImportFiles label="Import from TV Time" onImported={setImported} primary />
        <Note className="mt-2 px-1">
          Nothing to import? Search for a show and start from there.
        </Note>
        {/* The secondary of the two. It was the bright one and the import was the muted
            one, which is the opposite of what this screen is for — the migration is the
            offer and searching is the fallback. Nothing but looking at it would have
            said so: both were named, both were reachable, both were big enough. */}
        <Button
          to="/search"
          tone="secondary"
          size="page"
          label="Find something to watch"
          name="Find something to watch"
          className="self-start"
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Masthead className="px-1">Up Next</Masthead>

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
    </div>
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
          ? 'Last one'
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
              label="Caught up further?"
              name={`Catch up on ${entry.seriesName}`}
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
            label="Watch along"
            name={`Watch along with ${entry.seriesName} ${code}`}
          />
        </div>
      }
    />
  );
}
