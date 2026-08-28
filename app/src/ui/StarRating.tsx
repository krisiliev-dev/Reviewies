import { useState } from 'react';

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
          className="relative flex min-h-[24px] min-w-[48px] items-center justify-center"
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
          <span aria-hidden="true" className={`${text} leading-none`}>
            {shown >= star ? (
              <span className="text-working-mark">★</span>
            ) : shown >= star - 0.5 ? (
              // Half star: a filled star clipped to its left half over an empty one.
              <span className="relative inline-block">
                <span className="text-stroke-signal">★</span>
                <span className="absolute inset-0 w-1/2 overflow-hidden text-working-mark">★</span>
              </span>
            ) : (
              <span className="text-stroke-signal">★</span>
            )}
          </span>
        </span>
      ))}
      {value !== undefined && (
        <span className="ml-1.5 text-s12 text-ink-secondary tabular-nums">{value.toFixed(1)}</span>
      )}
    </div>
  );
}
