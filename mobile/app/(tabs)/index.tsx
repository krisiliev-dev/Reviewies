import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUpNext, markWatched, type UpNextEntry } from '@reviewies/core/data/repo';
import { openCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { db } from '@reviewies/core/data/db';
import { Poster } from '../../src/ui/Poster';
import { radius, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';

/**
 * The home screen, and the one the whole product is judged on.
 *
 * From r/tvtime, stated more forcefully than any other requirement:
 * "The only important thing in an app is that it opens directly to the page where I
 * can see and mark the next episodes of my shows."
 *
 * So: no dashboard, no feed, no onboarding carousel. The list, and a button. Same
 * rule as the web version, and the logic behind it is the same code.
 */
export default function UpNextScreen() {
  const entries = useLive(() => getUpNext(), []);
  const libraryCount = useLive(() => db.library.count(), []);

  if (entries === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ActivityIndicator color={theme.accent} style={styles.loading} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Up Next</Text>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {libraryCount === 0
                ? 'Nothing tracked yet.'
                : 'All caught up — nothing has aired that you have not seen.'}
            </Text>
            <Link href="/search" asChild>
              <Pressable style={styles.cta}>
                <Text style={styles.ctaText}>Find something to watch</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          entries.map((entry) => <Row key={entry.seriesId} entry={entry} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ entry }: { entry: UpNextEntry }) {
  const { episode } = entry;
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onWatched() {
    setBusy(true);
    try {
      // Optimistic by construction: the write goes to SQLite and the change listener
      // re-runs the query. Nothing waits on a network round-trip.
      await markWatched({
        targetId: episode.id,
        seriesId: entry.seriesId,
        runtimeMin: episode.runtimeMin,
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // How TV Time worked, and named as a failing in two of its successors. Only when
      // there is an account behind it — otherwise there is no conversation to open and
      // this would be a dead end. Catching up in bulk uses its own control, which never
      // navigates, so this cannot interrupt a run of episodes.
      //
      // The web has done this since it shipped; the phone, which is the platform this
      // product is now built around, quietly did not.
      if (openCommentsAfterWatch() && syncConfigured()) {
        router.push(`/comments/${encodeURIComponent(episode.id)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.push(`/title/${encodeURIComponent(entry.seriesId)}`)}>
        <Poster url={entry.posterUrl} name={entry.seriesName} />
      </Pressable>

      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.title}>
          {entry.seriesName}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          S{episode.season}E{episode.number} · {episode.name}
        </Text>
        {/* A count, not a vague "NEW" badge — the most repeated complaint on Trakt's
            roadmap. */}
        <Text style={styles.remaining}>
          {entry.remaining === 0
            ? 'Last one'
            : `${entry.remaining} more episode${entry.remaining === 1 ? '' : 's'}`}
        </Text>
      </View>

      <Pressable
        onPress={onWatched}
        disabled={busy}
        // Large target: this gets tapped in the dark, one-handed.
        style={({ pressed }) => [styles.watched, pressed && styles.pressed]}
        accessibilityLabel={`Mark ${entry.seriesName} S${episode.season}E${episode.number} watched`}
      >
        <Text style={styles.watchedText}>Watched</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  loading: { marginTop: 48 },
  content: { padding: 16, gap: 8 },
  heading: { color: theme.text, fontSize: 30, fontWeight: '700', marginBottom: 8 },

  empty: { gap: 20, paddingTop: 8 },
  emptyText: { color: theme.muted, fontSize: 16 },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: theme.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  ctaText: { color: theme.ink, fontWeight: '600', fontSize: 16 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: radius.xl,
    padding: 10,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: theme.text, fontSize: 16, fontWeight: '600' },
  subtitle: { color: theme.muted, fontSize: 14 },
  remaining: { color: theme.muted, fontSize: 12 },

  watched: {
    backgroundColor: theme.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  watchedText: { color: theme.ink, fontWeight: '700', fontSize: 14 },
});
