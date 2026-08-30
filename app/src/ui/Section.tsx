import type { ReactNode } from 'react';
import { SECTION, type HeadingDepth, type SectionLevel } from '@reviewies/core/ui/section';

/**
 * The Tailwind renderer of `core/src/ui/section.ts`. The decisions are there.
 *
 * Written as class literals rather than assembled from `SECTION`, for the reason every
 * component in this directory carries: Tailwind v4 compiles from source text, so a class
 * built at runtime is a class that never gets generated.
 *
 * ## What holds them to the table, and what did not
 *
 * This paragraph used to say *"`section.test.ts` is what holds the literals to the table —
 * change `SECTION.group.caps` and the web fails until it follows"*, and that was false for
 * as long as it was written. That suite read this file three times — for
 * `'SECTION[level].depth'`, for the `as?:` prop type, and for the string `'mb-s8'` — and
 * never once compared these three constants to `SECTION`. Demonstrated rather than argued:
 * set `SECTION.section.ink` to `'inkTertiary'` and the phone follows while this file keeps
 * `text-ink-secondary`, thirteen clauses green; set `SECTION.group.gapBelow` to `space.s8`
 * and the phone follows while this file keeps `mb-s6`, thirteen clauses green.
 *
 * So the classes are now spelled in the **token namespace** — `text-s12`, `tracking-t83`,
 * `text-ink-secondary`, `mb-s8` — rather than on Tailwind's own scale, and the clause
 * *"writes the table's channels as classes the table can be compared to"* rebuilds each
 * one from `SECTION` and compares token by token. `mb-2` is also eight pixels; `mb-s8`
 * says which eight and can be derived from `gapBelow`. `choice.test.ts` §6.181 is the
 * pattern and the same defect: a renderer whose comment claimed a guard that was not there.
 */

/** `t83`, uppercase, secondary ink. The eyebrow twenty-three sites were writing by hand. */
const SECTION_CLASS =
  'text-s12 font-title font-semibold tracking-t83 text-ink-secondary uppercase';

/**
 * No caps, full ink, tracking off.
 *
 * `tracking-t0` is written out rather than left off: `t0` is a token whose value is zero,
 * an omitted tracking class is also zero, and only the first of the two can be compared to
 * `SECTION.group.track`. Caps are the exception and stay an absence, because `normal-case`
 * on an element nothing has uppercased is a class doing nothing — `caps: false` is held as
 * the absence of `uppercase`, which is what it means.
 */
const GROUP_CLASS = 'text-s12 font-title font-semibold tracking-t0 text-ink';

/**
 * Which list belongs to which level, as data.
 *
 * This was `level === 'group' ? GROUP_CLASS : SECTION_CLASS` at the call site below, which
 * puts the pairing in an expression rather than in a table — so a clause could hold both
 * strings to `SECTION` and still not know that `group` was the one getting the group's.
 * Indexed by `level`, as `GAP_CLASS` already was, it cannot hand either level the other's.
 *
 * The two strings stay named constants rather than being inlined here, because
 * `type.test.ts`'s face-and-weight sweep reads `^const [A-Z_]+ = '…'`, and folding them
 * into the record took both class lists out of its population — a floor that exists
 * precisely so a migration cannot quietly shrink what it covers.
 */
const LEVEL_CLASS = {
  section: SECTION_CLASS,
  group: GROUP_CLASS,
} as const satisfies Record<SectionLevel, string>;

const GAP_CLASS = {
  section: 'mb-s8',
  group: 'mb-s6',
} as const satisfies Record<SectionLevel, string>;

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
  const type = LEVEL_CLASS[level];
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
