import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '../data/db';
import {
  clearRating,
  markWatched,
  rate,
  setPosterOverride,
  unwatchLatest,
  watchedEpisodeIds,
} from '@reviewies/core/data/repo';
import { getEpisodesCached, getTitleCached } from '@reviewies/core/metadata/index';
import { hasAired } from '@reviewies/core/data/repo';
import { Poster } from '../ui/Poster';
import { StarRating } from '../ui/StarRating';
import { AddToList } from '../social/AddToList';
import { ContentWarnings } from '../social/ContentWarnings';
import { WhereToWatch } from '../ui/WhereToWatch';
import type { CachedEpisode } from '@reviewies/core/domain/types';
import { COPY } from '@reviewies/core/copy';

export function TitleDetail() {
  const { id = '' } = useParams();
  const titleId = decodeURIComponent(id);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const title = useLiveQuery(() => db.titles.get(titleId), [titleId]);
  const episodes = useLiveQuery(
    () => db.episodes.where('seriesId').equals(titleId).toArray(),
    [titleId],
    [],
  );
  const watched = useLiveQuery(() => watchedEpisodeIds(titleId), [titleId], new Set<string>());
  const rating = useLiveQuery(() => db.ratings.get(titleId), [titleId]);
  const libraryItem = useLiveQuery(() => db.library.get(titleId), [titleId]);
  const [posterDraft, setPosterDraft] = useState<string>();
  const counts = useLiveQuery(async () => {
    const events = await db.watches.where('seriesId').equals(titleId).toArray();
    const map = new Map<string, number>();
    for (const e of events) map.set(e.targetId, (map.get(e.targetId) ?? 0) + 1);
    return map;
  }, [titleId], new Map<string, number>());

  /**
   * Awaited without a catch, so a provider that could not be reached left this effect
   * rejected part-way: `loading` stayed true and the heading below stayed on its
   * placeholder — "Loading…", for ever, on the page for a show somebody had opened.
   * §6.58 drove it in a browser rather than reasoning about it.
   */
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getTitleCached(titleId);
        await getEpisodesCached(titleId);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [titleId, attempt]);

  const bySeason = new Map<number, CachedEpisode[]>();
  for (const e of [...episodes].sort((a, b) => a.season - b.season || a.number - b.number)) {
    if (!bySeason.has(e.season)) bySeason.set(e.season, []);
    bySeason.get(e.season)!.push(e);
  }

  return (
    <div className="p-4">
      <div className="mb-5 flex gap-4">
        <Poster
          url={libraryItem?.posterOverride ?? title?.posterUrl}
          name={title?.name ?? ''}
          className="h-36 w-24 rounded-plate"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">
            {title?.name ?? (failed || !loading ? COPY.title.loadFailed : 'Loading…')}
          </h1>
          {!title && (failed || !loading) && (
            <button
              onClick={() => {
                setFailed(false);
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
              className="mt-2 rounded-pill bg-surface-2 px-4 py-2 text-sm"
            >
              {COPY.title.tryAgain}
            </button>
          )}
          {title?.year && <p className="text-sm text-muted">{title.year}</p>}
          {title?.overview && (
            <p className="mt-2 line-clamp-3 text-sm text-muted">{title.overview}</p>
          )}

          {title && <AddToList titleId={titleId} kind={title.kind} />}
        </div>
      </div>

      {/* Its own line, not beside the poster. Ten targets at 24px each is 240 wide and
          does not bend: in the column left of the poster it was pushed off the right of
          the screen once the text around it grew, taking two stars through five with
          it. A rating you cannot reach is a rating you cannot give. */}
      {/* Labelled, because five grey stars in an empty band read as a divider rather
          than a control. §6.61 looked at the screenshot and could not tell what the row
          was; the screen reader always could, which is exactly the gap a picture finds
          and an assertion does not. The word also says whose rating it is — this is
          yours, not an average, which is the whole difference from every site that shows
          you a crowd score. */}
      {/* Stacked, not beside. On one line the label ate the width the stars need and
          pushed two of them off the screen at 200% text — the exact failure the comment
          above describes, reproduced by adding four words, and caught by the check that
          was written after it happened the first time. */}
      <div className="mb-5">
        <span className="mb-1 block text-xs tracking-wide text-muted uppercase">
          {COPY.title.yourRating}
        </span>
        <StarRating
          value={rating?.value}
          onChange={(value) =>
            value === undefined ? clearRating(titleId) : rate(titleId, value)
          }
        />
      </div>

      {/* Poster override. From r/Serializd and r/Letterboxd: people resent being at
          the mercy of TMDB moderation deleting artwork they liked. */}
      {libraryItem && (
        <div className="mb-5">
          {posterDraft === undefined ? (
            <button
              onClick={() => setPosterDraft(libraryItem.posterOverride ?? '')}
              className="tap text-xs text-muted underline"
            >
              {libraryItem.posterOverride ? 'Change poster' : 'Use a different poster'}
            </button>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={posterDraft}
                onChange={(e) => setPosterDraft(e.target.value)}
                placeholder="Image URL"
                className="min-w-0 flex-1 rounded-none bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-muted"
                autoFocus
              />
              <button
                onClick={async () => {
                  await setPosterOverride(titleId, posterDraft.trim() || undefined);
                  setPosterDraft(undefined);
                }}
                aria-label="Save this poster"
                className="rounded-pill bg-accent px-3 text-sm font-medium text-ink"
              >
                Save
              </button>
              <button
                onClick={() => setPosterDraft(undefined)}
                aria-label="Cancel changing the poster"
                className="px-2 text-sm text-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <WhereToWatch titleId={titleId} />

      {/* Asked for repeatedly on r/Letterboxd and r/tvtime: a doesthedogdie-style
          heads-up in the tracker itself. Collapsed, so it spoils nothing unasked. */}
      <ContentWarnings titleId={titleId} />

      {loading && episodes.length === 0 && <p className="text-sm text-muted">Loading episodes…</p>}

      {[...bySeason.entries()].map(([season, eps]) => (
        <section key={season} className="mb-6">
          <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">
            Season {season}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {eps.map((e) => (
              <EpisodeRow
                key={e.id}
                episode={e}
                seriesId={titleId}
                watched={watched.has(e.id)}
                rewatches={counts.get(e.id) ?? 0}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EpisodeRow({
  episode,
  seriesId,
  watched,
  rewatches,
}: {
  episode: CachedEpisode;
  seriesId: string;
  watched: boolean;
  rewatches: number;
}) {
  const aired = hasAired(episode);
  const rating = useLiveQuery(() => db.ratings.get(episode.id), [episode.id]);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-plate bg-surface px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="text-muted">{episode.number}.</span> {episode.name}
        </p>
        <p className="text-xs text-muted">
          {aired ? episode.airDate : `Airs ${episode.airDate ?? 'TBA'}`}
          {episode.runtimeMin ? ` · ${episode.runtimeMin}m` : ''}
          {/* Rewatch counts: requested across r/Letterboxd, r/Simkl and r/Serializd. */}
          {rewatches > 1 && ` · watched ${rewatches}×`}
        </p>
        {/* Episode-level ratings: "a series of 8 television episodes is really just a
            series of 8 films" — r/Letterboxd. Only offered once watched. */}
      </div>

      {/* Every row carries the same three words. Read down a season they are "React,
          Talk, Mark" forty times over with nothing to tell them apart. */}
      <Link
        to={`/watching/${encodeURIComponent(episode.id)}`}
        aria-label={`React along with episode ${episode.number}, ${episode.name}`}
        className="shrink-0 rounded-plate bg-surface-2 px-3 py-1.5 text-xs text-muted"
      >
        React
      </Link>

      <Link
        to={`/comments/${encodeURIComponent(episode.id)}`}
        aria-label={`Comments on episode ${episode.number}, ${episode.name}`}
        className="shrink-0 rounded-plate bg-surface-2 px-3 py-1.5 text-xs text-muted"
      >
        Talk
      </Link>

      <button
        onClick={() =>
          watched
            ? unwatchLatest(episode.id)
            : markWatched({ targetId: episode.id, seriesId, runtimeMin: episode.runtimeMin })
        }
        disabled={!aired && !watched}
        aria-pressed={watched}
        aria-label={
          watched
            ? `Unmark episode ${episode.number}, ${episode.name}`
            : `Mark episode ${episode.number}, ${episode.name} watched`
        }
        className={`shrink-0 rounded-pill px-3 py-1.5 text-xs font-medium disabled:opacity-30 ${
          watched ? 'bg-surface-2 text-muted' : 'bg-accent text-ink'
        }`}
      >
        {watched ? 'Watched' : 'Mark'}
      </button>

      {/* A line of its own, below the row rather than squeezed into the column beside
          three buttons — same reason as the title's. "A series of 8 television episodes
          is really just a series of 8 films" (r/Letterboxd), and a film's rating does
          not get the leftovers. Only offered once watched. */}
      {watched && (
        <div className="w-full">
          <StarRating
            value={rating?.value}
            onChange={(value) =>
              value === undefined ? clearRating(episode.id) : rate(episode.id, value)
            }
          />
        </div>
      )}
    </li>
  );
}
