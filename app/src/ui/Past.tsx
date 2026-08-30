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
 * `docs/design/architecture.md` section 3, and it is the bullet with the highest daily value in
 * the whole redesign. Up Next was forward-only: it opened onto the next episode of every
 * show and had no past at all, on a product whose entire subject is a record of attention
 * already spent. Every tracking app people arrived here from puts the evening you have had
 * above the position you are at, so scrolling up walks back through it.
 *
 * `db.watches` has carried this since the first commit and nothing had ever drawn it.
 *
 * ## Why it renders above and the screen still opens on the present
 *
 * Because both are requirements and they are not in conflict. The most forcefully stated
 * finding in the research is that the app *"opens directly to the page where I can see and
 * mark the next episodes"*; the finding this component exists for is that the past should be
 * *up*. So the past is laid out above and `UpNext` scrolls to the present once on arrival —
 * the arrangement of a transcript, which is what an evening's watching is.
 *
 * ## Already crossed off, and reversible
 *
 * `struck` and a filled ring, because they are: this is not a list of things to do. The ring
 * is live rather than decorative — `unwatchLatest` takes back **this** watch and the row
 * leaves the past and reappears below, which is the answer to a mis-tap noticed a minute
 * later that was otherwise "find the show, find the season, find the episode".
 *
 * No six-second undo window on it, unlike Up Next's ring. `crossOff.ts`'s undo exists
 * because a mark is a one-tap write with no way back; here the *un*mark is itself the way
 * back, and an Undo beside it would be a way back from the way back.
 */
export function Past({ entries }: { entries?: readonly HistoryEntry[] }) {
  // Nothing at all rather than an empty state. A person with no history is a person one
  // minute into the app, and `emptyStates.ts`'s test for an empty state is that the screen
  // *says something about the absence* — there is nothing worth saying here, and a heading
  // over nothing would be the first thing a new arrival read.
  if (!entries?.length) return null;

  return (
    <section>
      {/* The one heading on this screen somebody meets by scrolling *up* into it. Without
          it the fold reads as a list that has been crossed off by mistake. */}
      <Section className="px-1">{COPY.upNext.alreadyWatched}</Section>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <PastRow key={entry.watchId} entry={entry} />
        ))}
      </ul>
    </section>
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
