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
import { CatchUp } from '../../src/ui/CatchUp';
import { ImportFiles, ImportFormats } from '../../src/ui/ImportFiles';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { radius, tap, theme } from '../../src/ui/theme';
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
  // Owned by the screen rather than by the row that opens it. A catch-up completes by
  // removing its own row from Up Next, so a sheet living inside that row unmounts at
  // the exact moment it has something to tell you.
  const [catchingUp, setCatchingUp] = useState<{ seriesId: string; seriesName: string }>();
  // Held until dismissed rather than swapped out the moment the library stops being
  // empty. Importing puts shows in the library, which is exactly what stops this being
  // the first-run screen — and took the confirmation with it.
  const [imported, setImported] = useState<ImportReport>();
  const episodeCount = useLive(() => db.episodes.count(), []);

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

        {imported ? (
          <View style={styles.empty}>
            <Text style={styles.firstHeading}>Your history is in</Text>
            <Text style={styles.emptyText}>
              Imported {imported.watches} watch{imported.watches === 1 ? '' : 'es'}
              {imported.watchlist > 0 ? `, ${imported.watchlist} watchlist items` : ''}.
            </Text>
            {/* Said rather than hidden. An export carries names and dates and nothing
                else, so these shows have no episode lists, no artwork and no air dates
                until they are matched against a metadata provider — which is not built
                yet. "All caught up" instead would be a lie that reads as a broken app. */}
            <Text style={styles.emptyText}>
              They are in your library under the names your export carried. Matching them
              to artwork and episode lists is not built yet, so Up Next will stay quiet
              about them until it is — your history is safe in the meantime, and Stats
              already counts it.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => setImported(undefined)}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Continue</Text>
            </Pressable>
          </View>
        ) : entries.length === 0 && libraryCount === 0 ? (
          /**
           * The first minute.
           *
           * This app exists because TV Time shut down, and what it said to someone
           * arriving with years of history in a zip was "Nothing tracked yet" and a
           * search box — the import that would have rescued all of it two taps away
           * behind a tab called Data. So the migration is the offer, and searching is
           * the alternative rather than the other way round.
           */
          <View style={styles.empty}>
            <Text style={styles.firstHeading}>Bring your history with you</Text>
            <Text style={styles.emptyText}>
              TV Time is gone. If you got your data out — or pulled it off your phone —
              this reads it and picks up where you left off.
            </Text>
            <ImportFormats />
            <ImportFiles label="Import from TV Time" onImported={setImported} />
            <Text style={styles.emptyText}>
              Nothing to import? Search for a show and start from there.
            </Text>
            <Link href="/search" asChild>
              <Pressable style={styles.cta} accessibilityRole="link">
                <Text style={styles.ctaText}>Find something to watch</Text>
              </Pressable>
            </Link>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {episodeCount === 0
                ? 'Nothing here yet. The shows in your library came from an import and have no episode lists until they are matched to a provider.'
                : 'All caught up — nothing has aired that you have not seen.'}
            </Text>
            <Link href="/search" asChild>
              <Pressable style={styles.cta} accessibilityRole="link">
                <Text style={styles.ctaText}>Find something to watch</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          entries.map((entry) => (
            <Row key={entry.seriesId} entry={entry} onCatchUp={setCatchingUp} />
          ))
        )}
      </ScrollView>

      {catchingUp && (
        <CatchUp
          seriesId={catchingUp.seriesId}
          seriesName={catchingUp.seriesName}
          onDone={() => setCatchingUp(undefined)}
        />
      )}
    </SafeAreaView>
  );
}

function Row({
  entry,
  onCatchUp,
}: {
  entry: UpNextEntry;
  onCatchUp: (series: { seriesId: string; seriesName: string }) => void;
}) {
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
      <Pressable
        onPress={() => router.push(`/title/${encodeURIComponent(entry.seriesId)}`)}
        accessibilityRole="link"
        // A poster is an image with no text in it. Without this the control announces
        // as nothing at all, which is what a tappable View amounts to.
        accessibilityLabel={`Open ${entry.seriesName}`}
      >
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

        {/* Quiet, because it is the exception. Coming back to a show after a week away
            and marking six episodes one at a time is the thing this avoids. */}
        <Pressable
          onPress={() => onCatchUp({ seriesId: entry.seriesId, seriesName: entry.seriesName })}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Catch up on ${entry.seriesName}`}
          style={tap}
        >
          <Text style={styles.catchUp}>Caught up further?</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onWatched}
        disabled={busy}
        // Large target: this gets tapped in the dark, one-handed.
        style={({ pressed }) => [styles.watched, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
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

  empty: { gap: 14, paddingTop: 8 },
  firstHeading: { color: theme.text, fontSize: 20, fontWeight: '700' },
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
  catchUp: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline', marginTop: 2 },
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
