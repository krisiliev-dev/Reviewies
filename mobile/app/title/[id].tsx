import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { db } from '@reviewies/core/data/db';
import {
  addToLibrary,
  addToWatchlist,
  clearRating,
  hasAired,
  markWatched,
  rate,
  setPosterOverride,
  startWatching,
  stopTracking,
  unwatchLatest,
  watchedEpisodeIds,
} from '@reviewies/core/data/repo';
import { shelfOf, type Shelf } from '@reviewies/core/data/already';
import { getEpisodesCached, getTitleCached } from '@reviewies/core/metadata/index';
import type { CachedEpisode } from '@reviewies/core/domain/types';
import { Poster } from '../../src/ui/Poster';
import { ContentWarnings } from '../../src/ui/ContentWarnings';
import { WhereToWatch } from '../../src/ui/WhereToWatch';
import { AddToList } from '../../src/social/AddToList';
import { StarRating } from '../../src/ui/StarRating';
import { RATING_OPEN, ratingAction, ratingLabel } from '@reviewies/core/ui/rating';
import { REACH, leadingOf, tap, theme } from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type, leading } from '@reviewies/core/tokens';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';
import { CrossOff } from '../../src/ui/CrossOff';
import { Row as BaseRow } from '../../src/ui/Row';
import { Chevron } from '../../src/ui/Mark';
import { disclosure } from '@reviewies/core/ui/mark';
import { Button } from '../../src/ui/Button';
import { Section } from '../../src/ui/Section';
import { Masthead } from '../../src/ui/Masthead';
import { Data } from '../../src/ui/Data';
import { Note } from '../../src/ui/Note';
import { Field } from '../../src/ui/Field';
import { episodeHeading, episodeName, episodeWhen } from '@reviewies/core/ui/episode';
import {
  bySeason as seasonOrder,
  openSeason,
  summariseSeasons,
} from '@reviewies/core/ui/season';

