import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BUSY, SIZE, TONE, type ButtonContract } from '@reviewies/core/ui/button';

/**
 * The DOM renderer of `core/src/ui/button.ts`. The decisions are there; this is Tailwind.
 *
 * Class strings rather than inline styles, so `legible()` can read the computed colour off
 * a rendered element and `colourNames.test.ts` can read the name off the source. An inline
 * style would satisfy neither.
 */
interface Props extends ButtonContract {
  onPress?: () => void;
  /**
   * Submits the form it is inside. Web-only, because React Native has no forms.
   *
   * `components.md` already lists this kind of thing — focus versus press, `inert`,
   * `aria-checked` versus `accessibilityState` — as documented divergence rather than
   * shared code. A `type="button"` inside a `<form>` silently stops submitting it, which
   * is the sort of change a migration makes without anything noticing.
   */
  submit?: boolean;
  to?: string;
  className?: string;
  children?: ReactNode;
}

/** Written out rather than interpolated, because Tailwind's scanner reads source text. */
const TONE_CLASS = {
  primary: 'bg-action-fill text-action-label',
  secondary: 'border border-stroke-signal text-ink',
  quiet: 'text-ink-secondary underline underline-offset-4',
  destructive: 'border border-trouble text-trouble',
} as const;

/**
 * Disabled drops the fill for the outline and never fades.
 *
 * `appearance.test.ts` bans `disabled:opacity` on a filled action and says why: it gave a
 * maroon block with dark red lettering, which reads as broken rather than as waiting. The
 * tertiary ink holds 4.87:1; an opacity holds nothing in particular.
 */
const DISABLED_CLASS = 'border border-stroke-hairline bg-transparent text-ink-tertiary';

const SIZE_CLASS = {
  page: 'min-h-12 px-5 py-3 text-base',
  row: 'min-h-11 px-4 py-2 text-sm',
  inline: 'min-h-11 px-2 py-1 text-xs',
} as const;

export function Button({
  label,
  name,
  tone = 'secondary',
  size = 'row',
  disabled,
  busy,
  selected,
  onPress,
  submit,
  to,
  className = '',
  children,
}: Props) {
  const boxed = tone !== 'quiet';
  const classes = [
    'inline-flex items-center justify-center gap-2 text-center font-medium',
    boxed ? 'rounded-pill' : '',
    SIZE_CLASS[size],
    disabled ? DISABLED_CLASS : TONE_CLASS[tone],
    // Press is a thickening and a ground step, at 0ms. Never a transition, so the app is
    // identical with motion reduced and `motion.test.ts` has no ternary to find.
    disabled ? '' : 'active:border-2 active:bg-ground-raised',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inside = (
    <>
      <span>{label}</span>
      {children}
      {/* Busy keeps the label and rules under it. It never becomes a spinner: a spinner
          has no text to read, which `account.tsx` worked around rather than avoided. */}
      {busy ? (
        <span
          aria-hidden="true"
          className="ml-2 w-4 self-end border-t-mark border-working-fill"
          style={{ height: BUSY.underline }}
        />
      ) : null}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} aria-label={name} className={classes}>
        {inside}
      </Link>
    );
  }
  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={onPress}
      aria-label={name}
      aria-busy={busy || undefined}
      aria-pressed={selected}
      disabled={disabled}
      className={classes}
    >
      {inside}
    </button>
  );
}

/** Re-exported so a screen never has to reach past the component for its own metrics. */
export const BUTTON_SIZE = SIZE;
export const BUTTON_TONE = TONE;
