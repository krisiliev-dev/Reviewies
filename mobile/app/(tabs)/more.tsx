import { SURFACE } from '@reviewies/core/ui/surface';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type } from '@reviewies/core/tokens';
import { useLive } from '../../src/useLive';
import { Row as BaseRow } from '../../src/ui/Row';
import { Data } from '../../src/ui/Data';
import { Note } from '../../src/ui/Note';
import { Masthead } from '../../src/ui/Masthead';

/**
 * Everything not done daily.
 *
 * The tab bar holds five, so the rest lives here. Ordered by how often it is actually
 * opened, not by how interesting it is to build.
 */
const LINKS = [
  { href: '/account', label: 'Account', detail: 'Optional — adds sync and the shared layer' },
  { href: '/remote', label: 'Remote', detail: 'Control a TV on your Wi-Fi, directly' },
  { href: '/calendar', label: 'Upcoming', detail: 'What is airing, and what to be told about' },
  { href: '/lists', label: 'Lists', detail: 'Film and television in the same list' },
  { href: '/people', label: 'People', detail: 'Your handle, following, blocking' },
  { href: '/stats', label: 'Stats', detail: 'Runtime-weighted, and your year in review' },
  { href: '/data', label: 'Your data', detail: 'Import from TV Time, export everything' },
] as const;

export default function MoreScreen() {
  const router = useRouter();
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
        <Masthead>More</Masthead>

        <View style={styles.card}>
          <Note>
            Everything lives on this device. Nothing here needs an account, and nothing
            is withheld — this is the whole point of the app.
          </Note>
          {counts && (
            <View style={styles.stats}>
              <Stat label="Watches" value={counts.watches} />
              <Stat label="Tracked" value={counts.library} />
              <Stat label="Watchlist" value={counts.watchlist} />
            </View>
          )}
          {stats && stats.minutes > 0 && (
            <Note>
              {/* formatDuration rather than minutes/60: 90 minutes rendered as
                  "1 hours watched", which is wrong twice over. */}
              {formatDuration(stats.minutes)} watched, counted by actual runtime.
            </Note>
          )}
        </View>

        {/* A contents page, which is what `density="index"` is: no poster, so the row is
            a thumb tall rather than a poster tall. */}
        {LINKS.map((link) => (
          <BaseRow
            key={link.href}
            density="index"
            title={link.label}
            meta={link.detail}
            open={{
              // The detail line is the half that says what the screen is for, and it is
              // a separate Text node — read on its own, "Upcoming" and "›" is all a
              // screen reader gets.
              name: `${link.label} — ${link.detail}`,
              run: () => router.push(link.href),
            }}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
        ))}

        <View style={styles.footer}>
          {usingFixtures() ? (
            <Note level="footnote">
              Running on sample data. Set a TMDB token to use real metadata.
            </Note>
          ) : (
            <>
              <Note level="footnote">{TMDB_ATTRIBUTION}</Note>
              <Note level="footnote">{JUSTWATCH_ATTRIBUTION}</Note>
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
      <Data value={value} size="s20" style={styles.statValue} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground },
  content: { padding: SCREEN.edge, gap: 12 },

  card: { backgroundColor: theme[SURFACE.card], borderRadius: radius.plate, padding: 16, gap: 12 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: theme.groundWell, borderRadius: radius.plate, padding: 12 },
  statLabel: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  statValue: { color: theme.ink },

  chevron: { color: theme.inkSecondary, fontSize: text.s20, fontFamily: type.family.body.name },

  footer: { marginTop: 16, gap: 4 },
});
