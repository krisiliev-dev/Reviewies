import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
import {
  CHEVRON_PATH,
  CHEVRON_SIZE,
  CHEVRON_TURN,
  MARK_BOX,
  MARK_STROKE,
  TICK_PATH,
  type ChevronDirection,
} from '@reviewies/core/ui/mark';

/**
 * The React Native renderer of `core/src/ui/mark.ts`. The decisions are there.
 *
 * `color` rather than `currentColor`: React Native has no inherited paint, so the call
 * site passes the ink the mark should take.
 *
 * The size is the same story one step further. The web's mark is `1em`, so it takes the size
 * of the text it sits beside and nobody had to write a number; an `Svg` inherits no font, so
 * this side needs one — and four call sites each typed their own, which is how one of them
 * came to draw at 20 against the web's 16. The default is `CHEVRON_SIZE` now and no call
 * site names a size.
 */
export function Chevron({
  points,
  color,
  size = CHEVRON_SIZE,
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
        strokeWidth={MARK_STROKE}
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
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
