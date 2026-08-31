import { useLiveQuery } from 'dexie-react-hooks';
import { COPY } from '@reviewies/core/copy';
import { MORE_INDEX } from '@reviewies/core/ui/moreIndex';
import { bridgeConfigured } from '../remote/useBridge';
import { db } from '../data/db';
import { Row as BaseRow } from '../ui/Row';
import { Chevron } from '../ui/Mark';
import { getStats } from '@reviewies/core/data/repo';
import { formatDuration } from '@reviewies/core/stats/compute';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';

/**
 * The other half of the navigation.
 *
 * The web had eight tabs across a phone-width bar and the phone had five with a More
 * screen behind the fifth. Eight only ever fitted because the labels were ten pixels;
 * once they were allowed to respond to the reader's text setting the bar wrapped to two
 * rows and took 183 of 844 pixels. §6.31 measured that and left the navigation alone,
 * because how many tabs a product has is a decision about the product rather than a
 * layout bug to fix while passing a check.
 *
 * This is that decision, and it is the one the phone already made: the same primaries —
 * `TAB_BAR`'s, and the count is that table's to state rather than this comment's — and
 * everything else here. The order matches `mobile/app/(tabs)/more.tsx`
 * so the two screens agree rather than each having an opinion. Nothing moved URL — every
 * one of these is still at the address it was, which is what the smoke suite, the
 * in-app links and anybody's bookmark rely on.
 */
/**
 * The four rows are `MORE_INDEX`'s now — both platforms carried this array with the same
 * labels and the same descriptions typed out separately, which §6.176 measured as ten
 * agreeing-by-hand strings on the screen whose job is saying what the product contains.
 *
 * Four, not five: `Upcoming` left when `architecture.md` section 4 folded what is airing
 * into the second half of Up Next, and `moreIndex.ts` records that the report which
 * prompted it — *"I am unsure what the difference between the Watchlist and Upcoming
 * is"* — was answered by removing the destination rather than by writing a better
 * description of it.
 */
const LINKS = MORE_INDEX;

export function More() {
  const counts = useLiveQuery(async () => ({
    watches: await db.watches.count(),
    library: await db.library.count(),
    watchlist: await db.watchlist.count(),
    reactions: await db.reactions.count(),
  }));
  const stats = useLiveQuery(() => getStats('all'), []);

  return (
    <div className="flex flex-col gap-3 p-s16">
      <Masthead>{COPY.screens.more}</Masthead>

      <section className="rounded-plate bg-ground-raised p-4">
        <Note>{COPY.app.localFirst}</Note>
        {/*
          The tenth seam. `seams.md` §10: `RemoteDrawer` returns `null` on a build without
          the bridge variables, so the web's only route to the remote is not merely closed —
          it leaves no trace that it exists. Hiding the control is right; hiding the
          capability is a different seam at the same place.

          Only when it is absent, and never a control: the sentence appears exactly where the
          thing does not, which is as narrow as "literally visible, effectively invisible"
          goes. On a configured build this renders nothing and the drawer speaks for itself.
        */}
        {!bridgeConfigured() && <Note className="mt-3">{COPY.watching.bridgeAbsent}</Note>}
        {/* Four, in two columns. Three was this screen's count and four was Settings'
            copy of the same block; the copy is gone (§6.133) and Reactions came here
            rather than out of the product. Two columns because four across a phone is a
            number per fifth of the width. */}
        {counts && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-s14">
            <Stat label={COPY.stats.watches} value={counts.watches} />
            <Stat label={COPY.stats.tracked} value={counts.library} />
            <Stat label={COPY.screens.watchlist} value={counts.watchlist} />
            <Stat label="Reactions" value={counts.reactions} />
          </dl>
        )}
        {stats && stats.minutes > 0 && (
          <Note className="mt-3">
            {formatDuration(stats.minutes)} watched, counted by actual runtime.
          </Note>
        )}
      </section>

      <nav aria-label="More sections">
        {/* A contents page, which is what `density="index"` is: no poster, so the row is
            a thumb tall rather than a poster tall. The names are unchanged — every one of
            these is still the string it was, which is what the smoke suite and anybody's
            muscle memory navigate by. */}
        <ul className="flex flex-col">
          {LINKS.map((link) => (
            <BaseRow
              key={link.to}
              density="index"
              title={link.label}
              meta={link.detail}
              open={{ name: `${link.label} — ${link.detail}`, to: link.to }}
              trailing={
                <Chevron points="right" className="ml-2 text-s16 text-ink-secondary" />
              }
            />
          ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * A figure inside the card, and not a plate of its own.
 *
 * It was `rounded-plate bg-ground-well px-3 py-2` — the **sunken** ground, painted inside
 * a `SURFACE.card`, so every one of these sat two steps below its own container. That is
 * the shape §6.167 filed against the provider chip and fixed one screen over, still alive
 * here, on a screen `SUNK_FILLS` excused with a reason that was measurably wrong: "a
 * number set into the page". It is not on the page, it is on a card.
 *
 * §6.168 found the sharper version by comparing screens rather than platforms: **the same
 * four figures are drawn two ways**, `bg-ground-raised` on Stats and `bg-ground-well`
 * here, with the two platforms agreeing with each other on each screen. Not drift between
 * renderers, which is what every guard here looks for — drift between screens.
 *
 * Stats is the one that is right, and the reason is `surface.ts`: a card is "a summary or
 * a form, one object taken in whole". On Stats a figure tile *is* that object, alone on
 * the page. Here the object is the card around all four, so the figures are its contents
 * — and a card inside a card is not a second object, it is a boundary nobody needs. The
 * label-and-value pairing is what groups a figure; it does not also need a box.
 */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Note level="footnote" as="dt">{label}</Note>
      <dd><Data value={value} size="s20" /></dd>
    </div>
  );
}
