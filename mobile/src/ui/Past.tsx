import { View } from 'react-native';
import { unwatchLatest, type HistoryEntry } from '@reviewies/core/data/repo';
import { COPY } from '@reviewies/core/copy';
import { dayKey, formatDay } from '@reviewies/core/time';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';
import { Poster } from './Poster';
import { Row as BaseRow } from './Row';
import { CrossOff } from './CrossOff';
import { Section } from './Section';

/**
 * What you have already watched, drawn **above** the present.
 *
 * `docs/design/architecture.md` section 3, and the web's twin at `app/src/ui/Past.tsx` carries the
 * reasoning in full. In short: Up Next was forward-only on a product whose whole subject is
 * a record of attention already spent, `db.watches` has held this since the first commit,
 * and nothing had ever drawn it.
 *
 * The screen still opens on the present — `(tabs)/index.tsx` scrolls to it once on arrival —
 * because *"the app opens directly to the page where I can see and mark the next episodes"*
 * is the most forcefully stated finding in the research and this one does not replace it.
 * Laid out above, arrived at from below: the arrangement of a transcript.
 */
export function Past({ entries }: { entries?: readonly HistoryEntry[] }) {
  // Nothing at all rather than an empty state — see the web's twin. A heading over nothing
  // would be the first thing somebody one minute into the app read.
  if (!entries?.length) return null;

  return (
    <View>
      <Section>{COPY.upNext.alreadyWatched}</Section>
      {entries.map((entry) => (
        <PastRow key={entry.watchId} entry={entry} />
      ))}
    </View>
  );
}

function PastRow({ entry }: { entry: HistoryEntry }) {
  const code = entry.episode ? episodeCode(entry.episode.season, entry.episode.number) : undefined;
  const named = entry.episode ? episodeName(entry.episode.name, entry.episode.number) : undefined;

  return (
    <BaseRow
      title={entry.name}
      code={code}
      meta={named}
      // When, in the same words the calendar uses for the other direction — one formatter,
      // which is §6.66's rule about who owns a date.
      count={formatDay(dayKey(entry.watchedAt))}
      struck
      open={{
        name: [`Open ${entry.name}`, code, named].filter(Boolean).join(', '),
        to: `/title/${encodeURIComponent(entry.titleId)}`,
      }}
      lead={<Poster url={entry.posterUrl} name={entry.name} />}
      trailing={
        <CrossOff
          watched
          name={[`Unmark ${entry.name}`, code].filter(Boolean).join(' ')}
          onChange={(next) => {
            if (!next) void unwatchLatest(entry.targetId);
          }}
        />
      }
    />
  );
}
