/**
 * The palette, carried over from the web app so the two do not drift apart.
 *
 * Dark by default and not as a preference: this app gets used in a dark room with the
 * television on, which is the whole premise of Watching Mode.
 */
export const theme = {
  ink: '#0b0b0f',
  surface: '#15151c',
  surface2: '#1f1f28',
  edge: '#2a2a35',
  text: '#f2f2f5',
  muted: '#8b8b9a',
  accent: '#ff4d6d',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 } as const;
