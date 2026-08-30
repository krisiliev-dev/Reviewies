import { useEffect, useRef } from 'react';
import { COPY } from '@reviewies/core/copy';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native';
import { useRemote } from './useRemote';
import { RemotePanel } from './RemotePanel';
import { REACH, tap, theme } from '../ui/theme';
import { useReducedMotion } from '../ui/useReducedMotion';
import { duration, reduced as reducedMotion, z, text, type } from '@reviewies/core/tokens';

/**
 * The remote, hidden in a drawer to the side — which is what the brief asked for.
 *
 * The phone had the controls and put them on a separate screen reached through the More
 * tab, so using the remote during an episode meant leaving Watching Mode: the clock
 * stopped being visible, the reaction stream went away, and coming back meant finding
 * the episode again. A remote you have to abandon what you are doing to reach is not the
 * thing that was described.
 *
 * It stays mounted and slides, rather than being conditionally rendered, so the device
 * you scanned for is still selected the second time you open it. Scanning a subnet takes
 * a few seconds and doing it again because a component unmounted would be its own answer
 * to why nobody uses the feature.
 *
 * ## Why it does not own its own handle any more
 *
 * It used to draw a tab on the right edge at `top: '45%'`, above a comment reading *"a tab
 * on the edge, always there, **never in the way of the pad**"*. `23-watching-live.png` is
 * that claim photographed: the tab sits squarely over the emoji pad's fourth column,
 * between *Cliffhanger* and *Dead*. §6.41 — an excuse that outlives its condition — and
 * §6.139, a claim about the product proved against the product.
 *
 * The reason there is no better `top` is that on the phone **this drawer is mounted on
 * exactly one screen**, and that screen is a full-bleed grid of twenty targets under a
 * control row under a reaction stream. There is no free band on it, so a floating tab
 * covers something wherever it goes, and what it covered was two targets.
 *
 * So the trigger belongs *in* the layout rather than over it: Watching Mode draws a named
 * `Remote` button in the control row beside *Pause*, *Hold* and the two seeks, which is
 * where its siblings already are. This component takes `open` and `onClose` and draws the
 * drawer.
 *
 * The web keeps its edge tab, and the difference is a difference in the situation rather
 * than drift: `App.tsx` mounts that one app-wide and it is the web's **only** route to the
 * remote — there is no `/remote` screen there, where the phone has `app/remote.tsx` in the
 * More tab — and it floats over screens that are lists rather than grids.
 */
const WIDTH = Math.min(300, Dimensions.get('window').width * 0.85);

export function RemoteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slide = useRef(new Animated.Value(0)).current;
  const remote = useRemote();
  const reduced = useReducedMotion();

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      // Reduced motion means it is simply there or not there. A slide across most of
      // the screen is exactly the kind of movement the setting is asking about.
      //
      // Read from a table rather than decided here. This line was the reason
      // `motion.test.ts` exists: an accessibility decision made at a call site is one a
      // future call site can silently omit.
      duration: (reduced ? reducedMotion : duration).drawer,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide, reduced]);

  return (
    <>
      {/* The scrim dismisses on a tap, which is what a scrim does. It is deliberately
          not a control: naming it would put a second "Close remote" in the reading
          order, saying the same thing as the button already in the drawer. */}
      {open && (
        <Pressable style={styles.scrim} onPress={onClose} aria-hidden />
      )}

      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [
              { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [WIDTH, 0] }) },
            ],
          },
        ]}
        // Hidden from screen readers when closed: it is off-screen, not merely invisible,
        // and a control nobody can see should not be reachable by swiping through them.
        //
        // `aria-hidden` rather than the two React Native props that were here: those are
        // platform-specific and react-native-web implements neither, so on the web build
        // the closed drawer's thirteen keys sat in the reading order the whole time. This
        // one prop maps to both of them natively and to aria-hidden on the web, which is
        // the only place the bug existed. The smoke suite now checks it.
        //
        // Not fixed, deliberately: under react-native-web the closed drawer's keys are
        // still in the Tab order, because React Native has no `inert` and taking them
        // out means threading a `focusable` prop through every control in the panel.
        // That build is a test artifact — only app/dist is deployed — and on a device
        // there is no Tab key, so this would be work for nobody. The equivalent bug in
        // the web app, which people do use, is fixed there with `inert`.
        pointerEvents={open ? 'auto' : 'none'}
        aria-hidden={!open}
      >
        <View style={styles.head}>
          <Text style={styles.title}>{COPY.controls.remote}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={REACH.inline}
            accessibilityRole="button"
            // Named, because "Close" on its own is what half the sheets in this app say.
            accessibilityLabel={COPY.controls.closeRemote}
            style={tap}
          >
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <RemotePanel remote={remote} />
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: z.drawerScrim,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: WIDTH,
    backgroundColor: theme.ground,
    borderLeftWidth: 1,
    borderLeftColor: theme.strokeHairline,
    zIndex: z.drawer,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
  },
  title: { color: theme.ink, fontSize: text.s16, fontFamily: type.family.title.name },
  close: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.title.name },
  body: { padding: 16, paddingBottom: 48, gap: 16 },
});
