import type { ReactNode } from 'react';
import { Section } from './Section';

/**
 * The Tailwind renderer of `core/src/ui/block.ts`. The decisions are there.
 *
 * The gap is a literal class rather than assembled from `BLOCK`, for the reason every
 * component in this directory carries: Tailwind v4 compiles from source text, so a class
 * built at runtime is never generated. `block.test.ts` holds the literal to the table.
 *
 * The web's version of the drift was quieter than the phone's: `AccountPanel.tsx` and
 * `People.tsx` put `mb-1` — four pixels — between an `s16` heading and its content, inside
 * a raised card, while `Settings.tsx` two files away used `Section` with nothing boxed.
 */
export function Block({
  heading,
  children,
  className = '',
}: {
  heading: ReactNode;
  children: ReactNode;
  /** Margins only — the gap and the label belong to the table. */
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-s12 ${className}`}>
      <Section>{heading}</Section>
      {children}
    </div>
  );
}
