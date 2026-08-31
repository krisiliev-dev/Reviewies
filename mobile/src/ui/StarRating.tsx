import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';
import { STAR_BOX, STAR_PATH, starFill } from '@reviewies/core/ui/star';
import { theme } from './theme';
import { Data } from './Data';

/**
 * Half-star ratings.
 *
 * Half stars because whole ones were the most repeated request on r/Letterboxd, and
 * because a five-point scale without them is really a three-point scale in practice.
 *
 * Each star is two touch targets — left half, right half — which is the only way to
 * offer halves on a phone without a slider. Tapping the value you already have clears
 * it; a rating you cannot take back is worse than none, and there is nowhere else to
 * put an undo.
 *
 * Ten targets in a row makes target size the design problem. Sized by the glyph, each
 * half came out nine to fourteen pixels wide, against the 24 CSS pixels WCAG 2.5.8 asks
 * for — small enough that the tap-again-to-clear escape was covering for how often the
 * wrong one was hit. Each half is now at least 24 wide whatever the glyph is doing,
 * which makes the whole control 240 wide, which is why its callers give it a line of
 * its own rather than putting it beside something.
 */
const MIN_HALF = 24;
export function StarRating({
  value,
  onChange,
  of,
  size = 28,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  /**
   * What is being rated, for the ten star names.
   *
   * Required, because a title page carries two of these — the show's rating and the
   * rating on whichever episode is watched — and both announced "4 stars" with nothing
   * to say which four stars. Doc 6 §5: every name in a list carries what tells it from
   * its neighbours. Found by the smoke's name-collision check the day it was written.
   */
  of: string;
  size?: number;
}) {
  const set = (next: number) => onChange(next === value ? undefined : next);

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        return (
          <View
            key={star}
            style={[styles.star, { width: MIN_HALF * 2, height: Math.max(MIN_HALF, size) }]}
          >
            <Star fill={starFill(value, star)} size={size} />
            <Pressable
              style={styles.half}
              onPress={() => set(star - 0.5)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${of} ${star - 0.5} stars`}
            />
            <Pressable
              style={[styles.half, styles.right]}
              onPress={() => set(star)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${of} ${star} stars`}
            />
          </View>
        );
      })}
      {value !== undefined && <Data value={value.toFixed(1)} size="s12" style={styles.value} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  half: { position: 'absolute', top: 0, bottom: 0, left: 0, width: MIN_HALF },
  /**
   * The second half is placed, not un-placed.
   *
   * This was `{ left: undefined, right: 0 }` — cancel the first half's `left` and pin to the
   * other edge — and it laid out correctly on a device and wrongly in every measurement this
   * repository takes. React Native flattens the array, Yoga reads the undefined edge as
   * unset and honours `right`; `react-native-web` compiles each style object to atomic CSS
   * and **omits** a declaration whose value is `undefined`, so the `left: 0` above survived
   * and the box ended up with `left: 0; right: 0; width: 24`, which CSS resolves against
   * `right`. `design/cost.mjs` read the result: five pairs of 24x28 targets stacked two to a
   * rectangle at x = 16, 66, 116, 166, 216, where the web app's ten sit at 16, 40, 66, 90,
   * 116, 140, 166, 190, 216, 240. The later button in the document wins the tap, so the half
   * values — the whole reason this component exists — could not be pressed on that build.
   *
   * `MIN_HALF` is where the second half starts, because the box is `MIN_HALF * 2` wide. It
   * means the same thing to Yoga and to CSS and depends on no renderer's treatment of
   * `undefined`. `app/src/ui/phoneStyleUnset.test.ts` holds the rule.
   */
  right: { left: MIN_HALF },
  value: { color: theme.inkSecondary, marginLeft: 6 },
});

/**
 * One path, painted to a fraction — the drawing lives in `core/src/ui/star.ts`.
 *
 * The outline underneath and the fill clipped over it, so a half star is a clip at 50%
 * rather than a second glyph. `⯪` was the second glyph, and U+2BEA has thin font coverage;
 * §6.143 has the table of what the two platforms were each drawing.
 */
function Star({ fill, size }: { fill: number; size: number }) {
  const id = `star-${Math.round(fill * 100)}`;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${STAR_BOX} ${STAR_BOX}`}>
      <Path d={STAR_PATH} fill="none" stroke={theme.strokeSignal} strokeWidth={1.5} />
      {fill > 0 && (
        <>
          <Defs>
            <ClipPath id={id}>
              <Rect x="0" y="0" width={STAR_BOX * fill} height={STAR_BOX} />
            </ClipPath>
          </Defs>
          <Path d={STAR_PATH} fill={theme.workingMark} clipPath={`url(#${id})`} />
        </>
      )}
    </Svg>
  );
}
