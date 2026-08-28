import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BLOCK } from '@reviewies/core/ui/block';
import { Section } from './Section';

/**
 * The React Native renderer of `core/src/ui/block.ts`. The decisions are there.
 *
 * Lifted out of `data.tsx`, where it lived as a local function whose own comment said one
 * file holding both was how the label ended up hand-written nine times. Five screens
 * assembled the pair by hand; four of them boxed the label in a raised card at `s16` and
 * one — `people.tsx` — did it both ways in the same scroll view.
 */
export function Block({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <Section>{heading}</Section>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ block: { gap: BLOCK.gap } });
