import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RING, STRUCK, UNDO_MS, type CrossOffContract } from '@reviewies/core/ui/crossOff';
import { radius, space, theme } from './theme';
import { Tick } from './Mark';
import { text, type } from '@reviewies/core/tokens';

/**
 * The React Native renderer of `core/src/ui/crossOff.ts`. The decisions are there.
 *
 * No spinner, no busy state, and no `await` in the press handler. `markWatched` writes to
 * SQLite and the change listener re-runs the query — the contract's doc comment says why
 * at length, and it is repeated here because this is the file somebody would add one to.
 */
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
    <View style={styles.slot}>
      <Pressable
        onPress={() => {
          onChange(!watched);
          if (!watched && onUndo) setUndoable(true);
        }}
        disabled={disabled}
        // A checkbox, because an open circle you fill is what `checked` is for. The title
        // page put `checked` on a button role, which announces a state through something
        // that cannot carry it.
        accessibilityRole="checkbox"
        accessibilityLabel={name}
        aria-checked={watched} aria-disabled={!!disabled}
        style={({ pressed }) => [
          styles.ring,
          {
            borderWidth: RING.stroke,
            borderColor: disabled
              ? theme[RING.unavailable]
              : watched
                ? theme[RING.fill]
                : theme.strokeSignal,
            backgroundColor: watched && !disabled ? theme[RING.fill] : 'transparent',
          },
          // Instant. The same reasoning as `Button`: press feedback that was never motion
          // is press feedback Reduce Motion does not have to substitute for.
          pressed && !disabled ? { borderWidth: RING.stroke * 2 } : null,
        ]}
      >
        {/* The tick is one of three channels, not the signal. The ring's fill and the row's
            ink step carry it independently, which is what makes the pencil stroke safe to
            be decorative. */}
        {/* A stroke, not a glyph: `✓` was drawn by whatever font resolved it, at whatever
            weight, inside a filled disc where weight is what makes it legible. §6.144. */}
        {watched ? <Tick color={theme[RING.tick]} size={20} /> : null}
      </Pressable>

      {/*
        Beside the ring, not instead of it — the first version of this swapped one control
        for the other in the same slot, which costs the two things the mark is for. The
        filled ring is the confirmation you just earned, and hiding it for six seconds to
        show the way out is backwards; and replacing the control somebody just activated
        moves the screen reader's cursor off it, as a reward for marking an episode.

        A second named control, and it must not steal focus: somebody who marked an
        episode deliberately is not asking to be moved.
      */}
      {undoable && onUndo ? (
        <Pressable
          onPress={() => {
            setUndoable(false);
            onUndo();
          }}
          accessibilityRole="button"
          accessibilityLabel={undoName ?? 'Undo'}
          style={styles.undo}
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The third channel, owned here rather than written out at each row.
 *
 * `STRUCK.text` is the ink step and `STRUCK.pen` is the colour of the line; a row that
 * spelled out its own `textDecorationLine` would be free to pick a different pair. The
 * web has the same function returning Tailwind classes.
 */
export const crossedOff = (watched: boolean) =>
  watched
    ? {
        color: theme[STRUCK.text.on],
        textDecorationLine: 'line-through' as const,
        textDecorationColor: theme[STRUCK.pen],
      }
    : { color: theme[STRUCK.text.off] };

const styles = StyleSheet.create({
  slot: { flexDirection: 'row', alignItems: 'center', gap: space.s8 },
  ring: {
    width: RING.size,
    height: RING.size,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undo: {
    height: RING.size,
    paddingHorizontal: space.s12,
    borderRadius: radius.pill,
    borderWidth: RING.stroke,
    borderColor: theme[STRUCK.pen],
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: { color: theme.ink, fontSize: text.s12, fontFamily: type.family.title.name },
});
