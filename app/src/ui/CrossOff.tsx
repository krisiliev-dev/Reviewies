import { useEffect, useState } from 'react';
import { UNDO_MS, type CrossOffContract } from '@reviewies/core/ui/crossOff';
import { Tick } from './Mark';

/**
 * The DOM renderer of `core/src/ui/crossOff.ts`. The decisions are there.
 *
 * No spinner, no busy state, and no `await` in the click handler. `markWatched` writes to
 * IndexedDB and `useLiveQuery` re-renders — `UpNext.tsx` has said "optimistic by
 * construction; nothing waits on a network round-trip" in a comment since it shipped, and
 * this is the file somebody would add one to.
 *
 * Written-out class strings rather than interpolation, for the reason `Button.tsx` gives:
 * Tailwind's scanner reads source text, so a class assembled at runtime is never compiled.
 */
const RING_CLASS =
  'inline-flex size-target shrink-0 items-center justify-center rounded-pill border-icon active:border-mark';
const RING_OFF = 'border-stroke-signal';
const RING_ON = 'border-working-fill bg-working-fill text-working-on-fill';
/** Unaired. A ring in the hairline reads as "not yet", where a fade reads as broken. */
const RING_UNAVAILABLE = 'border-stroke-hairline';

const UNDO_CLASS =
  'inline-flex h-target shrink-0 items-center justify-center rounded-pill border-icon border-mark-cross-off px-3 text-s12 font-title font-semibold text-ink';

export function CrossOff({
  watched,
  disabled,
  name,
  onChange,
  onUndo,
  undoName,
}: CrossOffContract) {
  const [undoable, setUndoable] = useState(false);

  useEffect(() => {
    if (!undoable) return;
    const timer = setTimeout(() => setUndoable(false), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoable]);

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button
        type="button"
        // A checkbox, because an open circle you fill is what `aria-checked` is for. The
        // rows this replaces used `aria-pressed`, which announces a toggle button rather
        // than a thing that is or is not done.
        role="checkbox"
        aria-checked={watched}
        aria-label={name}
        disabled={disabled}
        onClick={() => {
          onChange(!watched);
          if (!watched && onUndo) setUndoable(true);
        }}
        className={`${RING_CLASS} ${disabled ? RING_UNAVAILABLE : watched ? RING_ON : RING_OFF}`}
      >
        {/* The tick is one of three channels, not the signal. The ring's fill and the
            row's ink step carry it independently, which is what makes the pencil stroke
            safe to be decorative. The ring is a fixed 44 square either way. */}
        {/* A stroke, not a glyph: `✓` was drawn by whatever font resolved it, at whatever
            weight, inside a filled disc where weight is what makes it legible. §6.144. */}
        {watched ? <Tick className="text-s20" /> : null}
      </button>

      {/*
        Beside the ring, not instead of it — the first version of this swapped one control
        for the other in the same slot, which costs the two things the mark is for. The
        filled ring is the confirmation you just earned, and hiding it for six seconds to
        show the way out is backwards; and on the web, unmounting the button you just
        activated drops focus to the body, so a keyboard user is returned to the top of
        the page as a reward for marking an episode.
      */}
      {undoable && onUndo ? (
        <button
          type="button"
          onClick={() => {
            setUndoable(false);
            onUndo();
          }}
          aria-label={undoName ?? 'Undo'}
          className={UNDO_CLASS}
        >
          Undo
        </button>
      ) : null}
    </span>
  );
}

/**
 * The third channel, owned here rather than typed out at each row.
 *
 * `STRUCK.text` is the ink step and `STRUCK.pen` is the colour of the line; a row that
 * spelled out its own `line-through` would be free to pick a different pair. Written out
 * rather than interpolated from the token names, because Tailwind's scanner reads source
 * text — the names are asserted against the table in `crossOff.test.ts` instead.
 */
export const crossedOffText = (watched: boolean) =>
  watched ? 'text-ink-secondary line-through decoration-mark-cross-off' : 'text-ink';

