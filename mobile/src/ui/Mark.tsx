import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
import {
  CHEVRON_PATH,
  CHEVRON_TURN,
  MARK_BOX,
  TICK_PATH,
  type ChevronDirection,
} from '@reviewies/core/ui/mark';

/**
 * The React Native renderer of `core/src/ui/mark.ts`. The decisions are there.
 *
 * `color` rather than `currentColor`: React Native has no inherited paint, so the call
 * site passes the ink the mark should take.
 */
export function Chevron({
  points,
  color,
  size = 16,
}: {
  points: ChevronDirection;
  color: ColorValue;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
      <Path
        d={CHEVRON_PATH}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`rotate(${CHEVRON_TURN[points]} ${MARK_BOX / 2} ${MARK_BOX / 2})`}
      />
    </Svg>
  );
}

export function Tick({ color, size = 20 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
      <Path
        d={TICK_PATH}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
