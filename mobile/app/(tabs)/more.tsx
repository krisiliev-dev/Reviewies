import { SURFACE } from '@reviewies/core/ui/surface';
import { COPY } from '@reviewies/core/copy';
import { MORE_INDEX } from '@reviewies/core/ui/moreIndex';
import { Chevron } from '../../src/ui/Mark';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStats } from '@reviewies/core/data/repo';
import { formatDuration } from '@reviewies/core/stats/compute';
import { db } from '@reviewies/core/data/db';
import { ATTRIBUTION_ORDER, attributionLines } from '@reviewies/core/ui/attribution';
import { usingFixtures } from '@reviewies/core/metadata/index';
import { syncConfigured } from '@reviewies/core/sync/auth';
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
/**
 * Two rows this platform has and the web does not, then the four it shares.
 *
 * The shared four are `MORE_INDEX`'s — labels and descriptions both, which were typed out
 * on each platform separately until §6.176. The two above them stay here on purpose, and
 * for a different reason each: the web reaches its account panel from another screen, and
 * the web has **no row for the remote anywhere** — `App.tsx` mounts `RemoteDrawer` at the
 * root, so it is a fixed tab on the right edge of every screen rather than a destination.
 * Putting either in the shared table would claim a parity that does not exist.
 *
 * That second sentence used to read "its remote from a control in the masthead", which is
 * not where it is and never was. §6.178 corrected it in `moreIndex.ts` and not in this
 * copy of it, so the wrong reason went on shipping in the file the table was extracted
 * from — §6.106's lesson landing on the very sprint that quoted it.
 */
const LINKS = [
  { href: '/account', label: 'Account', detail: 'Optional — adds sync and the shared layer' },
  { href: '/remote', label: COPY.controls.remote, detail: 'Control a TV on your Wi-Fi, directly' },
  ...MORE_INDEX.map((row) => ({ href: row.route, label: row.label, detail: row.detail })),
];

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
        <Masthead>{COPY.screens.more}</Masthead>

        <View style={styles.card}>
          <Note>{COPY.app.localFirst}</Note>
          {/* The other half of the stance. The web's copy of this carries the reasoning:
              `localFirst` is true on every build, and a build with no Supabase variables
              has no account for it to point at — not signed out, absent. `seams.md` §10's
              shape, drawn only where the thing is not. */}
          {!syncConfigured() && <Note>{COPY.app.syncAbsent}</Note>}
          {counts && (
            <View style={styles.stats}>
              <Stat label={COPY.stats.watches} value={counts.watches} />
              <Stat label={COPY.stats.tracked} value={counts.library} />
              <Stat label={COPY.screens.watchlist} value={counts.watchlist} />
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
              to: link.href,
            }}
            trailing={<Chevron points="right" color={theme.inkSecondary} />}
          />
        ))}

        <View style={styles.footer}>
          {usingFixtures() ? (
            <Note level="footnote">
              Running on sample data. Set a TMDB token to use real metadata.
            </Note>
          ) : (
            /* The words and their order from the rule; the placement is this screen's. */
            attributionLines(ATTRIBUTION_ORDER, usingFixtures()).map((line) => (
              <Note key={line} level="footnote">
                {line}
              </Note>
            ))
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
  /*
   * A figure on the card, not a plate on a plate. The web's copy of this has the
   * reasoning: the sunken ground painted inside `SURFACE.card` put every figure two
   * steps below its own container, and Stats draws the same four the other way. §6.168.
   */
  stat: { flex: 1 },
  statLabel: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  statValue: { color: theme.ink },


  footer: { marginTop: 16, gap: 4 },
});
