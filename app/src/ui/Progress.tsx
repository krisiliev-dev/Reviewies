import { progressPercent, type ProgressSize } from '@reviewies/core/ui/progress';

/**
 * The Tailwind renderer of `core/src/ui/progress.ts`. The decisions are there.
 *
 * `bg-working-mark`, not `bg-working-fill`, and that is the component: amber on paper is
 * 1.77:1 and a bar has no ink on it to rescue it. In dark both resolve to the same colour,
 * which is why this went unseen — the failure only exists under `data-theme="light"`.
 */

const TRACK = 'w-full overflow-hidden border border-stroke-hairline';
const DONE = 'h-full bg-working-mark';

const SIZE_CLASS = {
  bar: 'h-s6 rounded-pill',
  rule: 'h-s2 rounded-none',
} as const satisfies Record<ProgressSize, string>;

export function Progress({
  value,
  max,
  label,
  size = 'bar',
  className = '',
}: {
  value: number;
  max: number;
  /**
   * What the bar is measuring. A bar with no name is a shape — §6.62 put two screenshots
   * side by side and the one without a figure beside it said "one show beat another" and
   * not by how much of what.
   */
  label: string;
  size?: ProgressSize;
  className?: string;
}) {
  const percent = progressPercent(value, max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`${TRACK} ${SIZE_CLASS[size]} ${className}`}
    >
      <div
        className={`${DONE} ${size === 'bar' ? 'rounded-pill' : ''}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
