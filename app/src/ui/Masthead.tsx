import type { ReactNode } from 'react';
import { MASTHEAD, type MastheadLevel } from '@reviewies/core/ui/masthead';
import type { HeadingDepth } from '@reviewies/core/ui/section';

/**
 * The Tailwind renderer of `core/src/ui/masthead.ts`. The decisions are there.
 *
 * The type here was already right and guarded; the **gap under it** was not. Twenty `<h1>`s
 * carried seven different spacings across three treatments, so a screen's title sat closer
 * to its content on some screens than on others for no reason anybody had chosen.
 *
 * Class literals because Tailwind v4 compiles from source text; `masthead.test.ts` holds
 * them to the table.
 */

const LEVEL_CLASS = {
  masthead: 'text-s30 font-display font-bold mb-s16',
  page: 'text-s24 font-title font-semibold mb-s12',
  sub: 'text-s20 font-title font-semibold',
} as const satisfies Record<MastheadLevel, string>;

export function Masthead({
  children,
  level = 'masthead',
  className = '',
}: {
  children: ReactNode;
  level?: MastheadLevel;
  /** Padding and layout only — the type and the gap belong to the table. */
  className?: string;
}) {
  /*
   * From the table, not from the level. `level === 'sub' ? 'h2' : 'h1'` said the same
   * thing and said it here, which is how the phone came to disagree: its renderer had no
   * equivalent line and react-native-web defaulted every heading to `<h1>`. One number,
   * read twice, cannot drift.
   */
  const Tag = `h${MASTHEAD[level].depth}` as `h${HeadingDepth}`;
  return <Tag className={`${LEVEL_CLASS[level]} ${className}`}>{children}</Tag>;
}
