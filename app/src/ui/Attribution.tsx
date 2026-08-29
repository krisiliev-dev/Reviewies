import { attributionLines, type AttributedSource } from '@reviewies/core/ui/attribution';
import { Note } from './Note';

/**
 * The DOM renderer of `core/src/ui/attribution.ts`. The decisions are there.
 *
 * `mt-6` is `ATTRIBUTION_SEPARATION`, written out rather than interpolated for the reason
 * `Button.tsx` gives — Tailwind's scanner reads source text — and held to the number by
 * `attribution.test.ts`.
 */
export function Attribution({ of }: { of: readonly AttributedSource[] }) {
  return (
    <footer className="mt-6">
      {attributionLines(of).map((line) => (
        <Note key={line} level="footnote">
          {line}
        </Note>
      ))}
    </footer>
  );
}
