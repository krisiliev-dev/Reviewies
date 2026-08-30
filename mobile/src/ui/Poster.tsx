import { Image, StyleSheet, Text, View } from 'react-native';
import {
  POSTER_GLYPH,
  POSTER_GLYPH_SCALES,
  POSTER_PLATE,
  POSTER_SIZE,
  posterInitials,
  type PosterSize,
} from '@reviewies/core/ui/poster';
import { type } from '@reviewies/core/tokens';
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
        {/*
          Hidden, as the web's has always been: the row beside it is already named, and a
          monogram read aloud is two letters with no meaning. The two platforms disagreed
          about this until §6.137 put the same content in both.
        */}
        <Text
          /* The initials are a stand-in for artwork, and the row above already says the
             name — so a reader that announces them reads the title twice, once as prose.

             `aria-hidden` alone, and it is not a shorthand: React Native 0.86's `Text.js`
             expands it into `accessibilityElementsHidden` and
             `importantForAccessibility="no-hide-descendants"` itself, and
             react-native-web's `createDOMProps` reads the flat spelling and mentions
             neither of those. This element used to carry the two and not the flat one, so
             the initials sat in the export's DOM as plain text with `aria-hidden: null`
             and every Up Next row read its title, then its own initials, as loose prose.
             §6.173. */
          aria-hidden
          /* The plate cannot grow, so neither does the mark inside it. `poster.ts` has the
             measurement and the argument; the short version is that at 300% this is two
             vertical strokes in a 44pt box. §6.181. */
          allowFontScaling={POSTER_GLYPH_SCALES}
          style={[styles.fallbackText, { fontSize: POSTER_GLYPH[size] }]}
        >
          {posterInitials(name)}
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
  /*
   * No padding. It was `padding: 2` — a number the web's copy of this plate does not have
   * and nothing states, left over from when the plate printed a title that needed room to
   * wrap. A monogram is two glyphs that never break, and the two renderers now agree.
   */
  fallback: {
    backgroundColor: theme.groundWell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The condensed face, and a size that comes from the plate rather than from the body
   * scale. §6.113 moved this to Archivo Narrow because "a 44pt plate at `s12` in Archivo
   * broke inside the word" — a third more characters per line is not the difference
   * between ten letters and five, and §6.137 photographed it still breaking. It prints a
   * monogram now, so the size is the mark's, from `POSTER_GLYPH`.
   */
  fallbackText: {
    color: theme.inkSecondary,
    textAlign: 'center',
    fontFamily: type.family.title.name,
  },
});
