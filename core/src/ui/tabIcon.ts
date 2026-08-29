/**
 * The marks on the tab bar, as paths, for both platforms.
 *
 * ## The web settled this and the phone never heard
 *
 * `app/src/ui/TabIcon.tsx` was written because looking at the app found what no test could
 * measure. The icons were single Unicode characters and every property a check can read was
 * fine — the right size, `aria-hidden` beside a real label, nothing to do with contrast —
 * and what they actually looked like was:
 *
 * - `▶` and `⚙` have emoji presentation variants, so Chromium drew them in **full colour**,
 *   an orange play button and a blue gear beside five flat grey glyphs;
 * - `❏` rendered as an empty square, which is indistinguishable from a missing glyph;
 * - `◔` came out as a sliver a couple of pixels tall — in practice invisible.
 *
 * **A glyph's appearance belongs to whatever font the device happens to have**, which is a
 * strange thing to hand your navigation to. That finding is four sprints old and it stayed
 * on the web, because the table it produced lived in a `.tsx` file in `app/`.
 *
 * So the phone kept `icon('▶')`, `icon('⌕')`, `icon('✦')`, `icon('☰')`, `icon('⋯')`, and
 * §6.138 photographed the result: put `design/screens/05-discover.png` beside
 * `design/web/dark-04-discover.png` and the most-seen control in the product is drawn two
 * different ways. This is the same finding `key.ts` records for the remote fascia — "one
 * table, not one per surface" — one control over.
 *
 * ## The excuse, and why it could never have expired
 *
 * `_layout.tsx` said it in as many words: *"A vector icon pack is a dependency and a build
 * step for five symbols that a font already has. If the set grows or these render badly on
 * a real device, that is the point to reach for one."*
 *
 * Both halves fail. A font does **not** already have them — that is precisely what the web
 * measured, in a browser, four sprints before this sentence was still standing. And the
 * trigger cannot fire: nothing in this build has ever run on a real device (§7 has said so
 * since §6.111), so "if these render badly on a real device" is a condition nobody is in a
 * position to observe. §6.133's shape — an excuse that was never true reads as a decision
 * somebody made.
 *
 * ## What this is
 *
 * Path data, and nothing else: no colour, no size, no platform. The web draws it into an
 * `<svg>` and the phone into `react-native-svg`, both inheriting `currentColor` so the
 * active tab still tints. `tabIcon.test.ts` holds the two renderers to this table the way
 * `key.test.ts` holds the fascia to its own.
 *
 * The viewBox is fixed at 24 because every path here is drawn in that space; a path and the
 * box it was drawn for are one fact, so they live together.
 */

/** The square every path below is drawn inside. */
export const TAB_ICON_BOX = 24;

/**
 * Fixed at 22 rather than in `em`.
 *
 * The bar carries five tabs across a phone and an icon that grows with the reader's text
 * setting takes the room the label needs. The label is the part that has to scale — it is
 * the content — so the drawing stays where it is and gets out of the way. WCAG 1.4.4 is
 * about the text.
 */
export const TAB_ICON_SIZE = 22;

/**
 * One path per name. The names are the routes' own, not the drawings'.
 *
 * `data` is an archive box rather than the shield it was first drawn as: a shield reads as
 * security, and the tab is where your history is exported, imported and accounted for —
 * which is a filing cabinet, not a guard.
 */
export const TAB_ICON_PATHS = {
  upnext: 'M8 5v14l11-7z',
  search:
    'M11 4a7 7 0 1 0 4.2 12.6L20 21.4 21.4 20l-4.8-4.8A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  discover: 'M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7L12 2z',
  upcoming:
    'M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 9h14v10H5V9z',
  watchlist: 'M4 6h13v2H4V6zm0 5h13v2H4v-2zm0 5h9v2H4v-2zm15.5-5.5L21 12l-4 4-2.5-2.5L16 12l1 1 2.5-2.5z',
  lists: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  stats: 'M4 20V10h4v10H4zm6 0V4h4v16h-4zm6 0v-7h4v7h-4z',
  data: 'M3 4h18v4H3V4zm1 6h16v10H4V10zm5 2v2h6v-2H9z',
  more: 'M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
} as const;

export type TabIconName = keyof typeof TAB_ICON_PATHS;

/**
 * The five the bar actually offers, in order, with the route each one marks.
 *
 * The web had this list and the phone had it again in JSX, which is how they came to
 * disagree about what a tab is drawn with while agreeing about which five there are. One
 * list, and the order is part of it: this is wayfinding, and a bar whose tabs move is a bar
 * somebody has to read every time.
 *
 * Two route fields rather than one, because the two routers genuinely address differently:
 * the web navigates to a URL and expo-router names a file. That is the honest shape — the
 * alternative is one field that means different things depending on who reads it, which is
 * the defect §6.136 spent a sprint removing from `Row`.
 */
export const TAB_BAR = [
  { icon: 'upnext', label: 'Up Next', to: '/', route: 'index' },
  { icon: 'search', label: 'Search', to: '/search', route: 'search' },
  { icon: 'discover', label: 'Discover', to: '/discover', route: 'discover' },
  { icon: 'watchlist', label: 'Watchlist', to: '/watchlist', route: 'watchlist' },
  { icon: 'more', label: 'More', to: '/more', route: 'more' },
] as const satisfies readonly {
  icon: TabIconName;
  label: string;
  /** The web's address. */
  to: string;
  /** The phone's route file, which expo-router addresses by name rather than by URL. */
  route: string;
}[];
