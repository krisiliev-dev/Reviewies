import { splitFigure, type DataKind } from '@reviewies/core/ui/data';

/**
 * The Tailwind renderer of `core/src/ui/data.ts`. The decisions are there.
 *
 * A number you read rather than a word: a figure tile, a sync backlog, a running clock, a
 * star rating, an episode code. Ten sites on the web and thirteen on the phone, agreeing
 * on nothing — the star rating carried `tabular-nums` with no face here and the face with
 * no tabular there, which is one value drawn two wrong ways.
 *
 * Class literals rather than assembled strings, because Tailwind v4 compiles from source
 * text; `data.test.ts` holds them to the table.
 */

/** `font-data` is `DATA_FACE`, `font-medium` is the weight that file has. */
const FIGURE_CLASS = 'font-data font-medium tabular-nums';

const SIZE_CLASS = {
  s12: 'text-s12',
  s14: 'text-s14',
  s16: 'text-s16',
  s20: 'text-s20',
  s24: 'text-s24',
  s30: 'text-s30',
} as const;

export function Data({
  value,
  kind = 'measure',
  size = 's14',
  className = '',
}: {
  /** A number goes through `String` — `7`, `6.0h`, `12:34`, `7 days`, `S02E07`. */
  value: string | number;
  /**
   * `literal` for a value that is machine-readable whole — a filename, an address. The
   * string cannot say so itself: `letterboxd.csv` has no digit in it and came back as a
   * *unit*, in the body face, one line above `watched-2024.csv` in mono.
   */
  kind?: DataKind;
  size?: keyof typeof SIZE_CLASS;
  /** Colour and alignment only — the face, weight and tabular belong to the component. */
  className?: string;
}) {
  const { figure, unit } = splitFigure(String(value), kind);
  return (
    <span className={`${SIZE_CLASS[size]} ${className}`}>
      {figure && <span className={FIGURE_CLASS}>{figure}</span>}
      {/*
        The unit in the body face, at the figure's size. Mono on the whole string printed
        `7  days` — a word at a typewriter's letter spacing — which is the defect this
        component exists for and the one a screenshot found rather than a test.
      */}
      {unit && <span>{figure ? ' ' : ''}{unit}</span>}
    </span>
  );
}
