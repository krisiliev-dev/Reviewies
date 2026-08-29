import {
  TAB_ICON_BOX,
  TAB_ICON_PATHS,
  TAB_ICON_SIZE,
  type TabIconName,
} from '@reviewies/core/ui/tabIcon';

/**
 * The DOM renderer of `core/src/ui/tabIcon.ts`. The decisions are there.
 *
 * The table used to live in this file, which is how the phone came to keep typing its icons
 * for four sprints after the web stopped: a finding about what glyphs do on a device, held
 * in a `.tsx` under `app/`. §6.140 moved it to the core and gave the phone the same paths.
 *
 * They inherit `currentColor`, so the active tab still tints.
 */
export function TabIcon({ name }: { name: TabIconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={TAB_ICON_SIZE}
      height={TAB_ICON_SIZE}
      viewBox={`0 0 ${TAB_ICON_BOX} ${TAB_ICON_BOX}`}
      fill="currentColor"
      className="shrink-0"
    >
      <path d={TAB_ICON_PATHS[name]} />
    </svg>
  );
}
