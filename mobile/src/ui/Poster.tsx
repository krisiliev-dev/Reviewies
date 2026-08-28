import { Image, StyleSheet, Text, View } from 'react-native';
import { radius, space, theme } from './theme';
import { text, type } from '@reviewies/core/tokens';

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
        <Text numberOfLines={4} style={styles.fallbackText}>
          {name}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.groundWell,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.s2,
  },
  /*
   * The title face, which is the condensed one, and that is the whole reason.
   *
   * A 64pt plate at `s12` in Archivo broke inside the word — `Hollow Crown Saga` came out
   * as "Hollo / w / Cro…" — and there is no step below 12 to retreat to. Archivo Narrow
   * fits about a third more per line at the same size, which is what a condensed face is
   * for and what a spine label on a shelf has always done.
   */
  fallbackText: {
    color: theme.inkSecondary,
    fontSize: text.s12,
    textAlign: 'center',
    fontFamily: type.family.title.name,
  },
});
