import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import {
  getUpNext,
  markWatched,
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

  if (entries === undefined) {
    return <p className="p-6 text-muted">Loading…</p>;
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
      <div className="flex flex-col gap-3 p-6">
        <h1 className="text-2xl font-semibold">Your history is in</h1>
        <p>
          Imported {imported.watches} watch{imported.watches === 1 ? '' : 'es'}
          {imported.watchlist > 0 && `, ${imported.watchlist} watchlist items`}.
        </p>
        {/* An export carries names and dates and no provider IDs, so what has landed is
            a set of shows with no artwork, no air dates and no episode lists beyond what
            was watched. Matching them is the next thing to do, and it is offered here
            rather than mentioned, because here is where somebody is standing. */}
        <p className="text-muted">
          They are in your library under the names your export carried. Matching them to
          the real shows fills in the artwork, the air dates and everything you have not
          watched yet.
        </p>
        <MatchImports />
        <button
          onClick={() => setImported(undefined)}
          className="tap self-start text-sm text-muted underline"
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
        <h1 className="mb-2 text-2xl font-semibold">Up Next</h1>
        <p className="text-muted">
          {unmatched
            ? `Nothing here yet. ${unmatched} ${unmatched === 1 ? 'show' : 'shows'} came from an import and have no episode lists until they are matched.`
            : 'All caught up — nothing has aired that you have not seen.'}
        </p>
        {/* Offered where the gap is felt, not filed under a settings screen. */}
        {unmatched ? <MatchImports /> : null}
        <Link
          to="/search"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-ink"
        >
          Find something to watch
        </Link>
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
        <h1 className="text-2xl font-semibold">Bring your history with you</h1>
        <p className="text-muted">
          TV Time is gone. If you got your data out — or pulled it off your phone — this
          reads it and picks up where you left off.
        </p>
        <ImportFormats />
        <ImportFiles label="Import from TV Time" onImported={setImported} primary />
        <p className="mt-2 px-1 text-sm text-muted">
          Nothing to import? Search for a show and start from there.
        </p>
        {/* The secondary of the two. It was the bright one and the import was the muted
            one, which is the opposite of what this screen is for — the migration is the
            offer and searching is the fallback. Nothing but looking at it would have
            said so: both were named, both were reachable, both were big enough. */}
        <Link
          to="/search"
          className="self-start rounded-full bg-surface-2 px-5 py-2.5 font-medium text-text"
        >
          Find something to watch
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 px-1 text-2xl font-semibold">Up Next</h1>
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

  async function onWatched() {
    // Optimistic by construction: the write goes to IndexedDB and useLiveQuery
    // re-renders. Nothing waits on a network round-trip.
    await markWatched({
      targetId: episode.id,
      seriesId: entry.seriesId,
      runtimeMin: episode.runtimeMin,
    });
    navigator.vibrate?.(10);

    // How TV Time worked, and named as a failing in two of its successors. Only when
    // there is an account behind it — otherwise there is no conversation to open and
    // this would be a dead end. Catching up in bulk uses its own control, which never
    // navigates, so this cannot interrupt a run of episodes.
    if (openCommentsAfterWatch() && syncConfigured()) {
      navigate(`/comments/${encodeURIComponent(episode.id)}`);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface p-2.5">
      <Link
        to={`/title/${encodeURIComponent(entry.seriesId)}`}
        aria-label={`Open ${entry.seriesName}`}
        className="shrink-0"
      >
        <Poster
          url={entry.posterUrl}
          name={entry.seriesName}
          className="h-24 w-16 rounded-lg"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.seriesName}</p>
        <p className="truncate text-sm text-muted">
          S{episode.season}E{episode.number} · {episode.name}
        </p>
        {/* A count, not a vague "NEW" badge — the most repeated complaint on Trakt's roadmap. */}
        <p className="mt-0.5 text-xs text-muted">
          {entry.remaining === 0
            ? 'Last one'
            : `${entry.remaining} more episode${entry.remaining === 1 ? '' : 's'}`}
        </p>
        {/* For anyone who binged away from the app. The alternative is the show page,
            which lists the name of every episode ahead of you. */}
        {entry.remaining > 0 && (
          <button
            onClick={() => onCatchUp({ seriesId: entry.seriesId, seriesName: entry.seriesName })}
            aria-label={`Catch up on ${entry.seriesName}`}
            className="tap mt-1 text-xs text-muted underline"
          >
            Caught up further?
          </button>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-1.5">
        <button
          onClick={onWatched}
          // Large target: this gets tapped in the dark, one-handed.
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink active:scale-95"
          aria-label={`Mark ${entry.seriesName} S${episode.season}E${episode.number} watched`}
        >
          Watched
        </button>
        <Link
          to={`/watching/${encodeURIComponent(episode.id)}`}
          aria-label={`Watch along with ${entry.seriesName} S${episode.season}E${episode.number}`}
          className="rounded-xl bg-surface-2 px-4 py-2 text-center text-xs text-muted"
        >
          Watch along
        </Link>
      </div>
    </li>
  );
}
