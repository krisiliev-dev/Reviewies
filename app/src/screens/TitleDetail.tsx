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
import { Chevron } from '../ui/Mark';
import { disclosure } from '@reviewies/core/ui/mark';
import { StarRating } from '../ui/StarRating';
import { RATING_OPEN, ratingAction, ratingLabel } from '@reviewies/core/ui/rating';
import { AddToList } from '../social/AddToList';
import { ContentWarnings } from '../social/ContentWarnings';
import { WhereToWatch } from '../ui/WhereToWatch';
import type { CachedEpisode } from '@reviewies/core/domain/types';
import { COPY } from '@reviewies/core/copy';
import { Section } from '../ui/Section';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import { Masthead } from '../ui/Masthead';
import { episodeHeading, episodeName } from '@reviewies/core/ui/episode';
import {
  bySeason as seasonOrder,
  openSeason,
  summariseSeasons,
} from '@reviewies/core/ui/season';

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
  /** Which season is open: `undefined` follows the rule, `null` is closed. §6.156. */
  const [chosen, setChosen] = useState<number | null>();
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

  // `bySeason`, not `a.season - b.season`: specials are season 0 and belong at the end.
  // The core says why, and three call sites in `repo.ts` already act on it. §6.152.
  const bySeason = new Map<number, CachedEpisode[]>();
  for (const e of [...episodes].sort(
    (a, b) => seasonOrder(a.season, b.season) || a.number - b.number,
  )) {
    if (!bySeason.has(e.season)) bySeason.set(e.season, []);
    bySeason.get(e.season)!.push(e);
  }
  const seasons = [...bySeason.entries()];

  /*
   * One season open, the rest as rows. §6.156.
   *
   * `undefined` means "follow the rule" — the first season you have not finished, which is
   * where the episode Up Next is offering lives. `null` means you closed it. Anything else
   * is the season you opened, and the rule stops applying the moment you make a choice.
   */
  const summaries = summariseSeasons(seasons, watched);
  const open = chosen === undefined ? openSeason(summaries) : chosen;

  return (
    <div className="p-s16">
      <div className="mb-5 flex gap-4">
        <Poster
          url={libraryItem?.posterOverride ?? title?.posterUrl}
          name={title?.name ?? ''}
          size="detail"
        />
        <div className="min-w-0 flex-1">
          {/*
            `page`, not `sub`.

            This was `sub`, matching `mobile/app/title/[id].tsx` — and that file's comment
            gives the reason the match does not survive the crossing: *"on this platform
            the navigator's own title above it is already the screen's name at depth 1"*.
            The web has no navigator. So the name of the screen this product's whole
            episode list hangs off was drawn at `MASTHEAD.sub` — **depth 2** — and the page
            had no first-level heading at all. `WhereToWatch`'s `WHERE TO WATCH`, a card
            inside this screen, is a `Section` at depth 2 as well, so the screen and a box
            on it were announced as siblings.

            `page` is what every other pushed screen on the web already uses — Lists,
            People, Settings, Stats, Not Found — and `masthead.ts` says why it is the right
            row of the table rather than a third one: *"a screen has one name whether it is
            a tab root or pushed"*. It also brings `MASTHEAD.page.gapBelow`, so the year no
            longer sits against the name.

            The phone keeps `sub`, because there the sentence above is true.
          */}
          <Masthead level="page">
            {title?.name ?? (failed || !loading ? COPY.title.loadFailed : COPY.waiting.loading)}
          </Masthead>
          {!title && (failed || !loading) && (
            <Button
              onPress={() => {
                setFailed(false);
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
              label={COPY.title.tryAgain}
              name={COPY.title.tryAgain}
              className="mt-2"
            />
          )}
          {title?.year && <p><Data value={title.year} className="text-ink-secondary" /></p>}
          {title?.overview && (
            /*
             * Whole, as the phone has always drawn it. §6.174.
             *
             * This carried `line-clamp-3` — undocumented, unconditional, and not a
             * narrow-window rule: measured against real TMDB it truncated It's Always
             * Sunny mid-word at **both** photographed widths, 420 and 1280, and there was
             * no control anywhere to reach the rest. `mobile/app/title/[id].tsx` renders
             * the same field with no `numberOfLines` and always has, so this was §6.170's
             * shape — one field, two platforms, different halves — with the phone holding
             * the better version. §6.51: the better version wins whichever platform had it.
             */
            <p className="mt-2 text-s16 font-prose font-regular leading-l143 text-ink-secondary">
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
              {libraryItem.posterOverride ? COPY.controls.changePoster : COPY.controls.differentPoster}
            </button>
          ) : (
            <div className="flex gap-1.5">
              <Field
                size="row"
                type="url"
                label={COPY.fields.posterUrl}
                value={posterDraft}
                onChange={setPosterDraft}
                placeholder={COPY.fields.posterUrlPlaceholder}
                className="min-w-0 flex-1"
                autoFocus
              />
              <Button
                tone="primary"
                label="Save"
                name={COPY.controls.savePoster}
                onPress={async () => {
                  await setPosterOverride(titleId, posterDraft.trim() || undefined);
                  setPosterDraft(undefined);
                }}
              />
              <Button
                tone="quiet"
                onPress={() => setPosterDraft(undefined)}
                label="Cancel"
                name={COPY.controls.cancelPoster}
              />
            </div>
          )}
        </div>
      )}

      <WhereToWatch titleId={titleId} />

      {/* Asked for repeatedly on r/Letterboxd and r/tvtime: a doesthedogdie-style
          heads-up in the tracker itself. Collapsed, so it spoils nothing unasked. */}
      <ContentWarnings titleId={titleId} />

      {loading && episodes.length === 0 && <Note>{COPY.title.loadingEpisodes}</Note>}

      {seasons.map(([season, eps], index) => {
        const summary = summaries[index];
        const expanded = open === season;
        return (
          <section key={season} className="mb-6">
            {/* The heading is the control. A `Section` above a button would be the same
                words twice, and the row already says everything the heading did. */}
            <BaseRow
              density="index"
              title={summary.label}
              meta={summary.progress}
              open={{
                name: `${summary.label}, ${summary.progress}, ${expanded ? 'showing' : 'hidden'}`,
                run: () => setChosen(expanded ? null : season),
              }}
              trailing={
                <Chevron points={disclosure(expanded)} className="shrink-0 text-s16 text-ink-secondary" />
              }
            />
            {expanded && (
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
            )}
          </section>
        );
      })}
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
  // §6.145, and `RATING_OPEN` is the rule rather than a literal `false` here — the same
  // shape `compose.ts` gave the comments composer and the calendar's panel.
  const [ratingOpen, setRating] = useState(RATING_OPEN);

  const named = episodeName(episode.name, episode.number);
  const which = [`season ${episode.season} episode ${episode.number}`, named]
    .filter(Boolean)
    .join(', ');

  return (
    <BaseRow
      title={episodeHeading(episode.number, episode.name)}
      // The ink step and the stroke both come from `struck`, which the component takes
      // from `CrossOff` — this row spelled out its own `crossedOffText` before, and a row
      // free to spell its own is a row free to pick a different colour.
      struck={watched}
      disabled={!aired && !watched}
      meta={`${aired ? episode.airDate : `Airs ${episode.airDate ?? COPY.title.tba}`}${
        episode.runtimeMin ? ` · ${episode.runtimeMin}m` : ''
      }${
        // Rewatch counts: requested across r/Letterboxd, r/Simkl and r/Serializd.
        rewatches > 1 ? ` · watched ${rewatches}×` : ''
      }`}
      // What an unaired episode gets instead of a ring. The whole reason `disabled` steps
      // the ink rather than fading it: "not yet" has to read differently from "broken".
      tag={!aired && !watched ? COPY.title.notYet : undefined}
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
            label={COPY.controls.react}
            name={`React along with ${which}`}
          />
          <Button
            size="inline"
            tone="quiet"
            to={`/comments/${encodeURIComponent(episode.id)}`}
            label={COPY.controls.talk}
            name={`Comments on ${which}`}
          />
          {/* "A series of 8 television episodes is really just a series of 8 films"
              (r/Letterboxd), and a film's rating does not get the leftovers. Only offered
              once watched, so the offer's presence is a state. Revealed rather than
              resident since §6.145: `StarRating` is 240 wide in a row that has not got it,
              and sixty empty outlines down a season said nothing. */}
          {watched && (
            <Button
              size="inline"
              tone="quiet"
              label={ratingLabel(rating?.value)}
              name={`${ratingAction(rating?.value)} ${which}`}
              onPress={() => setRating((open) => !open)}
            />
          )}
          {/* The five, on a line of their own — what `StarRating`'s own doc asks its
              callers for, and what the title's own rating already got. */}
          {watched && ratingOpen && (
            <div className="w-full">
              <StarRating
                of={which}
                value={rating?.value}
                onChange={(value) => {
                  if (value === undefined) clearRating(episode.id);
                  else rate(episode.id, value);
                  setRating(false);
                }}
              />
            </div>
          )}
        </div>
      }
    />
  );
}
