import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { MASTHEAD, type MastheadLevel } from '@reviewies/core/ui/masthead';
import { type } from '@reviewies/core/tokens';
import { theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/masthead.ts`. The decisions are there.
 *
 * Three of the five tab roots set `marginBottom: 8` inside their heading style and two set
 * nothing, so two screens' titles sat against their content and three did not. The type was
 * uniform because a guard made it so; the gap was not, because no guard could see it.
 *
 * `accessibilityRole="header"` lives here rather than at the call sites, for the reason
 * `Section` does: on this platform it is a prop somebody has to remember, and somebody
 * eventually does not.
 *
 * `aria-level` is here for a sharper reason. The role alone is not enough: react-native-web
 * reads `props.accessibilityLevel || props['aria-level']` and, finding neither, emits
 * **`<h1>`**. So every masthead, sub-heading, section label and dateline on the phone was
 * an `<h1>` — `/data` rendered six — and the source looked correct the whole time, because
 * `accessibilityRole="header"` is exactly what it should say. Only the document showed it.
 */
export function Masthead({
  children,
  level = 'masthead',
}: {
  children: ReactNode;
  level?: MastheadLevel;
}) {
  return (
    <Text accessibilityRole="header" aria-level={MASTHEAD[level].depth} style={styles[level]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  masthead: {
    color: theme.ink,
    fontSize: MASTHEAD.masthead.size,
    fontFamily: type.family[MASTHEAD.masthead.face].name,
    marginBottom: MASTHEAD.masthead.gapBelow,
  },
  page: {
    color: theme.ink,
    fontSize: MASTHEAD.page.size,
    fontFamily: type.family[MASTHEAD.page.face].name,
    marginBottom: MASTHEAD.page.gapBelow,
  },
  sub: {
    color: theme.ink,
    fontSize: MASTHEAD.sub.size,
    fontFamily: type.family[MASTHEAD.sub.face].name,
    marginBottom: MASTHEAD.sub.gapBelow,
  },
});
