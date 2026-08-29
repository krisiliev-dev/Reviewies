import {
  CHEVRON_PATH,
  CHEVRON_TURN,
  MARK_BOX,
  TICK_PATH,
  type ChevronDirection,
} from '@reviewies/core/ui/mark';

/**
 * The DOM renderer of `core/src/ui/mark.ts`. The decisions are there.
 *
 * Stroked rather than filled: a chevron and a tick are strokes, and a stroke keeps its
 * weight when the mark is scaled, which a filled outline of a stroke does not.
 * `currentColor`, so a mark takes the ink of whatever it sits in.
 */
export function Chevron({ points, className = '' }: { points: ChevronDirection; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}
      className={`h-[1em] w-[1em] shrink-0 ${className}`}
    >
      <path
        d={CHEVRON_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`rotate(${CHEVRON_TURN[points]} ${MARK_BOX / 2} ${MARK_BOX / 2})`}
      />
    </svg>
  );
}

export function Tick({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}
      className={`h-[1em] w-[1em] shrink-0 ${className}`}
    >
      <path
        d={TICK_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
