import { StyleSheet, Text, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { leadingOf, theme } from '../src/ui/theme';
import { Button } from '../src/ui/Button';
import { text, type, leading } from '@reviewies/core/tokens';
import { Note } from '../src/ui/Note';

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
      <Note>
        <Text style={styles.path}>{pathname}</Text> is not a screen in this app. It may be
        an old link, or a typo.
      </Note>
      {/* §6.34's scar — an array style through `expo-router`'s Link reaches the DOM as an
          index-keyed object and throws on first render, a blank page — is why these were
          written as one flat object each. `Button` takes the destination itself, so there
          is no Link to hand a style to. */}
      <Button to="/" tone="primary" size="page" label="Go to Up Next" name="Go to Up Next" />
      <Button
        to="/more"
        tone="secondary"
        size="page"
        label="See everything else"
        name="See everything else"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground, padding: 20, gap: 12 },
  title: { color: theme.ink, fontSize: text.s20, marginTop: 8, fontFamily: type.family.title.name },
  path: { color: theme.ink },
});
