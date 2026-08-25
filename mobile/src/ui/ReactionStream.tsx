import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Reaction } from '@reviewies/core/domain/types';

/**
 * Other people's reactions, arriving as you reach their moment.
 *
 * Straight from the brief: they appear as you come to that timestamp and drift off to
 * the left. The prior art is danmaku — Niconico and Bilibili have had this for twenty
 * years — and the thing it gets right is that a comment tied to a *moment* reads as
 * company rather than as a feed.
 *
 * Replayed from history, not live. That is what makes it work at all: the density
 * comes from everyone who ever watched this episode, so a show nobody is watching
 * tonight is still busy. A live-only version is empty on day one, which is precisely
 * the number people rank trackers by (doc 8 §2).
 */
const LIFETIME_MS = 4000;
const LANES = 4;

export function ReactionStream({
  reactions,
  positionMs,
  density,
}: {
  reactions: Reaction[];
  positionMs: number;
  density: number;
}) {
  // Which reactions belong on screen right now: those whose moment has just passed.
  const visible = reactions
    .filter((r) => r.tMs <= positionMs && positionMs - r.tMs < LIFETIME_MS)
    .slice(0, density);

  return (
    <View style={styles.stream} pointerEvents="none">
      {visible.map((reaction, index) => (
        <Floater
          key={reaction.id}
          emoji={reaction.emoji}
          lane={index % LANES}
          age={positionMs - reaction.tMs}
        />
      ))}
    </View>
  );
}

function Floater({ emoji, lane, age }: { emoji: string; lane: number; age: number }) {
  const progress = useRef(new Animated.Value(Math.min(1, age / LIFETIME_MS))).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(0, LIFETIME_MS - age),
      easing: Easing.linear,
      // The native driver keeps this off the JS thread, which matters here: the pad
      // is being tapped at the same time and a stutter would be felt immediately.
      useNativeDriver: true,
    }).start();
  }, [progress, age]);

  return (
    <Animated.View
      style={[
        styles.floater,
        { top: lane * 34 },
        {
          opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -260],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stream: { height: LANES * 34, overflow: 'hidden' },
  floater: { position: 'absolute', right: 0 },
  emoji: { fontSize: 26 },
});
