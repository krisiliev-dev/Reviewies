import type { ReactNode } from 'react';
import { SECTION, type HeadingDepth, type SectionLevel } from '@reviewies/core/ui/section';

/**
 * The Tailwind renderer of `core/src/ui/section.ts`. The decisions are there.
 *
 * Written as class literals rather than assembled from `SECTION`, for the reason every
 * component in this directory carries: Tailwind v4 compiles from source text, so a class
 * built at runtime is a class that never gets generated. `section.test.ts` is what holds
 * the literals to the table — change `SECTION.group.caps` and the web fails until it
 * follows.
 */

/** `t83`, uppercase, secondary ink. The eyebrow twenty-three sites were writing by hand. */
const SECTION_CLASS =
  'text-s12 font-title font-semibold tracking-t83 text-ink-secondary uppercase';

/** No tracking, no caps, full ink. Three channels apart, and then the rule. */
const GROUP_CLASS = 'text-s12 font-title font-semibold text-ink';

const GAP_CLASS = { section: 'mb-s8', group: 'mb-s6' } as const;

export function Section({
  children,
  level = 'section',
  className = '',
  as,
}: {
  children: ReactNode;
  level?: SectionLevel;
  /** Margins and padding only — the type belongs to the table. */
  className?: string;
  /**
   * Only for the two places this is **not** a heading. `WhereToWatch` sits inside a card
   * with its own heading and `TitleDetail`'s rating label is a field label, not a section
   * — both were `span` and `p` before this component and stay that way, because a heading
   * element that is not a heading is worse than an unstyled one.
   *
   * It used to accept `'h2' | 'h3'` as well, and defaulted to `h2` for both levels — so a
   * dateline was a sibling of the section containing it rather than a child. The depth is
   * the table's now, and this escape hatch can only leave the outline, never re-rank it.
   */
  as?: 'p' | 'span';
}) {
  const Tag = as ?? (`h${SECTION[level].depth}` as `h${HeadingDepth}`);
  const type = level === 'group' ? GROUP_CLASS : SECTION_CLASS;
  if (!SECTION[level].rule) {
    return <Tag className={`${type} ${GAP_CLASS[level]} ${className}`}>{children}</Tag>;
  }
  /*
   * The rule runs from the words to the right edge, which is the whole of what makes a
   * dateline read as subordinate to the section above it. `docs/design/tokens.md` §4:
   * geometry rather than type, and it costs nothing.
   */
  return (
    <Tag className={`flex items-center gap-s8 ${GAP_CLASS[level]} ${className}`}>
      <span className={type}>{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-stroke-hairline" />
    </Tag>
  );
}
