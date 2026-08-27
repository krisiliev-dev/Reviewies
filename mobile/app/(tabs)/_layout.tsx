import { Tabs } from 'expo-router';
import { Text, View, type ColorValue } from 'react-native';
import { border, space, theme } from '../../src/ui/theme';

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
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.ground,
          borderTopColor: theme.strokeHairline,
        },
        tabBarActiveTintColor: theme.ink,
        tabBarInactiveTintColor: theme.inkSecondary,
        tabBarLabelStyle: { fontSize: 10 },
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
      <Text style={{ color, fontSize: 18, lineHeight: 22 }}>{glyph}</Text>
    </View>
  );
}
