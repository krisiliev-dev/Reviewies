import { Tabs } from 'expo-router';
import { TabIcon } from '../../src/ui/TabIcon';
import { TAB_BAR, TAB_ICON_SIZE, TAB_MARKER, type TabIconName } from '@reviewies/core/ui/tabIcon';
import { View, useWindowDimensions, type ColorValue } from 'react-native';
import { leadingOf, space, theme } from '../../src/ui/theme';
import { text, type, leading } from '@reviewies/core/tokens';

/**
 * Five tabs, and no more.
 *
 * The web app carries eight, which is already too many for a phone — iOS convention
 * caps a tab bar at five before it collapses into "More", and the loudest single
 * finding in the research was that people want this simple. So the four things done
 * daily get a tab, and everything else lives one level down.
 *
 * Up Next is first and is the initial route, because the most forcefully stated
 * requirement in the whole research was that the app opens straight onto the episodes
 * you can mark.
 */
/** The label's line box, which the bar's height is measured from. */
const LABEL_LINE = leadingOf(text.s12, leading.l143);

/**
 * The bar's own height, from the parts it holds rather than from a number.
 *
 * `s8` of breathing room, the active-tab rule, the gap above the glyph, the glyph, the
 * label's line, `s8` again. React Navigation's default is sized for a 10pt label; `s12`
 * needs more, and a literal here would be the same unowned number one layer up.
 *
 * This said "the 24pt glyph, the 4pt gap under it" and got three things wrong at once. The
 * glyph is `TAB_ICON_SIZE`, 22 — `size.tap` is the WCAG 2.5.8 target floor, which is a
 * different fact that happens to be a number. The gap is `TAB_MARKER.gap` and it is *above*
 * the glyph, not under it. And `TAB_MARKER.thickness` was not in the budget at all, so the
 * column drew 3 + 4 + 22 = 29 in the 28 that was allowed — one point over, which is exactly
 * the shape that clipped "Up Next" into "Un Next" when the label went to `s12` without the
 * box around it moving. The parts are named now, so the sum cannot drift from the column
 * again.
 *
 * What a source guard cannot see: this is a budget, not a measurement. `tabBarStyle` could
 * still eat the room back with its own `paddingBottom`, and React Navigation has spacing of
 * its own inside the item. Measured in the export at 390x844, the tab item is 52pt with 46
 * of content in it before this change and 51 with 44 after — the slack goes up by one.
 *
 * ## One term of the six is in a unit the reader can change
 *
 * This sprint, and the composition above is what makes it a one-term repair rather than a rewrite.
 * `space.s8`, `TAB_MARKER.thickness`, `TAB_MARKER.gap` and `TAB_ICON_SIZE` are device pixels
 * and stay where they are put. `LABEL_LINE` is a `lineHeight`, and React Native scales one of
 * those by the reader's font scale on both shipping platforms — iOS multiplies it by the same
 * `effectiveFontSizeMultiplier` as the glyphs, Android converts it with `toPixelFromSP`. So
 * at 200% the label wants 34 of the 17 this sum allowed it and the bar is seventeen points
 * short of its own contents, while `height` — not a unit anything scales — holds at 62.
 *
 * Measured in the export at 390x844, where the disagreement is visible even though the cause
 * is not: the phone's tab item is **78x51 at 100%, 200% and 300% alike**, against the web's
 * 78x63, 92x102 and 195x140. The web's bar grows with the words because CSS was asked for a
 * ratio; this one was asked for a number.
 *
 * The export cannot confirm the repair, and that is worth saying rather than glossing:
 * `react-native-web` pins `Dimensions.fontScale` to 1, so `fontScale` here is 1 in every
 * check this repo can run and the sum is byte-for-byte what it was. What is checkable is that
 * it is the *label's* term being scaled and not the whole budget — scaling the padding and
 * the glyph too would be a second defect wearing the first one's face — and
 * `phoneTextScaling.test.ts` allows a font scale on a box for exactly this while forbidding
 * it on the `lineHeight` two lines below, which the platform already scales.
 */
const tabBarHeight = (fontScale: number) =>
  space.s8 +
  TAB_MARKER.thickness +
  TAB_MARKER.gap +
  TAB_ICON_SIZE +
  LABEL_LINE * fontScale +
  space.s8;

export default function TabLayout() {
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.ink,
        tabBarInactiveTintColor: theme.inkSecondary,
        /*
         * `s12`, up from a raw 10, and the bar has to be told about it.
         *
         * The default tab bar height is sized for the 10pt label React Navigation assumes;
         * migrating the label onto the scale without raising the bar clipped the descenders
         * off all five words — "Up Next" photographed as "Un Next". A step is not a step
         * until the box around it is one too.
         */
        tabBarStyle: {
          backgroundColor: theme.ground,
          borderTopColor: theme.strokeHairline,
          height: tabBarHeight(fontScale),
          paddingBottom: space.s8,
        },
        tabBarLabelStyle: {
          fontSize: text.s12,
          lineHeight: LABEL_LINE,
          fontFamily: type.family.title.name,
        },
        sceneStyle: { backgroundColor: theme.ground },
      }}
    >
      {/*
        The active tab is marked by a rule, not only by being brighter.

        §6.90 replaced a pink active tint with `ink` on `ink.secondary`, which is a
        brightness step where there used to be a hue — and said so as a regression rather
        than shipping it quietly. This is the replacement the direction specified: the
        `TAB_MARKER` rule above the active tab. Colour is no longer the only channel
        carrying the most important piece of wayfinding in the app, which is also what
        makes it survive being read by somebody who cannot separate those two greys.
      */}
      {/*
        From the table, not five hand-written lines. "The same five the web has" was two
        lists agreeing by hand, which is how they came to agree about *which* five and
        disagree about what each one is drawn with (§6.140).
      */}
      {TAB_BAR.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{ title: tab.label, tabBarIcon: icon(tab.icon) }}
        />
      ))}
    </Tabs>
  );
}

/**
 * Drawings, from the table both platforms read.
 *
 * This said "Glyphs rather than an icon library — a vector icon pack is a dependency and a
 * build step for five symbols that a font already has. If the set grows or these render
 * badly on a real device, that is the point to reach for one."
 *
 * Both halves were wrong, and §6.140 has the whole of it. A font does **not** already have
 * them: `app/src/ui/TabIcon.tsx` measured, in a browser, four sprints before that sentence
 * was still standing, that `▶` draws in full colour, `❏` as an empty square and `◔` as a
 * two-pixel sliver — a glyph's appearance belongs to whatever font the device happens to
 * have. And the trigger could never fire, because nothing in this build has ever run on a
 * real device, so "if these render badly on a real device" is a condition nobody is in a
 * position to observe.
 */
function icon(name: TabIconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <View style={{ alignItems: 'center' }}>
      {/*
        Above the glyph and the width of it, so the rule reads as a marker on the tab
        rather than as an underline on the word. Three numbers, from `TAB_MARKER` rather
        than from here: they were written out on both platforms and the gap had already
        drifted — 4 here against the web's 2, with `space.test.ts` right to pass both.
      */}
      <View
        style={{
          height: TAB_MARKER.thickness,
          width: TAB_MARKER.width,
          marginBottom: TAB_MARKER.gap,
          backgroundColor: focused ? theme.ink : 'transparent',
        }}
      />
      <TabIcon name={name} color={color} />
    </View>
  );
}
