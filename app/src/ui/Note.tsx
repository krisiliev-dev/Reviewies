import type { ReactNode } from 'react';
import type { NoteLevel } from '@reviewies/core/ui/note';

/**
 * The Tailwind renderer of `core/src/ui/note.ts`. The decisions are there.
 *
 * Class literals rather than assembled strings, because Tailwind v4 compiles from source
 * text; `note.test.ts` holds them to the table.
 */

const LEVEL_CLASS = {
  note: 'text-s14 leading-l143 text-ink-secondary',
  footnote: 'text-s12 leading-l143 text-ink-secondary',
} as const satisfies Record<NoteLevel, string>;

export function Note({
  children,
  level = 'note',
  className = '',
  as: Tag = 'p',
  ...rest
}: {
  children: ReactNode;
  level?: NoteLevel;
  /** Margins, padding and layout only — the type and the ink belong to the table. */
  className?: string;
  /**
   * `span` inside a sentence, `dt`/`dd` in a definition list, `li` in a list, `footer` for
   * the page's own small print. The element is the document's business; the type is not.
   */
  as?: 'p' | 'span' | 'div' | 'dd' | 'dt' | 'li' | 'footer';
  role?: string;
  'aria-live'?: 'polite' | 'assertive';
}) {
  return (
    <Tag className={`${LEVEL_CLASS[level]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
