import { PRESS } from '@reviewies/core/ui/surface';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SCREEN } from '@reviewies/core/ui/screen';
import { ROW, ROW_INK, type RowContract, type RowOpen } from '@reviewies/core/ui/row';
import { border, radius, space, theme, tracking } from './theme';
import { crossedOff } from './CrossOff';
import { text, type, track } from '@reviewies/core/tokens';

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
  count,
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
  /** Straight from the contract — `to` is pushed here, `run` is called. */
  open?: RowOpen;
  /** `<Poster/>` at row size, a time, or nothing. */
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
      {/* The row's own words, not a badge — see the contract for what happened when this
          was a `tag`. Same size and ink as the meta line, on a line of its own. */}
      {count ? (
        <Text numberOfLines={1} style={styles.meta}>
          {count}
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
            // `to` is a destination and `run` is a callback, so the row's role is the
            // field it was given — the same rule the web has always used, rather than a
            // second flag saying the same thing that the two platforms read differently
            // (#170). The route is pushed here so that a destination stays data in the
            // contract instead of hiding inside a closure at eight call sites.
            onPress={open.to === undefined ? open.run : () => router.push(open.to as never)}
            accessibilityRole={open.to === undefined ? 'button' : 'link'}
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
    /*
     * And it actually reaches the edge now, which the comment above had claimed since the
     * component was written and no screen had ever allowed. The row cancels its container's
     * edge on both sides and re-applies it to itself, so the rule runs to the paper and the
     * words stay in the column. The design harness measured 21 rules at `16..374 of 390`
     * before this; a class name is not an edge.
     */
    marginHorizontal: SCREEN.bleed,
    paddingHorizontal: SCREEN.edge,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: ROW.gap, minHeight: ROW.minHeight.listing },
  index: { minHeight: ROW.minHeight.index },
  target: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: ROW.gap },
  // A ground step, not a scale: press feedback that was never motion is feedback Reduce
  // Motion has nothing to substitute for.
  // A press sinks, on every control on both platforms. It used to rise — to the card
  // fill four screens wrap their rows in, so a press inside one repainted to the colour
  // it was already painted and nothing happened. See `core/src/ui/surface.ts`.
  pressed: { backgroundColor: theme[PRESS] },
  body: { flex: 1, minWidth: 0, gap: space.s2 },
  title: { color: theme[ROW_INK.title], fontSize: text.s14, fontFamily: type.family.title.name },
  meta: { color: theme[ROW_INK.meta], fontSize: text.s12, fontFamily: type.family.body.name },
  note: { color: theme[ROW_INK.meta], fontSize: text.s12, fontFamily: type.family.proseItalic.name },
  off: { color: theme[ROW_INK.disabled] },
  tag: {
    color: theme[ROW_INK.tag],
    fontSize: text.s12,
    letterSpacing: tracking(text.s12, track.t83),
    borderWidth: border.hairline,
    borderColor: theme.strokeHairline,
    borderRadius: radius.plate,
    paddingHorizontal: space.s6,
    paddingVertical: space.s2,
    fontFamily: type.family.title.name,
  },
});
