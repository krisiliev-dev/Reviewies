import { View } from 'react-native';
import {
  ATTRIBUTION_SEPARATION,
  attributionLines,
  type AttributedSource,
} from '@reviewies/core/ui/attribution';
import { Note } from './Note';

/**
 * The React Native renderer of `core/src/ui/attribution.ts`. The decisions are there.
 *
 * Two screens on this platform drew this with their own `styles.attribution` — the same
 * four properties typed twice, one of them with a margin and one without.
 */
export function Attribution({ of }: { of: readonly AttributedSource[] }) {
  return (
    <View style={{ marginTop: ATTRIBUTION_SEPARATION }}>
      {attributionLines(of).map((line) => (
        <Note key={line} level="footnote">
          {line}
        </Note>
      ))}
    </View>
  );
}
