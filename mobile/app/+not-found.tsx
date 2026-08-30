import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '@reviewies/core/copy';
import { Stack, usePathname } from 'expo-router';
import { theme } from '../src/ui/theme';
import { Button } from '../src/ui/Button';
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
 *
 * ## Where this screen's name is drawn, which took reading the export to settle
 *
 * The web draws it with `<Masthead level="page">` — a screen's own name, at depth 1 —
 * and `app/smoke.mjs` requires exactly that: `arrivedAt` waits for a **level-1 heading**
 * named "Nothing at this address", and it is the instrument the whole navigation half of
 * that suite is calibrated against.
 *
 * This screen used to draw a second name under a first. Served the export and read the
 * document: `/+not-found` rendered one heading, the navigator's
 * `<h1 aria-level="1">Not found</h1>` at 20px in ArchivoNarrow-SemiBold, and
 * "Nothing at this address" beneath it was a plain `<Text>` — announced as ordinary
 * prose, in a hand-copy of `MASTHEAD.sub`'s size and face, on a screen whose whole job
 * is to say what happened.
 *
 * So the `page` slot was already taken, and taken by the wrong words. On this platform a
 * pushed screen's name is the navigator's title — `stats.tsx`, `lists.tsx` and the other
 * seven all pass `COPY` straight to `Stack.Screen` and draw nothing in the body — and
 * `_layout.tsx` already sets that header in `MASTHEAD.sub`'s face and size. The fix is to
 * name it there, with the same constant the web names it with, and stop drawing it twice.
 * `'Not found'` was a bare literal besides, the only screen name in the app not coming
 * from `COPY`; measured, `COPY.app.notFound` sets 178px wide in a 390px header, so it
 * fits with a back chevron and room over.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: COPY.app.notFound }} />
      <Note>
        <Text style={styles.path}>{pathname}</Text> is not a screen in this app. It may be
        an old link, or a typo.
      </Note>
      {/* §6.34's scar — an array style through `expo-router`'s Link reaches the DOM as an
          index-keyed object and throws on first render, a blank page — is why these were
          written as one flat object each. `Button` takes the destination itself, so there
          is no Link to hand a style to. */}
      <Button to="/" tone="primary" size="page" label={COPY.controls.goToUpNext} name={COPY.controls.goToUpNext} />
      <Button
        to="/more"
        tone="secondary"
        size="page"
        label={COPY.controls.seeEverythingElse}
        name={COPY.controls.seeEverythingElse}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ground, padding: 20, gap: 12 },
  path: { color: theme.ink },
});
