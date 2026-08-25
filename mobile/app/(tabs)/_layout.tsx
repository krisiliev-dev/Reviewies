import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { theme } from '../../src/ui/theme';

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
          backgroundColor: theme.ink,
          borderTopColor: theme.edge,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontSize: 10 },
        sceneStyle: { backgroundColor: theme.ink },
      }}
    >
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
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 18, lineHeight: 22 }}>{glyph}</Text>
  );
}
