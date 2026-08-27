import { StyleSheet, Text, View } from 'react-native';
import { Link, Stack, usePathname } from 'expo-router';
import { radius, theme } from '../src/ui/theme';

/**
 * The screen for an address that is not a screen.
 *
 * expo-router ships its own: a centred "404 — The requested path could not be found",
 * and nothing else. Zero controls, measured — no link home, no tab bar, no way out
 * except the system back gesture, which a person who arrived from a shared link does
 * not have. §6.40 found it by asking which states the suites had never driven; nothing
 * had ever loaded an address the app does not have, on either platform.
 *
 * The web app's equivalent is `app/src/screens/NotFound.tsx`, and the two say the same
 * thing on purpose.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Text style={styles.title}>Nothing at this address</Text>
      <Text style={styles.body}>
        <Text style={styles.path}>{pathname}</Text> is not a screen in this app. It may be
        an old link, or a typo.
      </Text>
      {/* One flat object each, not `[styles.cta, tap]`. §6.34: an array style handed to
          expo-router's Link reaches the DOM as an index-keyed object under
          react-native-web and throws on the first render, which is a blank page. */}
      <Link href="/" style={styles.cta}>
        Go to Up Next
      </Link>
      <Link href="/more" style={styles.ctaQuiet}>
        See everything else
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground, padding: 20, gap: 12 },
  title: { color: theme.ink, fontSize: 22, fontWeight: '600', marginTop: 8 },
  body: { color: theme.inkSecondary, fontSize: 15, lineHeight: 22 },
  path: { color: theme.ink },
  cta: {
    backgroundColor: theme.actionFill,
    color: theme.actionLabel,
    borderRadius: radius.pill,
    paddingVertical: 16,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
    minHeight: 24,
  },
  ctaQuiet: {
    backgroundColor: theme.groundRaised,
    color: theme.ink,
    borderRadius: radius.pill,
    paddingVertical: 16,
    textAlign: 'center',
    minHeight: 24,
  },
});
