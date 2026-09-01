import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { db } from '../data/db';
import {
  addToLibrary,
  stopTracking,
  addToWatchlist,
  clearRating,
  markWatched,
  rate,
  setPosterOverride,
  startWatching,
  unwatchLatest,
  watchedEpisodeIds,
} from '@reviewies/core/data/repo';
import { shelfOf, type Shelf } from '@reviewies/core/data/already';
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
import { useWaitedLongEnough } from '../ui/waiting';
import { episodeHeading, episodeName, episodeWhen } from '@reviewies/core/ui/episode';
import { SCREEN } from '@reviewies/core/ui/screen';
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
  const savedItem = useLiveQuery(() => db.watchlist.get(titleId), [titleId]);
  const [posterDraft, setPosterDraft] = useState<string>();

  /*
   * Which shelf this title is already on — `already.ts`'s two values, read from the two
   * rows rather than from a `useState` set by this session's presses.
   *
   * `alreadyHave()`/`shelfFor()` is not used here and the difference is the whole reason
   * that module exists: it resolves a *search result* against the library by name as well
   * as by ID, because an imported row is `local:tv:…` and a result is `tmdb:tv:…` and the
   * two never meet. This screen is already at one ID — whichever the row that opened it
   * carried — so `get` is the exact question, and asking the wider one would scan two
   * tables to answer something a key lookup answers.
   *
   * The library wins when both rows exist, which is `shelfFor`'s own rule: *"Tracking is
   * the stronger statement, and a watchlist entry for something you are already watching
   * is the leftover rather than the fact."*
   *
   * `shelfOf` rather than the ternary both platforms used to type, because the rule stopped
   * being *is there a row*: a dropped row is still a library row, and reading it as
   * `library` would leave the button saying **Stop tracking** for a show already stopped.
   * §6.191.
   */
  const shelf: Shelf | undefined = shelfOf(libraryItem, savedItem);

  /**
   * Start tracking, from the page that told you what it is.
   *
   * `startWatching` when it was on the watchlist, `addToLibrary` when it was not, which is
   * `repo.ts`'s distinction rather than a new one: the first is *"track it and take it off
   * the list, one act, not two"* and it enqueues a watchlist tombstone, so calling it for a
   * title that was never saved would send a deletion for a row that never existed.
   *
   * No `getEpisodesCached` behind it, unlike the search row and the shelf's box. This
   * screen's own effect has already asked for the episodes and is rendering them; the two
   * call sites that fetch here do so because nothing else on those screens ever will.
   */
  async function track() {
    if (!title) return;
    if (shelf === 'watchlist') await startWatching(titleId, title.kind);
    else await addToLibrary(titleId, title.kind);
  }
  /**
   * And the way back out, which for the life of this product did not exist.
   *
   * `addToLibrary` on a dropped row is an `update` to `watching`, so `track` above is
   * already the resume path and needs no branch for it — the same two presses go back and
   * forth, and every episode you had marked stays marked because a watch is an event and
   * does not live in this row. `repo.ts`'s header has the rest of that argument.
   */
  async function stop() {
    await stopTracking(titleId);
  }
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

  /**
   * Whether the head of this page has been decided, either way.
   *
   * Three outcomes and not two, which is §6.104's shape: a name, no name because the look
   * finished without finding one, and **not looked yet**. `title` alone cannot tell the
   * first from the third — `useLiveQuery` returns `undefined` both before it has run and
   * for an id no row matches — so the effect's own `loading` supplies the difference. The
   * tail below waits on this and on nothing else.
   */
  const headKnown = title !== undefined || failed || !loading;
  const headWaited = useWaitedLongEnough(!headKnown);

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
          {/*
            Drawn when it has something to say, which for the first 200ms it does not.

            `design/between.mjs` measured this placeholder standing for **25ms** on a press
            from Up Next — one frame and a half, too brief for the eye to have landed on it
            at all, so what it delivered was a flicker in the place a name was about to be.
            `core/src/ui/waiting.ts` has the threshold and why it is not Google's 200.

            The condition rather than an empty `<Masthead>`: this is the web's only
            depth-1 heading on this screen — `masthead.test.ts` is explicit that the phone's
            navigator supplies one here and the web has nothing to supply it — and a
            heading rendered with no accessible name is worse than a heading not yet
            rendered. `headWaited` is the same clock the tail waits on.
          */}
          {(title !== undefined || failed || !loading || headWaited) && (
            <Masthead level="page">
              {title?.name ?? (failed || !loading ? COPY.title.loadFailed : COPY.waiting.loading)}
            </Masthead>
          )}
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
          {/*
            The year alone, and **not** the genre beside it.

            The same title reads `Drama · 2001` on a browse box's front, `Series · 2001` on
            its back and in a search row, and `2001` here — four surfaces, and
            `core/src/ui/box.ts` argues all four. This one is the only one of them that
            draws the synopsis whole, so the sentence saying what sort of thing it is is
            already on the screen at length; a one-word summary of a paragraph two lines
            below it is §6.169's defect at a smaller altitude. And this line is a `Data` —
            tabular mono, a figure — which a genre is not.

            `CachedTitle.genres` asks that **a box** built from a cached title say the same
            three things as one built from a search result. This page does not build a box.
          */}
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
             *
             * ## And a measure of its own, which the column could not give it
             *
             * `SCREEN.measure` caps the column at 720 and was measured for a *row* — one
             * line, scanned, whose two ends have to belong to each other. A paragraph is
             * read line after line, and what a wide measure costs is finding the start of
             * the next one, so the two questions do not have one answer. Measured at 1280
             * before `SCREEN.prose` existed: this paragraph set **89 characters** to a line,
             * against 44 in the same build at 420, and the convention puts a comfortable
             * measure at 45–75. The table carries the number and the readings behind it.
             *
             * Inline, like the column's own cap in `App.tsx` and for the same reason: the
             * number lives in the core and Tailwind cannot be handed one.
             */
            <p
              className="mt-2 text-s16 font-prose font-regular leading-l143 text-ink-secondary"
              style={{ maxWidth: SCREEN.prose }}
            >
              {title.overview}
            </p>
          )}

          {title && <AddToList titleId={titleId} kind={title.kind} />}
        </div>
      </div>

      {/*
        The decision, on the page you opened to make it.

        ## The hole

        `Track`, `addToLibrary` and `watchlist` appeared nowhere on either title screen.
        You could read the synopsis, the seasons, where to watch it and what it warns you
        about — everything the product knows that would change your mind — and then had to
        leave and find the row again to act on it. `design/cost.mjs` walked both routes and
        priced the detour against tracking from the search row: **+2 presses and +3.16s on
        the phone**, **+3 presses, +4 retyped characters and +8.53s on the web**, plus one
        web press it counts and refuses to price because it is the browser's own Back,
        above the viewport. The web is worse because going back also loses the query —
        `Discover.tsx` holds it in `useState` — so the search is typed twice.

        ## Why it is these two controls and not a new one

        They are the search row's, moved: same tones, same labels, same announced names,
        same `shelf` conditional. That is the point rather than laziness — a page reached
        *from* that row should not offer a differently-shaped version of the same decision,
        and `copy.ts` records what happens when two screens each write their own words for
        one act. Nothing new is invented here, so there is nothing new to keep in step.

        ## Where it sits, and what is refused

        Under the synopsis, above the rating: the back of a browse box puts its two verbs
        after the blurb for the same reason — `box.ts`'s *"the front of the box sells
        nothing; the back is where you decide"* — and this screen is the long form of that
        back. Its own full-width line rather than the column beside the poster, which is
        the mistake the rating block below records having made once already.

        **Refused: a third control.** `docs/research/09-app-first-pivot.md` §6.178 is about
        a row that grew to eight, and this screen already carries a rating, a poster
        override, Add to list, Where to watch, content warnings and a season list. Two is
        what the decision needs.

        Still two. The first one now has two faces rather than a face and a disabled state:
        **Track** when you are not, **Stop tracking** when you are. The excuse that stood
        here — *"there is no stop tracking; `repo.ts` has no such writer, and inventing one
        on the screen that would need to explain what happens to your watch history is a
        bigger decision than this one"* — was true and is spent. §6.191 made the decision it
        was deferring: `dropped`, not a deleted row, so the history is not the question. It
        also found that `repo.ts` and `calendar/refresh.ts` had been honouring `dropped` and
        `paused` for their whole existence, for a person who could not write either.

        **Still two after the pause ruling, which is where the third face was actually refused.**
        `paused` was the obvious candidate for one — *not right now* against `dropped`'s *not
        any more* — and it is gone from `LibraryStatus` rather than sitting in the union
        waiting for a control. The measurement is in `core/src/domain/types.ts`: it differed
        from `dropped` in one observable, which is the label on this very button, and no
        screen on either platform renders a library status at all. What it would have meant
        — *I mean to come back* — is already two presses of the two controls below: stop,
        then watchlist, which `shelfOf` resolves on purpose.
      */}
      {title && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <Button
            onPress={shelf === 'library' ? stop : track}
            tone={shelf === 'library' ? 'secondary' : 'primary'}
            label={shelf === 'library' ? COPY.controls.stopTracking : COPY.controls.track}
            name={
              shelf === 'library'
                ? COPY.controls.stopTrackingTitle(title.name)
                : COPY.controls.trackTitle(title.name)
            }
          />
          {/* No note composer behind this one, unlike the search row's. The note is *why
              you saved it*, and the watchlist row itself offers "Add a note…" — so the
              field is one press away where it belongs rather than a third state on the
              longest screen in the product. §6.167 gave the row that control. */}
          <Button
            onPress={() => addToWatchlist(titleId, title.kind)}
            disabled={shelf === 'watchlist'}
            tone="secondary"
            label={shelf === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
            name={COPY.controls.addToWatchlist(title.name)}
          />
        </div>
      )}

      {/*
        The tail, and the ordering finding that put it behind a condition.

        `design/between.mjs` pressed a row on Up Next and watched this page paint its
        **local half first** — the rating, Where to watch, the season list — and then insert
        its head above them: the name, the year, the overview, `AddToList` and the two
        decision buttons, arriving 25ms later and pushing everything already on the screen
        **109px down**. Against the bound that file derives from this product's own type —
        `text.s14 × leading.l143` = 20.02px, one line of body text, the unit of losing your
        place — that is five lines. On the phone the same press measured 174px.

        It is not a disclosure. `between.mjs` distinguishes those and reports four of them
        here without failing any: a control pressed, and what it opened appearing below the
        control, on the route you were already on. Nobody pressed anything for this. It is
        the ordinary case — open a title — and the reader is looking at the top of a page
        that then grows a head.

        **The waiting is honest and is not what changed.** This page's metadata is genuinely
        remote for a title nothing has cached, and `docs/design/seams.md` is clear that a
        screen may take as long as the thing it is waiting for. What was noise is the
        *order*: nothing is gained by painting the second half of a page before the first,
        and what it costs is the reader's place in it.

        So the head paints before the tail, or neither does. `headKnown` is true as soon as
        there is a name — one Dexie microtask, for anything already in the library — or as
        soon as the fetch behind it has finished or failed, which is the case where there
        will never be one. Reserving a height was the other candidate and is refused: an
        overview is prose of unknown length, `SCREEN.prose` caps its measure and not its
        lines, and a reserved box that guesses wrong shifts by the difference — the same
        defect with an extra constant to keep in step.
      */}
      {headKnown && (
        <>
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
        </>
      )}
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
      // The day, named — `2026-09-06` on this row and `Sun, Sep 6` on the calendar was
      // one episode with two answers, three tabs apart. `episodeWhen` owns both the
      // naming and the verb in front of it.
      meta={`${episodeWhen(episode.airDate)}${
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
