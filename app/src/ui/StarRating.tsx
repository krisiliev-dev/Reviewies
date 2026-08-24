import { useState } from 'react';

/**
 * Half-star rating, the convention people already know from Letterboxd.
 *
 * Half stars matter: a five-point scale collapses too much, and users coming from
 * Letterboxd expect the granularity. Tapping the star you already chose clears it,
 * because "I rated this by accident" needs an escape that is not a separate control.
 */
export function StarRating({
  value,
  onChange,
  size = 'md',
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  size?: 'sm' | 'md';
}) {
  const [hover, setHover] = useState<number>();
  const shown = hover ?? value ?? 0;
  const text = size === 'sm' ? 'text-base' : 'text-2xl';

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(undefined)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className="relative">
          {/* Two overlapping hit areas per star: left half sets x.5, right sets x. */}
          <button
            aria-label={`${star - 0.5} stars`}
            onMouseEnter={() => setHover(star - 0.5)}
            onClick={() => onChange(value === star - 0.5 ? undefined : star - 0.5)}
            className="absolute inset-y-0 left-0 z-10 w-1/2"
          />
          <button
            aria-label={`${star} stars`}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(value === star ? undefined : star)}
            className="absolute inset-y-0 right-0 z-10 w-1/2"
          />
          <span aria-hidden="true" className={`${text} leading-none`}>
            {shown >= star ? (
              <span className="text-accent">★</span>
            ) : shown >= star - 0.5 ? (
              // Half star: a filled star clipped to its left half over an empty one.
              <span className="relative inline-block">
                <span className="text-edge">★</span>
                <span className="absolute inset-0 w-1/2 overflow-hidden text-accent">★</span>
              </span>
            ) : (
              <span className="text-edge">★</span>
            )}
          </span>
        </span>
      ))}
      {value !== undefined && (
        <span className="ml-1.5 text-xs text-muted tabular-nums">{value.toFixed(1)}</span>
      )}
    </div>
  );
}
