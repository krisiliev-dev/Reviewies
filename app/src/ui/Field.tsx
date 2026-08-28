import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';
import { FIELD_LINES, type FieldSize } from '@reviewies/core/ui/field';

/**
 * The Tailwind renderer of `core/src/ui/field.ts`. The decisions are there.
 *
 * The important thing this component does is a thing it does *not* do: it never writes
 * `outline-none`. Seventeen sites did, with nothing putting a ring back, so `index.css`'s
 * two-ring `:focus-visible` — designed with an inner ring in the ground because a near-white
 * ring on a near-white fill is 1.00:1 — was switched off at every place a person types.
 *
 * Class literals rather than assembled strings, because Tailwind v4 compiles from source
 * text; `field.test.ts` holds them to the table.
 */

const BOX = 'w-full rounded-none border border-stroke-signal bg-transparent text-ink';

const SIZE_CLASS = {
  page: 'min-h-11 px-s16 py-s12 text-s16',
  row: 'min-h-11 px-s12 py-s8 text-s14',
} as const satisfies Record<FieldSize, string>;

export function Field({
  value,
  onChange,
  label,
  placeholder,
  size = 'page',
  multiline = false,
  className = '',
  onPaste,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  /** Announced name. A field with no label is a field only sighted users can fill in. */
  label: string;
  placeholder?: string;
  size?: FieldSize;
  multiline?: boolean;
  className?: string;
  type?: 'text' | 'email' | 'password' | 'url';
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  name?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => void;
  /** Pasting a screenshot straight into a comment is the actual flow people use. */
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const classes = `${BOX} ${SIZE_CLASS[size]} placeholder:text-ink-secondary ${className}`;
  if (multiline) {
    return (
      <textarea
        value={value}
        aria-label={label}
        placeholder={placeholder}
        rows={FIELD_LINES}
        className={`${classes} resize-y`}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onPaste={onPaste}
        {...rest}
      />
    );
  }
  return (
    <input
      value={value}
      aria-label={label}
      placeholder={placeholder}
      className={classes}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      {...rest}
    />
  );
}
