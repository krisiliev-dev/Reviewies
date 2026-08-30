import type { ReactNode } from 'react';
import { PAD, padName } from '@reviewies/core/ui/padCell';
import { Note } from './Note';

/**
 * The DOM renderer of `core/src/ui/padCell.ts`. The decisions are there.
 *
 * Off is a rule and a step in the ink, never an opacity. This screen wrapped every cell in
 * `disabled:opacity-30`, which at twenty cells is a pad that reads as a failed render
 * rather than as a pad waiting for a clock — the same fade `appearance.test.ts` bans on a
 * filled control, on the one screen no design pass had ever seen.
 *
 * Written-out class strings rather than interpolation, for the reason `Button.tsx` gives:
 * Tailwind's scanner reads source text, so a class assembled at runtime is never compiled.
 * That is why this file writes the off classes out and `padCell.test.ts` checks them
 * against `SURFACE_OFF`, while the phone reads the constant directly.
 */
const CELL = 'flex aspect-square flex-col items-center justify-center gap-1 rounded-plate';
/* No `active:scale-90`. A scale is a transform, and `WatchingMode.tsx` and `Row.tsx` each
   say in writing that press feedback here was never motion so Reduce Motion has nothing to
   substitute for — a transform needs a `reduced ?` branch to be honest, and neither of the
   two in this build had one. They were also the only two, at 0.90 here and 0.94 on the
   phone. §6.184. */
const READY = 'bg-ground-raised active:bg-ground-well';
const OFF = 'border-hairline border-stroke-hairline text-ink-tertiary';

export function PadCell({
  emoji,
  label,
  disabled,
  onPress,
}: {
  emoji: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      // The emoji is aria-hidden, so the label is the whole name — "Funny" alone does not
      // say it is something you do. `padName` owns the sentence for both platforms.
      aria-label={padName(label)}
      style={{ fontSize: PAD.glyph }}
      className={`${CELL} ${disabled ? OFF : READY}`}
    >
      <span aria-hidden="true">{emoji}</span>
      <Note level="footnote" as="span">{label}</Note>
    </button>
  );
}

/** The grid the cells sit in, so no screen decides the column count twice. */
export function PadGrid({ children }: { children: ReactNode }) {
  // `grid-cols-4` written out rather than derived from `PAD.columns`: the scanner reads
  // source text. The test holds the two against each other instead.
  return (
    <div className="grid flex-1 grid-cols-4 content-start gap-2 overflow-y-auto p-3">
      {children}
    </div>
  );
}
