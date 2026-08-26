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
import { radius, tap, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';
import { COPY } from '@reviewies/core/copy';

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
        <View style={styles.ratingBlock}>
          <Text style={styles.ratingLabel}>{COPY.title.yourRating.toUpperCase()}</Text>
          <StarRating
            value={rating?.value}
            onChange={(value) =>
              value === undefined ? clearRating(titleId) : rate(titleId, value)
            }
          />
        </View>

        {title && <AddToList titleId={titleId} kind={title.kind} />}

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
                  placeholderTextColor={theme.muted}
                  autoFocus
                  autoCapitalize="none"
                  style={styles.posterInput}
                  accessibilityLabel="Poster image URL"
                />
                <Pressable
                  onPress={async () => {
                    await setPosterOverride(titleId, posterDraft.trim() || undefined);
                    setPosterDraft(undefined);
                  }}
                  style={styles.posterSave}
                  accessibilityRole="button"
                  accessibilityLabel="Save this poster"
                >
                  <Text style={styles.posterSaveText}>Save</Text>
                </Pressable>
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
          <ActivityIndicator color={theme.accent} style={styles.loading} />
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

  return (
    <View style={styles.episode}>
      <View style={styles.episodeBody}>
        <Text numberOfLines={1} style={styles.episodeName}>
          <Text style={styles.episodeNumber}>{episode.number}. </Text>
          {episode.name}
        </Text>
        <Text style={styles.episodeMeta}>
          {aired ? episode.airDate : `Airs ${episode.airDate ?? 'TBA'}`}
          {episode.runtimeMin ? ` · ${episode.runtimeMin}m` : ''}
          {/* Requested across r/Letterboxd, r/Simkl and r/Serializd. */}
          {rewatches > 1 ? ` · watched ${rewatches}×` : ''}
        </Text>

        {/* "A series of 8 television episodes is really just a series of 8 films"
            — r/Letterboxd. Only offered once watched. */}
      </View>

      <Pressable
        onPress={() => router.push(`/watching/${encodeURIComponent(episode.id)}`)}
        style={styles.react}
        accessibilityRole="link"
        // Every episode row carries a React and a Talk. Read in a list they are the
        // same two words repeated down the screen.
        accessibilityLabel={`React along with episode ${episode.number}, ${episode.name}`}
      >
        <Text style={styles.reactText}>React</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push(`/comments/${encodeURIComponent(episode.id)}`)}
        style={styles.react}
        accessibilityRole="link"
        accessibilityLabel={`Comments on episode ${episode.number}, ${episode.name}`}
      >
        <Text style={styles.reactText}>Talk</Text>
      </Pressable>

      <Pressable
        onPress={toggle}
        disabled={!aired && !watched}
        style={[styles.mark, watched && styles.marked, !aired && !watched && styles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !aired && !watched, checked: watched }}
        accessibilityLabel={
          watched
            ? `Unmark episode ${episode.number}, ${episode.name}`
            : `Mark episode ${episode.number}, ${episode.name} watched`
        }
      >
        <Text style={[styles.markText, watched && styles.markedText]}>
          {watched ? 'Watched' : 'Mark'}
        </Text>
      </Pressable>

      {/* Same reason as the title's, and the same quote behind it: "a series of 8
          television episodes is really just a series of 8 films". A film's rating does
          not get whatever space three buttons leave over. */}
      {watched && (
        <View style={styles.episodeRating}>
          <StarRating
            value={rating?.value}
            onChange={(value) =>
              value === undefined ? clearRating(episode.id) : rate(episode.id, value)
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  posterEdit: { marginBottom: 12 },
  posterToggle: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posterInput: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 14,
    backgroundColor: theme.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  posterSave: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: theme.accent,
  },
  posterSaveText: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  posterCancel: { color: theme.muted, fontSize: 14 },
  content: { padding: 16, gap: 16, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 40 },
  header: { flexDirection: 'row', gap: 16 },
  headerBody: { flex: 1, gap: 6 },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: theme.surface2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  title: { color: theme.text, fontSize: 20, fontWeight: '700' },
  year: { color: theme.muted, fontSize: 14 },
  overview: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  ratingBlock: { gap: 6 },
  ratingLabel: { color: theme.muted, fontSize: 11, letterSpacing: 0.6 },
  loading: { marginTop: 24 },

  season: { gap: 6 },
  seasonHeading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },

  episode: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  episodeBody: { flex: 1, minWidth: 0, gap: 2 },
  episodeName: { color: theme.text, fontSize: 14 },
  episodeNumber: { color: theme.muted },
  episodeMeta: { color: theme.muted, fontSize: 11 },
  episodeRating: { width: '100%', marginTop: 4 },

  react: {
    backgroundColor: theme.surface2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  reactText: { color: theme.muted, fontSize: 12 },

  mark: {
    backgroundColor: theme.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  marked: { backgroundColor: theme.surface2 },
  markText: { color: theme.ink, fontSize: 12, fontWeight: '700' },
  markedText: { color: theme.muted, fontWeight: '400' },
  disabled: { opacity: 0.3 },
});
