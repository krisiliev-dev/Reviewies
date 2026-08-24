import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { markWatched, unwatchLatest, watchedEpisodeIds } from '../data/repo';
import { getEpisodesCached, getTitleCached } from '../metadata';
import { hasAired } from '../data/repo';
import { Poster } from '../ui/Poster';
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
        <Poster url={title?.posterUrl} name={title?.name ?? ''} className="h-36 w-24 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{title?.name ?? 'Loading…'}</h1>
          {title?.year && <p className="text-sm text-muted">{title.year}</p>}
          {title?.overview && (
            <p className="mt-2 line-clamp-4 text-sm text-muted">{title.overview}</p>
          )}
        </div>
      </div>

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
