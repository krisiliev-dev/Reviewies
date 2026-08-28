import { Tabs } from 'expo-router';
import { Text, View, type ColorValue } from 'react-native';
import { border, size, space, theme } from '../../src/ui/theme';
import { text, type } from '@reviewies/core/tokens';

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
/**
 * The bar's own height, from the parts it holds rather than from a number.
 *
 * The 24pt glyph, the 4pt gap under it, the label's 16pt line, and `s8` of breathing room
 * top and bottom. React Navigation's default is sized for a 10pt label; `s12` needs more,
 * and a literal here would be the same unowned number one layer up.
 */
const TAB_BAR_HEIGHT = space.s8 + size.tap + space.s4 + text.s16 + space.s8;

export default function TabLayout() {
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
          height: TAB_BAR_HEIGHT,
          paddingBottom: space.s8,
        },
        tabBarLabelStyle: {
          fontSize: text.s12,
          lineHeight: text.s16,
          fontFamily: type.family.title.name,
        },
        sceneStyle: { backgroundColor: theme.ground },
      }}
    >
      {/*
        The active tab is marked by a rule, not only by being brighter.

        §6.90 replaced a pink active tint with `ink` on `ink.secondary`, which is a
        brightness step where there used to be a hue — and said so as a regression rather
        than shipping it quietly. This is the replacement the direction specified: a 3pt
        `border.tally` rule above the active tab. Colour is no longer the only channel
        carrying the most important piece of wayfinding in the app, which is also what
        makes it survive being read by somebody who cannot separate those two greys.
      */}
      <Tabs.Screen name="index" options={{ title: 'Up Next', tabBarIcon: icon('▶') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('⌕') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('✦') }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist', tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}

/**
 * Glyphs rather than an icon library.
 *
 * A vector icon pack is a dependency and a build step for five symbols that a font
 * already has. If the set grows or these render badly on a real device, that is the
 * point to reach for one.
 */
function icon(glyph: string) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <View style={{ alignItems: 'center' }}>
      {/*
        Above the glyph and the width of it, so the rule reads as a marker on the tab
        rather than as an underline on the word. `border.tally` is 3 — the same token the
        shelf rule uses, because they are the same idea: this one, of several.
      */}
      <View
        style={{
          height: border.tally,
          width: space.s24,
          marginBottom: space.s4,
          backgroundColor: focused ? theme.ink : 'transparent',
        }}
      />
      <Text style={{ color, fontSize: text.s20, lineHeight: 22 }}>{glyph}</Text>
    </View>
  );
}
