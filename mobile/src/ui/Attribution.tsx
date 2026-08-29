import { View } from 'react-native';
import {
  ATTRIBUTION_SEPARATION,
  attributionLines,
  type AttributedSource,
} from '@reviewies/core/ui/attribution';
import { Note } from './Note';
import { usingFixtures } from '@reviewies/core/metadata/index';

/**
 * The React Native renderer of `core/src/ui/attribution.ts`. The decisions are there.
 *
 * Two screens on this platform drew this with their own `styles.attribution` — the same
 * four properties typed twice, one of them with a margin and one without.
 */
export function Attribution({ of }: { of: readonly AttributedSource[] }) {
  const lines = attributionLines(of, usingFixtures());
  // Nothing owed, nothing drawn — not an empty block still spending its separation.
  if (lines.length === 0) return null;
  return (
    <View style={{ marginTop: ATTRIBUTION_SEPARATION }}>
      {lines.map((line) => (
        <Note key={line} level="footnote">
          {line}
        </Note>
      ))}
    </View>
  );
}
