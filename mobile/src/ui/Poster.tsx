import { Image, StyleSheet, Text, View } from 'react-native';
import { radius, theme } from './theme';

/**
 * Artwork, with the title as the fallback.
 *
 * A missing poster is normal — imported history is full of titles that never matched
 * a provider — so the empty state has to be legible rather than a grey rectangle.
 */
export function Poster({
  url,
  name,
  width = 64,
  height = 96,
}: {
  url?: string;
  name: string;
  width?: number;
  height?: number;
}) {
  const style = { width, height, borderRadius: radius.plate };

  if (!url) {
    return (
      <View style={[styles.fallback, style]}>
        <Text numberOfLines={3} style={styles.fallbackText}>
          {name}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  fallbackText: { color: theme.muted, fontSize: 10, textAlign: 'center' },
});
