import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '@reviewies/core/data/db';
import {
  hasAired,
  markWatched,
  rate,
  unwatchLatest,
  watchedEpisodeIds,
} from '@reviewies/core/data/repo';
import { getEpisodesCached, getTitleCached } from '@reviewies/core/metadata/index';
import type { CachedEpisode } from '@reviewies/core/domain/types';
import { Poster } from '../../src/ui/Poster';
import { StarRating } from '../../src/ui/StarRating';
import { radius, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';

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

  /** Rewatch counts, which is the whole reason watches are events and not booleans. */
  const counts = useLive(async () => {
    const events = await db.watches.where('seriesId').equals(titleId).toArray();
    const map = new Map<string, number>();
    for (const event of events) map.set(event.targetId, (map.get(event.targetId) ?? 0) + 1);
    return map;
  }, [titleId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await getTitleCached(titleId);
      await getEpisodesCached(titleId);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [titleId]);

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
            <Text style={styles.title}>{title?.name ?? 'Loading…'}</Text>
            {title?.year ? <Text style={styles.year}>{title.year}</Text> : null}
            <StarRating
              value={rating?.value}
              onChange={(value) =>
                value === undefined ? db.ratings.delete(titleId) : rate(titleId, value)
              }
            />
          </View>
        </View>

        {title?.overview ? <Text style={styles.overview}>{title.overview}</Text> : null}

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
        {watched && (
          <View style={styles.episodeRating}>
            <StarRating
              size={18}
              value={rating?.value}
              onChange={(value) =>
                value === undefined ? db.ratings.delete(episode.id) : rate(episode.id, value)
              }
            />
          </View>
        )}
      </View>

      <Pressable
        onPress={() => router.push(`/watching/${encodeURIComponent(episode.id)}`)}
        style={styles.react}
      >
        <Text style={styles.reactText}>React</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push(`/comments/${encodeURIComponent(episode.id)}`)}
        style={styles.react}
      >
        <Text style={styles.reactText}>Talk</Text>
      </Pressable>

      <Pressable
        onPress={toggle}
        disabled={!aired && !watched}
        style={[styles.mark, watched && styles.marked, !aired && !watched && styles.disabled]}
      >
        <Text style={[styles.markText, watched && styles.markedText]}>
          {watched ? 'Watched' : 'Mark'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 40 },
  header: { flexDirection: 'row', gap: 16 },
  headerBody: { flex: 1, gap: 6 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700' },
  year: { color: theme.muted, fontSize: 14 },
  overview: { color: theme.muted, fontSize: 14, lineHeight: 20 },
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
  episodeRating: { marginTop: 2 },

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
