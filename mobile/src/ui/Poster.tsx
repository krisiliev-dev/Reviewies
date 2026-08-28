import { Image, StyleSheet, Text, View } from 'react-native';
import { POSTER_PLATE, POSTER_SIZE, type PosterSize } from '@reviewies/core/ui/poster';
import { text, type } from '@reviewies/core/tokens';
import { theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/poster.ts`. The decisions are there.
 *
 * A missing poster is normal — imported history is full of titles that never matched a
 * provider — so the empty state has to be legible rather than a grey rectangle.
 */
export function Poster({
  url,
  name,
  size = 'row',
}: {
  url?: string;
  name: string;
  size?: PosterSize;
}) {
  const box = { width: POSTER_SIZE[size].width, height: POSTER_SIZE[size].height };
  if (!url) {
    return (
      <View style={[styles.plate, styles.fallback, box]}>
        <Text numberOfLines={4} style={styles.fallbackText}>
          {name}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.plate, box]}>
      <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * The plate, and the band along its foot — the direction's, a 4pt strip in the ground at
   * the bottom edge. It is what makes a poster read as something mounted rather than
   * something floating, and it is a fill, so it takes a space step.
   */
  plate: {
    borderRadius: POSTER_PLATE.radius,
    borderBottomWidth: POSTER_PLATE.band,
    borderBottomColor: theme.ground,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  fallback: {
    backgroundColor: theme.groundWell,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  /** The condensed face: a 44pt plate at `s12` in Archivo broke inside the word. §6.113. */
  fallbackText: {
    color: theme.inkSecondary,
    fontSize: text.s12,
    textAlign: 'center',
    fontFamily: type.family.title.name,
  },
});
