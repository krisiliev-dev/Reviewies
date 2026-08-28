import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { Row as BaseRow } from '../ui/Row';
import { getStats } from '@reviewies/core/data/repo';
import { formatDuration } from '@reviewies/core/stats/compute';
import { Data } from '../ui/Data';

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
 * This is that decision, and it is the one the phone already made: the same five
 * primaries, and everything else here. The order matches `mobile/app/(tabs)/more.tsx`
 * so the two screens agree rather than each having an opinion. Nothing moved URL — every
 * one of these is still at the address it was, which is what the smoke suite, the
 * in-app links and anybody's bookmark rely on.
 */
const LINKS = [
  { to: '/calendar', label: 'Upcoming', detail: 'What is airing, and what to be told about' },
  { to: '/lists', label: 'Lists', detail: 'Film and television in the same list' },
  { to: '/people', label: 'People', detail: 'Your handle, following, blocking' },
  { to: '/stats', label: 'Stats', detail: 'Runtime-weighted, and your year in review' },
  { to: '/settings', label: 'Your data', detail: 'Import from TV Time, export everything' },
];

export function More() {
  const counts = useLiveQuery(async () => ({
    watches: await db.watches.count(),
    library: await db.library.count(),
    watchlist: await db.watchlist.count(),
  }));
  const stats = useLiveQuery(() => getStats('all'), []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-s30 font-display font-bold">More</h1>

      <section className="rounded-plate bg-ground-raised p-4">
        <p className="text-s14 text-ink-secondary">
          Everything lives on this device. Nothing here needs an account, and nothing is
          withheld — this is the whole point of the app.
        </p>
        {counts && (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-s14">
            <Stat label="Watches" value={counts.watches} />
            <Stat label="Tracked" value={counts.library} />
            <Stat label="Watchlist" value={counts.watchlist} />
          </dl>
        )}
        {stats && stats.minutes > 0 && (
          <p className="mt-3 text-s14 text-ink-secondary">
            {formatDuration(stats.minutes)} watched, counted by actual runtime.
          </p>
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
                <span aria-hidden="true" className="shrink-0 pl-2 text-ink-secondary">
                  ›
                </span>
              }
            />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-plate bg-ground-well px-3 py-2">
      <dt className="text-s12 text-ink-secondary">{label}</dt>
      <dd><Data value={value} size="s20" /></dd>
    </div>
  );
}
