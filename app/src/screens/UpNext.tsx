import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { getUpNext, markWatched, type UpNextEntry } from '@reviewies/core/data/repo';
import { db } from '../data/db';
import { Poster } from '../ui/Poster';
import { CatchUp } from '../ui/CatchUp';
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

  if (entries === undefined) {
    return <p className="p-6 text-muted">Loading…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Up Next</h1>
        <p className="text-muted">
          {libraryCount === 0
            ? 'Nothing tracked yet.'
            : 'All caught up — nothing has aired that you have not seen.'}
        </p>
        <Link
          to="/search"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-ink"
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
