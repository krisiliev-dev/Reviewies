import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { removeFromWatchlist, setWatchlistNote } from '@reviewies/core/data/repo';
import { Poster } from '../ui/Poster';
import { Row as BaseRow } from '../ui/Row';
import { Button } from '../ui/Button';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';

/**
 * Uncapped, deliberately. Trakt limiting free watchlists and doubling its price is
 * one of the things that pushed people to look for alternatives in the first place.
 */
export function Watchlist() {
  const items = useLiveQuery(
    async () => {
      const list = await db.watchlist.orderBy('addedAt').reverse().toArray();
      const titles = new Map((await db.titles.toArray()).map((t) => [t.id, t]));
      return list.map((item) => ({ item, title: titles.get(item.titleId) }));
    },
    [],
    undefined,
  );

  if (items === undefined) return <Note className="p-6">Loading…</Note>;

  if (items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-s30 font-display font-bold">Watchlist</h1>
        <Note>{COPY.watchlist.empty}</Note>
        <Button
          to="/search"
          tone="primary"
          size="page"
          label="Find something"
          name="Find something"
          className="mt-5"
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 px-1 text-s30 font-display font-bold">Watchlist</h1>
      <ul className="flex flex-col gap-2">
        {items.map(({ item, title }) => (
          <Row
            key={item.titleId}
            titleId={item.titleId}
            name={title?.name ?? item.titleId}
            posterUrl={title?.posterUrl}
            year={title?.year}
            note={item.note}
          />
        ))}
      </ul>
    </div>
  );
}

function Row({
  titleId,
  name,
  posterUrl,
  year,
  note,
}: {
  titleId: string;
  name: string;
  posterUrl?: string;
  year?: number;
  note?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');

  async function save() {
    await setWatchlistNote(titleId, draft.trim());
    setEditing(false);
  }

  return (
    <BaseRow
      title={name}
      meta={year ? String(year) : undefined}
      open={{ name: `Open ${name}`, to: `/title/${encodeURIComponent(titleId)}` }}
      lead={<Poster url={posterUrl} name={name} className="h-16 w-11 shrink-0 rounded-plate" />}
      trailing={
        /*
         * A row-level action, in the row's slot for one — and *not* the destructive tone.
         *
         * The finding said two controls that mean opposite things wore one shape, and it
         * was right about the phone: Remove sat in `under` beside "Add a note", the same
         * colour, size and underline, stacked. It was wrong about the remedy. `tone=
         * "destructive"` was tried and photographed, and a list where every row carries a
         * trouble-coloured pill reads as a warning about your own watchlist — but the
         * argument that settles it is the repo's own: the one existing use of that tone is
         * **Block**, described there as "the one action on this screen you cannot take back
         * with the same tap". Removing from a watchlist is a list membership you can add
         * back with the same tap from Search. It is not destruction, and the shape has to
         * mean what it means everywhere else.
         *
         * What was actually wrong was the stacking. This slot, on both platforms.
         */
        <Button
          size="inline"
          tone="quiet"
          label="Remove"
          name={COPY.controls.removeFromWatchlist(name)}
          onPress={() => removeFromWatchlist(titleId)}
        />
      }
      under={
        editing ? (
          <div className="flex gap-1.5">
            <Field
              size="row"
              label={COPY.controls.noteFor(name)}
              value={draft}
              onChange={setDraft}
              placeholder={COPY.watchlist.notePlaceholder}
              className="min-w-0 flex-1"
              autoFocus
            />
            <Button tone="primary" label="Save" name={`Save note for ${name}`} onPress={save} />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            // Every row says "Add a note…". Which row is a visual fact only.
            aria-label={note ? `Edit note for ${name}` : `Add a note for ${name}`}
            className="tap text-left text-s14 font-prose font-regular text-ink-secondary italic"
          >
            {/* "The amount of things I have in my wishlist that i have ZERO memory for
                why they're there" — r/Letterboxd. */}
            {note || 'Add a note…'}
          </button>
        )
      }
    />
  );
}
