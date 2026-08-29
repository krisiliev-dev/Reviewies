import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
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
    <Svg
      width={TAB_ICON_SIZE}
      height={TAB_ICON_SIZE}
      viewBox={`0 0 ${TAB_ICON_BOX} ${TAB_ICON_BOX}`}
      // The label beside it is the name; a second one is a thing to swipe past.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={TAB_ICON_PATHS[name]} fill={color} />
    </Svg>
  );
}
