import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
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
import { Button } from '../ui/Button';
import { CrossOff } from '../ui/CrossOff';
import { Row as BaseRow } from '../ui/Row';
import { StarRating } from '../ui/StarRating';
import { AddToList } from '../social/AddToList';
import { ContentWarnings } from '../social/ContentWarnings';
import { WhereToWatch } from '../ui/WhereToWatch';
import type { CachedEpisode } from '@reviewies/core/domain/types';
import { COPY } from '@reviewies/core/copy';
import { Section } from '../ui/Section';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';

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
          <h1 className="text-s20 font-title font-semibold">
            {title?.name ?? (failed || !loading ? COPY.title.loadFailed : 'Loading…')}
          </h1>
          {!title && (failed || !loading) && (
            <button
              onClick={() => {
                setFailed(false);
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
              className="mt-2 rounded-pill border border-stroke-signal px-4 py-2 text-s14"
            >
              {COPY.title.tryAgain}
            </button>
          )}
          {title?.year && <p><Data value={title.year} className="text-ink-secondary" /></p>}
          {title?.overview && (
            <p className="mt-2 line-clamp-3 text-s16 font-prose font-regular leading-l143 text-ink-secondary">
              {title.overview}
            </p>
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
        <Section as="span" className="block">
          {COPY.title.yourRating}
        </Section>
        <StarRating
          of={title?.name ?? 'this title'}
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
              className="tap text-s12 text-ink-secondary underline"
            >
              {libraryItem.posterOverride ? 'Change poster' : 'Use a different poster'}
            </button>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={posterDraft}
                onChange={(e) => setPosterDraft(e.target.value)}
                placeholder="Image URL"
                className="min-w-0 flex-1 rounded-none bg-ground-raised px-3 py-1.5 text-s14 outline-none placeholder:text-ink-secondary"
                autoFocus
              />
              <Button
                tone="primary"
                label="Save"
                name="Save this poster"
                onPress={async () => {
                  await setPosterOverride(titleId, posterDraft.trim() || undefined);
                  setPosterDraft(undefined);
                }}
              />
              <button
                onClick={() => setPosterDraft(undefined)}
                aria-label="Cancel changing the poster"
                className="px-2 text-s14 text-ink-secondary"
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

      {loading && episodes.length === 0 && <Note>Loading episodes…</Note>}

      {[...bySeason.entries()].map(([season, eps]) => (
        <section key={season} className="mb-6">
          <Section className="px-1">
            Season {season}
          </Section>
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

  const which = `season ${episode.season} episode ${episode.number}, ${episode.name}`;

  return (
    <BaseRow
      title={`${episode.number}. ${episode.name}`}
      // The ink step and the stroke both come from `struck`, which the component takes
      // from `CrossOff` — this row spelled out its own `crossedOffText` before, and a row
      // free to spell its own is a row free to pick a different colour.
      struck={watched}
      disabled={!aired && !watched}
      meta={`${aired ? episode.airDate : `Airs ${episode.airDate ?? 'TBA'}`}${
        episode.runtimeMin ? ` · ${episode.runtimeMin}m` : ''
      }${
        // Rewatch counts: requested across r/Letterboxd, r/Simkl and r/Serializd.
        rewatches > 1 ? ` · watched ${rewatches}×` : ''
      }`}
      // What an unaired episode gets instead of a ring. The whole reason `disabled` steps
      // the ink rather than fading it: "not yet" has to read differently from "broken".
      tag={!aired && !watched ? 'NOT YET' : undefined}
      trailing={
        /* Was a pill reading "Mark" or "Watched", announcing `aria-pressed` and fading to
           30% when unaired — three separate things the component settles. */
        <CrossOff
          watched={watched}
          disabled={!aired && !watched}
          // The season, because two episodes can be "5, Episode 5" on one page. Doc 6 §5's
          // rule is that every name in a list of rows carries what tells it from its
          // neighbours, and the episode number alone does not once a show has two seasons.
          name={watched ? `Unmark ${which}` : `Mark ${which} watched`}
          onChange={(next) =>
            next
              ? markWatched({ targetId: episode.id, seriesId, runtimeMin: episode.runtimeMin })
              : unwatchLatest(episode.id)
          }
          onUndo={() => unwatchLatest(episode.id)}
          undoName={`Undo marking ${which} watched`}
        />
      }
      under={
        <div className="flex flex-wrap items-center gap-4">
          {/* Every row carries the same three words. Read down a season they are "React,
              Talk, Mark" forty times over with nothing to tell them apart, so the names
              carry the episode and the printed words stay short. */}
          {/* `Button`s, because as bare underlined links in `under` these measured 31×16
              and 21×16 — thirty-six controls a third of the height a thumb needs, on the
              screen with the most of them. The component is what keeps 44 from being a
              thing each call site has to remember. */}
          <Button
            size="inline"
            tone="quiet"
            to={`/watching/${encodeURIComponent(episode.id)}`}
            label="React"
            name={`React along with ${which}`}
          />
          <Button
            size="inline"
            tone="quiet"
            to={`/comments/${encodeURIComponent(episode.id)}`}
            label="Talk"
            name={`Comments on ${which}`}
          />
          {/* "A series of 8 television episodes is really just a series of 8 films"
              (r/Letterboxd), and a film's rating does not get the leftovers. Only offered
              once watched. */}
          {watched && (
            <StarRating
              of={which}
              value={rating?.value}
              onChange={(value) =>
                value === undefined ? clearRating(episode.id) : rate(episode.id, value)
              }
            />
          )}
        </div>
      }
    />
  );
}
