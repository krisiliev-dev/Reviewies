import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { markWatched, rate, setPosterOverride, unwatchLatest, watchedEpisodeIds } from '../data/repo';
import { getEpisodesCached, getTitleCached } from '../metadata';
import { hasAired } from '../data/repo';
import { Poster } from '../ui/Poster';
import { StarRating } from '../ui/StarRating';
import { AddToList } from '../social/AddToList';
import type { CachedEpisode } from '../domain/types';

export function TitleDetail() {
  const { id = '' } = useParams();
  const titleId = decodeURIComponent(id);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getTitleCached(titleId);
      await getEpisodesCached(titleId);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [titleId]);

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
          className="h-36 w-24 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{title?.name ?? 'Loading…'}</h1>
          {title?.year && <p className="text-sm text-muted">{title.year}</p>}
          {title?.overview && (
            <p className="mt-2 line-clamp-3 text-sm text-muted">{title.overview}</p>
          )}

          {title && <AddToList titleId={titleId} kind={title.kind} />}

          <div className="mt-2">
            <StarRating
              value={rating?.value}
              onChange={(value) =>
                value === undefined ? db.ratings.delete(titleId) : rate(titleId, value)
              }
            />
          </div>
        </div>
      </div>

      {/* Poster override. From r/Serializd and r/Letterboxd: people resent being at
          the mercy of TMDB moderation deleting artwork they liked. */}
      {libraryItem && (
        <div className="mb-5">
          {posterDraft === undefined ? (
            <button
              onClick={() => setPosterDraft(libraryItem.posterOverride ?? '')}
              className="text-xs text-muted underline"
            >
              {libraryItem.posterOverride ? 'Change poster' : 'Use a different poster'}
            </button>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={posterDraft}
                onChange={(e) => setPosterDraft(e.target.value)}
                placeholder="Image URL"
                className="min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-1.5 text-sm outline-none placeholder:text-muted"
                autoFocus
              />
              <button
                onClick={async () => {
                  await setPosterOverride(titleId, posterDraft.trim() || undefined);
                  setPosterDraft(undefined);
                }}
                className="rounded-lg bg-accent px-3 text-sm font-medium text-ink"
              >
                Save
              </button>
              <button onClick={() => setPosterDraft(undefined)} className="px-2 text-sm text-muted">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

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
    <li className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
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
        {watched && (
          <div className="mt-1">
            <StarRating
              size="sm"
              value={rating?.value}
              onChange={(value) =>
                value === undefined ? db.ratings.delete(episode.id) : rate(episode.id, value)
              }
            />
          </div>
        )}
      </div>

      <Link
        to={`/watching/${encodeURIComponent(episode.id)}`}
        className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted"
      >
        React
      </Link>

      <Link
        to={`/comments/${encodeURIComponent(episode.id)}`}
        className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted"
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
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-30 ${
          watched ? 'bg-surface-2 text-muted' : 'bg-accent text-ink'
        }`}
      >
        {watched ? 'Watched' : 'Mark'}
      </button>
    </li>
  );
}
