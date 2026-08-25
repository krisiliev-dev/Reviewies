/**
 * The tab bar's icons, drawn rather than typed.
 *
 * They were single Unicode characters — `▶ ⌕ ✦ ▦ ☰ ❏ ◔ ⚙` — and looking at the app for
 * the first time is what found the problem, because every property a test can measure
 * was fine. They were the right size, they were `aria-hidden` beside a real label, and
 * they had nothing to do with contrast.
 *
 * What they actually looked like, in the browser the smoke suite drives:
 *
 *  - `▶` and `⚙` have emoji presentation variants, so Chromium drew them in full colour
 *    — an orange play button and a blue gear — beside five flat grey glyphs.
 *  - `❏` (Lists) rendered as an empty square, which is indistinguishable from a missing
 *    glyph, and `▦` (Upcoming) as a dense grey block that means nothing.
 *  - `◔` (Stats) came out as a sliver a couple of pixels tall. It was, in practice,
 *    invisible.
 *
 * A glyph's appearance belongs to whatever font the device happens to have, which is a
 * strange thing to hand your navigation to. These are paths: the same everywhere, and
 * they inherit `currentColor` so the active tab still tints.
 */
const PATHS: Record<string, string> = {
  upnext: 'M8 5v14l11-7z',
  search: 'M11 4a7 7 0 1 0 4.2 12.6L20 21.4 21.4 20l-4.8-4.8A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  discover: 'M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7L12 2z',
  upcoming: 'M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 9h14v10H5V9z',
  watchlist: 'M4 6h13v2H4V6zm0 5h13v2H4v-2zm0 5h9v2H4v-2zm15.5-5.5L21 12l-4 4-2.5-2.5L16 12l1 1 2.5-2.5z',
  lists: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  stats: 'M4 20V10h4v10H4zm6 0V4h4v16h-4zm6 0v-7h4v7h-4z',
  // An archive box rather than the shield this was first drawn as. A shield reads as
  // security, and the tab is where your history is exported, imported and accounted
  // for — which is a filing cabinet, not a guard.
  data: 'M3 4h18v4H3V4zm1 6h16v10H4V10zm5 2v2h6v-2H9z',
};

/**
 * Fixed at 22px rather than in `em`.
 *
 * The bar has eight tabs across a phone, and an icon that grows with the text setting
 * takes the room the label needs. The label is the part that has to scale — it is the
 * content — so the drawing stays where it is and gets out of the way.
 */
export function TabIcon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const TAB_ICONS = Object.keys(PATHS);
