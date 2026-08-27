import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native';
import { useRemote } from './useRemote';
import { RemotePanel } from './RemotePanel';
import { radius, tap, theme } from '../ui/theme';
import { useReducedMotion } from '../ui/useReducedMotion';
import { color, duration, reduced as reducedMotion, z } from '@reviewies/core/tokens';

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
 */
const WIDTH = Math.min(300, Dimensions.get('window').width * 0.85);

export function RemoteDrawer() {
  const [open, setOpen] = useState(false);
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
      {/* The handle: a tab on the edge, always there, never in the way of the pad. */}
      {!open && (
        <Pressable
          onPress={() => setOpen(true)}
          style={styles.tab}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Open remote"
        >
          <Text style={styles.tabGlyph}>⌇</Text>
        </Pressable>
      )}

      {/* The scrim dismisses on a tap, which is what a scrim does. It is deliberately
          not a control: naming it would put a second "Close remote" in the reading
          order, saying the same thing as the button already in the drawer. */}
      {open && (
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} aria-hidden />
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
          <Text style={styles.title}>Remote</Text>
          <Pressable
            onPress={() => setOpen(false)}
            hitSlop={8}
            accessibilityRole="button"
            // Named, because "Close" on its own is what half the sheets in this app say.
            accessibilityLabel="Close remote"
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
  tab: {
    position: 'absolute',
    right: 0,
    top: '45%',
    paddingVertical: 16,
    paddingHorizontal: 6,
    // The handle is a thin tab by design; 24 wide is the floor for it still being a
    // target rather than a decoration.
    minWidth: 24,
    alignItems: 'center',
    // Was `theme.surface2` on `theme.ink` — 1.21:1. A 24pt handle has been on this edge
    // for sprints and every design reviewer independently reported the drawer as having
    // no affordance, because at that ratio it is not there. `strokeSignal` is the token
    // for a mark that means something, at 4.51 in the worst case.
    backgroundColor: color.dark.strokeSignal,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    zIndex: z.drawerHandle,
  },
  tabGlyph: { color: color.dark.ground, fontSize: 18 },
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
    backgroundColor: theme.ink,
    borderLeftWidth: 1,
    borderLeftColor: theme.edge,
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
  title: { color: theme.text, fontSize: 17, fontWeight: '600' },
  close: { color: theme.muted, fontSize: 15 },
  body: { padding: 16, paddingBottom: 48, gap: 16 },
});
