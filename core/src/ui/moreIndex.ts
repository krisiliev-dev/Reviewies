import { COPY } from '../copy.ts';

/**
 * The contents page, held to one table — the pass `tabIcon.ts` gave the tab bar and this
 * screen never got.
 *
 * §6.176's subject in its purest form. Both platforms carried a `LINKS` array with the same
 * five rows in it, each row's label and each row's one-line description typed out twice:
 *
 * ```
 * { to:   '/settings', label: 'Your data', detail: 'Import from TV Time, export everything' }
 * { href: '/data',     label: 'Your data', detail: 'Import from TV Time, export everything' }
 * ```
 *
 * Ten sentences agreeing by hand, on the screen whose whole job is telling somebody what the
 * product contains. `copy.test.ts` could not see them: the drift comparison skips an exact
 * match, and §6.175 rebuilt that half — but a *table* is not a sentence, and moving the
 * words alone would have left the two arrays to disagree about their order, their length or
 * which row goes where.
 *
 * ## Why the address is in here and the phone's route is too
 *
 * Exactly `TAB_BAR`'s reason. The web navigates by URL and expo-router navigates by route
 * file, and the two genuinely differ for one row — the web's `/settings` is the phone's
 * `/data`. Naming both in one place is what stops a rename moving one and not the other,
 * which is §6.170's shape: one thing, two platforms, different halves.
 *
 * ## What is deliberately not here
 *
 * The phone's `Account` and `Remote` rows. Those are not the same row drawn twice — the web
 * reaches its account panel from a different screen and its remote from a control in the
 * masthead, so a shared table naming them would be claiming a parity that does not exist.
 * They stay in `mobile/app/(tabs)/more.tsx` as that platform's own two rows.
 */
export const MORE_INDEX = [
  {
    label: 'Upcoming',
    detail: 'What is airing, and what to be told about',
    to: '/calendar',
    route: '/calendar',
  },
  {
    label: 'Lists',
    detail: 'Film and television in the same list',
    to: '/lists',
    route: '/lists',
  },
  {
    label: 'People',
    detail: 'Your handle, following, blocking',
    to: '/people',
    route: '/people',
  },
  {
    label: 'Stats',
    detail: 'Runtime-weighted, and your year in review',
    to: '/stats',
    route: '/stats',
  },
  {
    /**
     * The one row whose two addresses differ, and the reason this table carries both. §6.78
     * recorded that this destination has had two *names* as well; it is "Your data" on both
     * platforms now, and holding the name here is what keeps it that way.
     */
    label: COPY.app.yourData,
    detail: 'Import from TV Time, export everything',
    to: '/settings',
    route: '/data',
  },
] as const satisfies readonly {
  label: string;
  detail: string;
  /** The web's address. */
  to: string;
  /** The phone's, which expo-router resolves against its own route files. */
  route: string;
}[];
