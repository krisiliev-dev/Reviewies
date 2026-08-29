import { useState } from 'react';
import { Data } from './Data';
import { STAR_BOX, STAR_PATH, starFill } from '@reviewies/core/ui/star';

/**
 * Half-star rating, the convention people already know from Letterboxd.
 *
 * Half stars matter: a five-point scale collapses too much, and users coming from
 * Letterboxd expect the granularity. Tapping the star you already chose clears it,
 * because "I rated this by accident" needs an escape that is not a separate control.
 *
 * Ten targets in a row, which makes target size the whole design problem here. Sized by
 * the glyph, each half came out seven to eleven pixels wide — well under the 24 CSS
 * pixels WCAG 2.5.8 asks for, and small enough that mis-tapping was common enough to
 * need the tap-again-to-clear escape in the first place. The star now carries a minimum
 * width of 48px so each half clears 24, and the glyph is centred inside it rather than
 * defining it. Five of those is 240px, which is why both callers give this its own line
 * rather than putting it beside something.
 */
export function StarRating({
  value,
  onChange,
  of,
  size = 'md',
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
  size?: 'sm' | 'md';
}) {
  const [hover, setHover] = useState<number>();
  const shown = hover ?? value ?? 0;
  const text = size === 'sm' ? 'text-s16' : 'text-s24';

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(undefined)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          // Pixels, not rem. WCAG 2.5.8 is written in CSS pixels and does not scale
          // with text — and written as `min-w-12` this doubled along with everything
          // else at 200%, making the control 480 wide and pushing four and a half
          // stars through five off the side of the screen.
          /* The size class sits here now rather than on the glyph: the drawing is `1em`
             square, so the box that sets the text size is what sizes it. */
          className={`relative flex min-h-[24px] min-w-[48px] items-center justify-center ${text}`}
        >
          {/* Two overlapping hit areas per star: left half sets x.5, right sets x. */}
          <button
            aria-label={`Rate ${of} ${star - 0.5} stars`}
            onMouseEnter={() => setHover(star - 0.5)}
            onClick={() => onChange(value === star - 0.5 ? undefined : star - 0.5)}
            className="absolute inset-y-0 left-0 z-10 w-1/2"
          />
          <button
            aria-label={`Rate ${of} ${star} stars`}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(value === star ? undefined : star)}
            className="absolute inset-y-0 right-0 z-10 w-1/2"
          />
          <Star fill={starFill(shown, star)} />
        </span>
      ))}
      {value !== undefined && (
        <Data value={value.toFixed(1)} size="s12" className="ml-1.5 text-ink-secondary" />
      )}
    </div>
  );
}

/**
 * One path, painted to a fraction — the drawing lives in `core/src/ui/star.ts`.
 *
 * This used to type `★` three ways and the phone typed `★ ⯪ ☆`, so an unrated episode was
 * a solid grey star here and a hollow outline there. §6.143 has the table. The outline
 * underneath and the fill clipped over it means a half star is a clip at 50% rather than a
 * second glyph, on both platforms, from one path.
 *
 * `currentColor` is not used: the two halves are different colours, and both come from the
 * token layer through the generated utilities the stroke and fill classes name.
 */
function Star({ fill }: { fill: number }) {
  const id = `star-${Math.round(fill * 100)}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${STAR_BOX} ${STAR_BOX}`}
      className="h-[1em] w-[1em] shrink-0"
    >
      <path d={STAR_PATH} fill="none" strokeWidth="1.5" className="stroke-stroke-signal" />
      {fill > 0 && (
        <>
          <defs>
            <clipPath id={id}>
              <rect x="0" y="0" width={STAR_BOX * fill} height={STAR_BOX} />
            </clipPath>
          </defs>
          <path d={STAR_PATH} clipPath={`url(#${id})`} className="fill-working-mark" />
        </>
      )}
    </svg>
  );
}
