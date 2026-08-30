import Svg, { Path } from 'react-native-svg';
import { View, type ColorValue } from 'react-native';
import {
  TAB_ICON_BOX,
  TAB_ICON_PATHS,
  TAB_ICON_SIZE,
  type TabIconName,
} from '@reviewies/core/ui/tabIcon';

/**
 * The React Native renderer of `core/src/ui/tabIcon.ts`. The decisions are there.
 *
 * This file exists because the phone was typing its icons — `icon('⌕')`, `icon('✦')`,
 * `icon('☰')`, `icon('⋯')` — four sprints after the web proved in a browser what that does
 * to a glyph. The table's header has the measurements and the excuse that stood in the way.
 *
 * `color` rather than `currentColor`: React Native has no inherited paint, so the tab bar
 * hands down the colour React Navigation gives it for the state the tab is in.
 */
export function TabIcon({ name, color }: { name: TabIconName; color: ColorValue }) {
  return (
    /*
     * The `View` is here to be hidden. The label beside the icon is the name; a second one
     * is a thing to swipe past — but `Svg` is not a React Native primitive, it spreads its
     * props straight onto a native host component, so it is the one element in this app
     * where `aria-hidden` is *not* expanded into the two props a device reads. Carrying
     * those two on the `Svg` instead was worse than useless: react-native-svg's web build
     * passes unknown props through, and §6.173 measured
     * `importantForAccessibility="no-hide-descendants"` sitting on all ten `<svg>` elements
     * of the shipped export as an invalid HTML attribute, hiding nothing.
     *
     * A `View` wrapper costs no layout — the icon has a fixed width and height — and both
     * renderers know what `aria-hidden` on a container means.
     */
    <View aria-hidden>
      <Svg
        width={TAB_ICON_SIZE}
        height={TAB_ICON_SIZE}
        viewBox={`0 0 ${TAB_ICON_BOX} ${TAB_ICON_BOX}`}
      >
        <Path d={TAB_ICON_PATHS[name]} fill={color} />
      </Svg>
    </View>
  );
}
