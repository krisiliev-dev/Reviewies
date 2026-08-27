import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ROW, ROW_INK, type RowContract } from '@reviewies/core/ui/row';
import { border, radius, space, theme } from './theme';
import { crossedOff } from './CrossOff';

/**
 * The React Native renderer of `core/src/ui/row.ts`. The decisions are there.
 *
 * The row is a `Pressable` only when it has somewhere to go, and then the whole row is
 * that one target — poster and words together, named once. `trailing` and `under` sit
 * outside it, so a row is never a control inside a control.
 */
export function Row({
  title,
  code,
  meta,
  tag,
  note,
  open,
  struck,
  disabled,
  density = 'listing',
  lead,
  trailing,
  under,
}: RowContract & {
  /** A route to push. The phone has no `href` to give. */
  open?: { name: string; run(): void };
  /** `<Poster/>` at `ROW.lead`, a time, or nothing. */
  lead?: ReactNode;
  /** `<CrossOff/>` | `<Button size="row"/>` | a chevron. Names itself. */
  trailing?: ReactNode;
  /**
   * Controls that do not fit beside the words.
   *
   * The direction says a row is "at most one navigation target and one action", and that
   * is a *naming* rule — "because a screen of rows is the same two words repeated down the
   * page" — not a counting one. Three screens genuinely offer three: Search's Track /
   * Watchlist / Seen it, Discover's Track / Save, the watchlist's note and Remove. Each
   * was added deliberately, each already names its own row, and collapsing them into one
   * would take back function the product went and added. What the rule forbids is a
   * control you cannot tell from the one on the row above, and §6.96's collision clause is
   * what actually measures that. So: one target, one `trailing`, and a group underneath
   * when a screen has a group — never a control inside the target.
   */
  under?: ReactNode;
}) {
  const words = (
    <View style={styles.body}>
      <Text numberOfLines={1} style={[styles.title, disabled && styles.off, crossedOff(!!struck)]}>
        {title}
      </Text>
      {code || meta ? (
        <Text numberOfLines={1} style={[styles.meta, disabled && styles.off]}>
          {code}
          {code && meta ? ' · ' : ''}
          {meta}
        </Text>
      ) : null}
      {note ? (
        <Text numberOfLines={2} style={styles.note}>
          {note}
        </Text>
      ) : null}
    </View>
  );

  const inside = (
    <>
      {lead}
      {words}
      {/* A word about the row, not a control. `AIRS FRI` is what an unaired episode gets
          instead of a ring, which is the whole reason `disabled` is not a fade. */}
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
    </>
  );

  return (
    <View style={styles.block}>
      <View style={[styles.row, density === 'index' && styles.index]}>
        {open ? (
          <Pressable
            onPress={open.run}
            accessibilityRole="link"
            // Required by the contract, and it carries what tells this row from its
            // neighbours: a screen of rows is the same two words down the page, and a
            // screen reader reads the control rather than what is above it.
            accessibilityLabel={open.name}
            accessibilityState={{ disabled: !!disabled }}
            style={({ pressed }) => [styles.target, pressed && styles.pressed]}
          >
            {inside}
          </Pressable>
        ) : (
          <View style={styles.target}>{inside}</View>
        )}
        {/* Outside the target, so the row is at most two controls and never one inside
            another. Whatever goes here names itself. */}
        {trailing}
      </View>
      {under}
    </View>
  );
}

const styles = StyleSheet.create({
  // The rule is on the block, not on the row's own line, so a group underneath sits inside
  // the same ruled band rather than getting a rule of its own. Full bleed and ruled, not a
  // rounded fill with a gutter: `radius.none` is the direction's, and this is the site it
  // was written for.
  block: {
    borderRadius: radius.none,
    borderBottomWidth: ROW.rule,
    borderBottomColor: theme[ROW.colour],
    backgroundColor: 'transparent',
    paddingVertical: ROW.padY,
    gap: space.s6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: ROW.gap, minHeight: ROW.minHeight.listing },
  index: { minHeight: ROW.minHeight.index },
  target: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: ROW.gap },
  // A ground step, not a scale: press feedback that was never motion is feedback Reduce
  // Motion has nothing to substitute for.
  pressed: { backgroundColor: theme.groundRaised },
  body: { flex: 1, minWidth: 0, gap: space.s2 },
  title: { color: theme[ROW_INK.title], fontSize: 15, fontWeight: '600' },
  meta: { color: theme[ROW_INK.meta], fontSize: 12 },
  note: { color: theme[ROW_INK.meta], fontSize: 12, fontStyle: 'italic' },
  off: { color: theme[ROW_INK.disabled] },
  tag: {
    color: theme[ROW_INK.tag],
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    borderWidth: border.hairline,
    borderColor: theme.strokeHairline,
    borderRadius: radius.plate,
    paddingHorizontal: space.s6,
    paddingVertical: space.s2,
  },
});
