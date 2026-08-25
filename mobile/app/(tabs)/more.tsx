import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStats } from '@reviewies/core/data/repo';
import { formatDuration } from '@reviewies/core/stats/compute';
import { db } from '@reviewies/core/data/db';
import {
  JUSTWATCH_ATTRIBUTION,
  TMDB_ATTRIBUTION,
} from '@reviewies/core/metadata/provider';
import { usingFixtures } from '@reviewies/core/metadata/index';
import { radius, theme } from '../../src/ui/theme';
import { useLive } from '../../src/useLive';

/**
 * Everything not done daily.
 *
 * The tab bar holds five, so the rest lives here. Ordered by how often it is actually
 * opened, not by how interesting it is to build.
 */
const LINKS = [
  { href: '/stats', label: 'Stats', detail: 'Runtime-weighted, and your year in review' },
  { href: '/data', label: 'Your data', detail: 'Import from TV Time, export everything' },
] as const;

export default function MoreScreen() {
  const counts = useLive(
    async () => ({
      watches: await db.watches.count(),
      library: await db.library.count(),
      watchlist: await db.watchlist.count(),
    }),
    [],
  );
  const stats = useLive(() => getStats('all'), []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>More</Text>

        <View style={styles.card}>
          <Text style={styles.cardText}>
            Everything lives on this device. Nothing here needs an account, and nothing
            is withheld — this is the whole point of the app.
          </Text>
          {counts && (
            <View style={styles.stats}>
              <Stat label="Watches" value={counts.watches} />
              <Stat label="Tracked" value={counts.library} />
              <Stat label="Watchlist" value={counts.watchlist} />
            </View>
          )}
          {stats && stats.minutes > 0 && (
            <Text style={styles.cardText}>
              {/* formatDuration rather than minutes/60: 90 minutes rendered as
                  "1 hours watched", which is wrong twice over. */}
              {formatDuration(stats.minutes)} watched, counted by actual runtime.
            </Text>
          )}
        </View>

        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} asChild>
            <Pressable style={styles.link}>
              <View style={styles.linkBody}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkDetail}>{link.detail}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Link>
        ))}

        <View style={styles.footer}>
          {usingFixtures ? (
            <Text style={styles.footerText}>
              Running on sample data. Set a TMDB token to use real metadata.
            </Text>
          ) : (
            <>
              <Text style={styles.footerText}>{TMDB_ATTRIBUTION}</Text>
              <Text style={styles.footerText}>{JUSTWATCH_ATTRIBUTION}</Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  content: { padding: 16, gap: 10 },
  heading: { color: theme.text, fontSize: 30, fontWeight: '700', marginBottom: 8 },

  card: { backgroundColor: theme.surface, borderRadius: radius.xl, padding: 16, gap: 12 },
  cardText: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: theme.surface2, borderRadius: radius.md, padding: 10 },
  statLabel: { color: theme.muted, fontSize: 11 },
  statValue: { color: theme.text, fontSize: 20, fontWeight: '700' },

  link: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkBody: { flex: 1 },
  linkLabel: { color: theme.text, fontSize: 16, fontWeight: '600' },
  linkDetail: { color: theme.muted, fontSize: 13 },
  chevron: { color: theme.muted, fontSize: 22 },

  footer: { marginTop: 16, gap: 4 },
  footerText: { color: theme.muted, fontSize: 10, lineHeight: 15 },
});