export default function TitleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const titleId = decodeURIComponent(id ?? '');
  const [loading, setLoading] = useState(true);

  const title = useLive(() => db.titles.get(titleId), [titleId]);
  const episodes = useLive(
    () => db.episodes.where('seriesId').equals(titleId).toArray(),
    [titleId],
  );
  const watched = useLive(() => watchedEpisodeIds(titleId), [titleId]);
  const rating = useLive(() => db.ratings.get(titleId), [titleId]);
  const libraryItem = useLive(() => db.library.get(titleId), [titleId]);
  const savedItem = useLive(() => db.watchlist.get(titleId), [titleId]);
  /** `undefined` means not editing; a string means the field is open with that draft. */
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
   * tables on the store `already.test.ts` records as the slow one under load.
   *
   * The library wins when both rows exist, which is `shelfFor`'s own rule: *"Tracking is
   * the stronger statement, and a watchlist entry for something you are already watching
   * is the leftover rather than the fact."*
   */
  // `shelfOf` rather than the ternary this file and the web's twin each typed, because the
  // rule stopped being *is there a row*: `stopTracking` writes `dropped` and a dropped row
  // is still a library row. §6.191.
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

  /** Rewatch counts, which is the whole reason watches are events and not booleans. */
  const counts = useLive(async () => {
    const events = await db.watches.where('seriesId').equals(titleId).toArray();
    const map = new Map<string, number>();
    for (const event of events) map.set(event.targetId, (map.get(event.targetId) ?? 0) + 1);
    return map;
  }, [titleId]);

  /**
   * The web's copy of this awaited without a catch, so a provider that could not be
   * reached left the heading on "Loading…" for ever. Same shape here. §6.58.
   */
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
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

  const seasons = useMemo(() => {
    // `bySeason`, not `a.season - b.season`: specials are season 0 and belong at the end.
    // The core says why, and three call sites in `repo.ts` already act on it. §6.152.
    const bySeason = new Map<number, CachedEpisode[]>();
    for (const episode of [...(episodes ?? [])].sort(
      (a, b) => seasonOrder(a.season, b.season) || a.number - b.number,
    )) {
      if (!bySeason.has(episode.season)) bySeason.set(episode.season, []);
      bySeason.get(episode.season)!.push(episode);
    }
    return [...bySeason.entries()];
  }, [episodes]);

  /*
   * One season open, the rest as rows. §6.156.
   *
   * `undefined` means "follow the rule" — the first season you have not finished, which is
   * where the episode Up Next is offering lives. `null` means you closed it. Anything else
   * is the season you opened, and the rule stops applying the moment you make a choice.
   */
  const [chosen, setChosen] = useState<number | null>();
  const summaries = useMemo(() => summariseSeasons(seasons, watched ?? new Set()), [seasons, watched]);
  const open = chosen === undefined ? openSeason(summaries) : chosen;

  return (
    <>
      <Stack.Screen options={{ title: title?.name ?? 'Title' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Poster url={title?.posterUrl} name={title?.name ?? ''} size="detail" />
          <View style={styles.headerBody}>
            {/*
             * `MASTHEAD.sub`, drawn by the component rather than restated here.
             *
             * This was a `StyleSheet` entry naming the same three facts the table names —
             * `theme.ink`, `text.s20`, the title face — so the two platforms agreed by
             * hand-copy rather than by reading. It also announced as ordinary text: the
             * role and the `aria-level` that `mobile/src/ui/Masthead.tsx` exists to make
             * unforgettable were both absent, and react-native-web would have emitted an
             * `<h1>` had the role been there alone.
             *
             * `sub`, matching `app/src/screens/TitleDetail.tsx`: this name sits beside a
             * poster in a header block, and on this platform the navigator's own title
             * above it is already the screen's name at depth 1.
             */}
            <Masthead level="sub">
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
                />
            )}
            {/* The year alone and not the genre beside it, for the reason
                `app/src/screens/TitleDetail.tsx` states in full and `core/src/ui/box.ts`
                argues across all four surfaces: this page draws the synopsis whole, and
                this line is a figure. */}
            {title?.year ? <Data value={title.year} style={styles.year} /> : null}
          </View>
        </View>

        {title?.overview ? <Text style={styles.overview}>{title.overview}</Text> : null}

        {/* Its own line rather than the column beside the poster. Ten targets at 24
            points each is 240 wide and does not bend; in a column narrowed by a poster
            and by whatever the system font scale is doing, the last stars fall off the
            end. A rating you cannot reach is a rating you cannot give.
            Captioned, and after the description rather than before it: the phone asked
            you to rate the thing above the sentence that says what it is. §6.62. */}
        {title && <AddToList titleId={titleId} kind={title.kind} />}

        {/*
          The decision, on the page you opened to make it.

          ## The hole

          `Track`, `addToLibrary` and `watchlist` appeared nowhere on either title screen.
          You could read the synopsis, the seasons, where to watch it and what it warns you
          about — everything the product knows that would change your mind — and then had
          to leave and find the row again to act on it. `design/cost.mjs` walked both
          routes and priced the detour against tracking from the search row: **+2 presses
          and +3.16s here**, **+3 presses, +4 retyped characters and +8.53s on the web**.
          The phone is the cheaper of the two only because `expo-router` keeps the results
          screen in the stack, so going back does not lose the query; it still costs a
          press on a 30x30pt back control, which is under the target floor and is its own
          finding.

          ## Why it is these two controls and not a new one

          They are the search row's, moved: same tones, same labels, same announced names,
          same `shelf` conditional. That is the point rather than laziness — a page reached
          *from* that row should not offer a differently-shaped version of the same
          decision, and `copy.ts` records what happens when two screens each write their
          own words for one act.

          ## Where it sits, and what is refused

          Under the synopsis, above the rating: the back of a browse box puts its two verbs
          after the blurb for the same reason — `box.ts`'s *"the front of the box sells
          nothing; the back is where you decide"* — and this screen is the long form of
          that back. `flexWrap`, because at twice the text size two controls are wider than
          a phone; the Discover row has carried that comment since it was written.

          **Refused: a third control.** `docs/research/09-app-first-pivot.md` §6.178 is
          about a row that grew to eight, and this screen already carries a rating, a
          poster override, Add to list, Where to watch, content warnings and a season list.
          Two is what the decision needs.

          Still two. The first now has two faces rather than a face and a disabled state:
          **Track** when you are not, **Stop tracking** when you are. The excuse that stood
          here — *"there is no stop tracking; `repo.ts` has no such writer"* — was true and
          is spent. §6.191 took the decision it deferred: `dropped`, not a deleted row, so
          what happens to your watch history is not the question. Nothing happens to it.
        */}
        {title && (
          <View style={styles.decide}>
            <Button
              onPress={shelf === 'library' ? () => void stopTracking(titleId) : track}
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
              onPress={() => void addToWatchlist(titleId, title.kind)}
              disabled={shelf === 'watchlist'}
              tone="secondary"
              label={shelf === 'watchlist' ? COPY.watchlist.alreadyOn : COPY.controls.watchlist}
              name={COPY.controls.addToWatchlist(title.name)}
            />
          </View>
        )}

        <View style={styles.ratingBlock}>
          <Section>{COPY.title.yourRating}</Section>
          <StarRating
            of={title?.name ?? 'this title'}
            value={rating?.value}
            onChange={(value) =>
              value === undefined ? clearRating(titleId) : rate(titleId, value)
            }
          />
        </View>

        {/* Only for something you are tracking: an override is stored on the library
            row, so there is nowhere to put one otherwise. */}
        {libraryItem && (
          <View style={styles.posterEdit}>
            {posterDraft === undefined ? (
              <Pressable
                onPress={() => setPosterDraft(libraryItem.posterOverride ?? '')}
                hitSlop={REACH.inline}
                accessibilityRole="button"
                style={tap}
              >
                <Text style={styles.posterToggle}>
                  {libraryItem.posterOverride ? COPY.controls.changePoster : COPY.controls.differentPoster}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.posterRow}>
                <Field
                size="row"
                label={COPY.fields.posterUrl}
                value={posterDraft}
                onChange={setPosterDraft}
                placeholder={COPY.fields.posterUrlPlaceholder}
                keyboardType="url"
                autoFocus
                autoCapitalize="none"
                style={styles.grow}
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
                <Pressable
                  onPress={() => setPosterDraft(undefined)}
                  hitSlop={REACH.inline}
                  accessibilityRole="button"
                  accessibilityLabel={COPY.controls.cancelPoster}
                >
                  <Text style={styles.posterCancel}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Above the episode list on purpose. Someone who has decided what to watch and
            not how is asking one question, and it should not be below a hundred rows. */}
        <WhereToWatch titleId={titleId} />

        {/* Asked for repeatedly: a doesthedogdie-style heads-up inside the tracker.
            Collapsed, so it spoils nothing unasked. */}
        <ContentWarnings titleId={titleId} />

        {loading && seasons.length === 0 && (
          <>
            <ActivityIndicator color={theme.workingMark} style={styles.loading} />
            <Note accessibilityLiveRegion="polite">{COPY.title.loadingEpisodes}</Note>
          </>
        )}

        {seasons.map(([season, list], index) => {
          const summary = summaries[index];
          const expanded = open === season;
          return (
            <View key={season} style={styles.season}>
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
                  <Chevron points={disclosure(expanded)} color={theme.inkSecondary} />
                }
              />
              {expanded &&
                list.map((episode) => (
                  <EpisodeRow
                    key={episode.id}
                    episode={episode}
                    seriesId={titleId}
                    watched={watched?.has(episode.id) ?? false}
                    rewatches={counts?.get(episode.id) ?? 0}
                  />
                ))}
            </View>
          );
        })}
      </ScrollView>
    </>
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
  const rating = useLive(() => db.ratings.get(episode.id), [episode.id]);
  // §6.145, and `RATING_OPEN` is the rule rather than a literal `false` here — the same
  // shape `compose.ts` gave the comments composer and the calendar's panel.
  const [ratingOpen, setRating] = useState(RATING_OPEN);

  async function toggle() {
    if (watched) {
      await unwatchLatest(episode.id);
    } else {
      await markWatched({
        targetId: episode.id,
        seriesId,
        runtimeMin: episode.runtimeMin,
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  const named = episodeName(episode.name, episode.number);
  const which = [`season ${episode.season} episode ${episode.number}`, named]
    .filter(Boolean)
    .join(', ');

  return (
    <BaseRow
      title={episodeHeading(episode.number, episode.name)}
      // The ink step and the stroke both come from `struck`, which the component takes
      // from `CrossOff` — this row spelled out its own `crossedOff` before, and a row free
      // to spell its own is a row free to pick a different colour.
      struck={watched}
      disabled={!aired && !watched}
      // The day, named — `2026-09-06` on this row and `Sun, Sep 6` on the calendar was
      // one episode with two answers, three tabs apart. `episodeWhen` owns both the
      // naming and the verb in front of it.
      meta={`${episodeWhen(episode.airDate)}${
        episode.runtimeMin ? ` · ${episode.runtimeMin}m` : ''
      }${
        // Requested across r/Letterboxd, r/Simkl and r/Serializd.
        rewatches > 1 ? ` · watched ${rewatches}×` : ''
      }`}
      // What an unaired episode gets instead of a ring. The whole reason `disabled` steps
      // the ink rather than fading it: "not yet" has to read differently from "broken".
      tag={!aired && !watched ? COPY.title.notYet : undefined}
      trailing={
        /* The `checked` this used to carry sat on `accessibilityRole="button"`, which has
           no way to announce it — §6.95's defect on the control it matters most on. */
        <CrossOff
          watched={watched}
          disabled={!aired && !watched}
          onChange={toggle}
          // The season, because two episodes can be "5, Episode 5" on one page. Doc 6 §5's
          // rule is that every name in a list of rows carries what tells it from its
          // neighbours, and the episode number alone does not once a show has two seasons.
          name={watched ? `Unmark ${which}` : `Mark ${which} watched`}
          onUndo={() => void unwatchLatest(episode.id)}
          undoName={`Undo marking ${which} watched`}
        />
      }
      under={
        <View style={styles.episodeUnder}>
          {/* Every episode row carries a React and a Talk. Read in a list they are the
              same two words repeated down the screen, so the names carry the episode. */}
          {/* `Button`s, because the web's equivalents measured 31×16 and 21×16 as bare
              underlined text in `under` — thirty-six controls a third of the height a
              thumb needs. `hitSlop` covered it here; the component makes the drawn
              control the right size rather than the touchable region around it. */}
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
              — r/Letterboxd. A film's rating does not get whatever space the controls
              leave over. Only offered once watched, so the offer's presence is a state.
              Revealed rather than resident since §6.145: `StarRating` is 240 wide in a
              350-wide row, and sixty empty outlines down a season said nothing. */}
          {watched && (
            <Button
              size="inline"
              tone="quiet"
              label={ratingLabel(rating?.value)}
              name={`${ratingAction(rating?.value)} ${which}`}
              onPress={() => setRating((open) => !open)}
            />
          )}
          {/* The five, on a line of their own — which is what `StarRating`'s own doc asks
              its callers for, and what the title's own rating already got. */}
          {ratingOpen ? (
            <View style={styles.episodeStars}>
              <StarRating
                of={which}
                value={rating?.value}
                onChange={(value) => {
                  if (value === undefined) void clearRating(episode.id);
                  else void rate(episode.id, value);
                  setRating(false);
                }}
              />
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  /** A field that shares its row with a button. Layout, which the call site owns. */
  grow: { flex: 1, minWidth: 0 },
  posterEdit: { marginBottom: 12 },
  posterToggle: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posterCancel: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.title.name },
  content: { padding: SCREEN.edge, gap: 16, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  header: { flexDirection: 'row', gap: 16 },
  headerBody: { flex: 1, gap: 6 },
  year: { color: theme.inkSecondary },
  overview: { color: theme.inkSecondary, fontSize: text.s16, lineHeight: leadingOf(text.s16, leading.l143), fontFamily: type.family.prose.name },
  /** The two verbs. Wraps, because at 200% text two controls are wider than a phone. */
  decide: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ratingBlock: { gap: 6 },
  loading: { marginTop: 24 },

  season: { gap: 6 },

  /** The five, when revealed: its own line, never beside the buttons. */
  episodeStars: { width: '100%' },
  episodeUnder: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },

});
