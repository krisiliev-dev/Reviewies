import { useFonts } from 'expo-font';
import { type } from '@reviewies/core/tokens';

/**
 * The faces, loaded once, from the table that owns them.
 *
 * The only place in `mobile/` allowed to name a font file. Everywhere else asks
 * `type.family.<role>.name`, which is what guard G6 in `docs/design/tokens.md` insists on:
 * the family names in the tokens, the faces in this map and the `@font-face` families in
 * the generated CSS are one set, or the phone silently falls back to the system face — the
 * one type failure that looks fine in a simulator and wrong on a device.
 *
 * `require` rather than `import`: Metro resolves an asset by literal path at build time, so
 * these cannot be assembled from the table at runtime even though their names come from it.
 * The clause below is what stops the two drifting.
 */
export const FACES = {
  'ArchivoNarrow-Bold': require('../../../assets/fonts/ArchivoNarrow-Bold.ttf'),
  'ArchivoNarrow-SemiBold': require('../../../assets/fonts/ArchivoNarrow-SemiBold.ttf'),
  'Archivo-Regular': require('../../../assets/fonts/Archivo-Regular.ttf'),
  'IBMPlexMono-Medium': require('../../../assets/fonts/IBMPlexMono-Medium.ttf'),
  'Newsreader-Regular': require('../../../assets/fonts/Newsreader-Regular.ttf'),
  'Newsreader-Italic': require('../../../assets/fonts/Newsreader-Italic.ttf'),
} as const;

/**
 * Japanese is not bundled — `type.family.jp.name` is `null` and its stack names the
 * platform's own faces. `pickFamily` is where a mixed Latin/CJK title chooses, because
 * React Native's `fontFamily` takes one string with no fallback list: a title in a face
 * with no Japanese in it renders as boxes, and the direction's graft 8 names that defect
 * exactly.
 */
export function pickFamily(text: string, role: keyof typeof type.family = 'body'): string | undefined {
  // Hiragana, katakana, CJK ideographs. One test, at the call site, as graft 8 requires.
  if (/[぀-ヿ㐀-䶿一-鿿]/.test(text)) return undefined;
  return type.family[role].name ?? undefined;
}

/** `false` until every face is in, so nothing paints in a system face and then reflows. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(FACES);
  return loaded;
}
