/**
 * The palette, carried over from the web app so the two do not drift apart.
 *
 * Dark by default and not as a preference: this app gets used in a dark room with the
 * television on, which is the whole premise of Watching Mode.
 *
 * They had drifted anyway — six of the seven differed by a shade or two, and the
 * phone's muted grey came out a full contrast step behind the web's. These are now the
 * web's values exactly, and app/src/ui/palette.test.ts fails if they part again or if
 * any pair of them drops below WCAG AA.
 */
export const theme = {
  ink: '#0b0b0f',
  surface: '#15151d',
  surface2: '#1f1f2b',
  edge: '#2b2b3a',
  text: '#f2f2f7',
  muted: '#9a9ab0',
  accent: '#ff5c7a',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 } as const;
