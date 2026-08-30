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
 * The phone's `Account` and `Remote` rows. Those are not the same row drawn twice, and the
 * reason is different for each:
 *
 *  - **Account.** The web reaches its account panel from another screen; the phone gives it
 *    a row here.
 *  - **Remote.** The web has no row for it *anywhere*. `App.tsx` mounts `RemoteDrawer` at
 *    the root, so the web's remote is a fixed tab clinging to the right edge of every
 *    screen — `light-08-people.png` shows it over the social screen — while the phone's is
 *    a route with a row pointing at it. One feature, two affordances, and the shared table
 *    would be claiming a parity that does not exist.
 *
 * §6.178 corrected this paragraph: it said the web reached its remote "from a control in the
 * masthead", which is not where it is and never was. A file whose job is being the authority
 * on what the two platforms share is the worst place for a reason nobody checked — §6.106's
 * lesson, on a comment two sprints old rather than a year.
 */
/**
 * ## The row that left
 *
 * `Upcoming` was the first row here and is not a destination any more —
 * `docs/design/architecture.md` section 4. The report was *"I am unsure what the difference between
 * the Watchlist and Upcoming is"*, and from the source the two are genuinely different: one
 * is what you mean to watch with a note saying why, the other is what airs next with the
 * notification granularity attached. **A distinction only legible in the code is not one the
 * user has**, and the answer was not a better `detail` line on this row. What is airing is a
 * fact about the shows you already watch, so it became the second half of Up Next, and this
 * table is one row shorter.
 */
export const MORE_INDEX = [
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
