import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '@reviewies/core/data/db';
import {
  clearRating,
  hasAired,
  markWatched,
  rate,
  setPosterOverride,
  unwatchLatest,
  watchedEpisodeIds,
} from '@reviewies/core/data/repo';
import { getEpisodesCached, getTitleCached } from '@reviewies/core/metadata/index';
import type { CachedEpisode } from '@reviewies/core/domain/types';
import { Poster } from '../../src/ui/Poster';
import { ContentWarnings } from '../../src/ui/ContentWarnings';
import { WhereToWatch } from '../../src/ui/WhereToWatch';
import { AddToList } from '../../src/social/AddToList';
import { StarRating } from '../../src/ui/StarRating';
import { border, radius, tap, theme } from '../../src/ui/theme';
import { text, weight } from '@reviewies/core/tokens';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';
import { CrossOff } from '../../src/ui/CrossOff';
import { Row as BaseRow } from '../../src/ui/Row';
import { Button } from '../../src/ui/Button';

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
  /** `undefined` means not editing; a string means the field is open with that draft. */
  const [posterDraft, setPosterDraft] = useState<string>();

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
    const bySeason = new Map<number, CachedEpisode[]>();
    for (const episode of [...(episodes ?? [])].sort(
      (a, b) => a.season - b.season || a.number - b.number,
    )) {
      if (!bySeason.has(episode.season)) bySeason.set(episode.season, []);
      bySeason.get(episode.season)!.push(episode);
    }
    return [...bySeason.entries()];
  }, [episodes]);

  return (
    <>
      <Stack.Screen options={{ title: title?.name ?? 'Title' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Poster url={title?.posterUrl} name={title?.name ?? ''} width={96} height={144} />
          <View style={styles.headerBody}>
            <Text style={styles.title}>
              {title?.name ?? (failed || !loading ? COPY.title.loadFailed : 'Loading…')}
            </Text>
            {!title && (failed || !loading) && (
              <Pressable
                onPress={() => {
                  setFailed(false);
                  setLoading(true);
                  setAttempt((n) => n + 1);
                }}
                style={styles.retry}
                accessibilityRole="button"
                accessibilityLabel={COPY.title.tryAgain}
              >
                <Text style={styles.retryText}>{COPY.title.tryAgain}</Text>
              </Pressable>
            )}
            {title?.year ? <Text style={styles.year}>{title.year}</Text> : null}
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

        <View style={styles.ratingBlock}>
          <Text style={styles.ratingLabel}>{COPY.title.yourRating.toUpperCase()}</Text>
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
                hitSlop={8}
                accessibilityRole="button"
                style={tap}
              >
                <Text style={styles.posterToggle}>
                  {libraryItem.posterOverride ? 'Change poster' : 'Use a different poster'}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.posterRow}>
                <TextInput
                  value={posterDraft}
                  onChangeText={setPosterDraft}
                  placeholder="Image URL"
                  placeholderTextColor={theme.inkSecondary}
                  autoFocus
                  autoCapitalize="none"
                  style={styles.posterInput}
                  accessibilityLabel="Poster image URL"
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
                <Pressable
                  onPress={() => setPosterDraft(undefined)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel changing the poster"
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
          <ActivityIndicator color={theme.workingFill} style={styles.loading} />
        )}

        {seasons.map(([season, list]) => (
          <View key={season} style={styles.season}>
            <Text style={styles.seasonHeading}>Season {season}</Text>
            {list.map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                seriesId={titleId}
                watched={watched?.has(episode.id) ?? false}
                rewatches={counts?.get(episode.id) ?? 0}
              />
            ))}
          </View>
        ))}
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
  const router = useRouter();
  const aired = hasAired(episode);
  const rating = useLive(() => db.ratings.get(episode.id), [episode.id]);

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

  const which = `season ${episode.season} episode ${episode.number}, ${episode.name}`;

  return (
    <BaseRow
      title={`${episode.number}. ${episode.name}`}
      // The ink step and the stroke both come from `struck`, which the component takes
      // from `CrossOff` — this row spelled out its own `crossedOff` before, and a row free
      // to spell its own is a row free to pick a different colour.
      struck={watched}
      disabled={!aired && !watched}
      meta={`${aired ? episode.airDate : `Airs ${episode.airDate ?? 'TBA'}`}${
        episode.runtimeMin ? ` · ${episode.runtimeMin}m` : ''
      }${
        // Requested across r/Letterboxd, r/Simkl and r/Serializd.
        rewatches > 1 ? ` · watched ${rewatches}×` : ''
      }`}
      // What an unaired episode gets instead of a ring. The whole reason `disabled` steps
      // the ink rather than fading it: "not yet" has to read differently from "broken".
      tag={!aired && !watched ? 'NOT YET' : undefined}
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
              — r/Letterboxd. A film's rating does not get whatever space the controls
              leave over. Only offered once watched. */}
          {watched && (
            <StarRating
              of={which}
              value={rating?.value}
              onChange={(value) =>
                value === undefined ? clearRating(episode.id) : rate(episode.id, value)
              }
            />
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  posterEdit: { marginBottom: 12 },
  posterToggle: { color: theme.inkSecondary, fontSize: 12, textDecorationLine: 'underline' },
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posterInput: {
    flex: 1,
    minWidth: 0,
    color: theme.ink,
    fontSize: 14,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.none,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  posterCancel: { color: theme.inkSecondary, fontSize: 14 },
  content: { padding: 16, gap: 16, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  header: { flexDirection: 'row', gap: 16 },
  headerBody: { flex: 1, gap: 6 },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  retryText: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  title: { color: theme.ink, fontSize: 20, fontWeight: '700' },
  year: { color: theme.inkSecondary, fontSize: 14 },
  overview: { color: theme.inkSecondary, fontSize: 14, lineHeight: 20 },
  ratingBlock: { gap: 6 },
  ratingLabel: { color: theme.inkSecondary, fontSize: 11, letterSpacing: 0.6 },
  loading: { marginTop: 24 },

  season: { gap: 6 },
  seasonHeading: {
    color: theme.inkSecondary,
    fontSize: text.s12,
    fontWeight: weight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },

  episodeUnder: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },

});
