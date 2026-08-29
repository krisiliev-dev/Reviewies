import { attributionLines, type AttributedSource } from '@reviewies/core/ui/attribution';
import { Note } from './Note';
import { usingFixtures } from '@reviewies/core/metadata/index';

/**
 * The DOM renderer of `core/src/ui/attribution.ts`. The decisions are there.
 *
 * `mt-6` is `ATTRIBUTION_SEPARATION`, written out rather than interpolated for the reason
 * `Button.tsx` gives — Tailwind's scanner reads source text — and held to the number by
 * `attribution.test.ts`.
 */
export function Attribution({ of }: { of: readonly AttributedSource[] }) {
  const lines = attributionLines(of, usingFixtures());
  // Nothing owed, nothing drawn — not an empty block still spending its separation.
  if (lines.length === 0) return null;
  return (
    <footer className="mt-6">
      {lines.map((line) => (
        <Note key={line} level="footnote">
          {line}
        </Note>
      ))}
    </footer>
  );
}
