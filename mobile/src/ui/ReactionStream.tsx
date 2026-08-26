import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Reaction } from '@reviewies/core/domain/types';
import { useReducedMotion } from './useReducedMotion';
import { ANNOUNCE_EVERY_MS, summarise } from '@reviewies/core/watching/announce';
import { REACTION_VISIBLE_MS } from '@reviewies/core/watching/reactions';

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

const LANES = 4;

export function ReactionStream({
  reactions,
  positionMs,
  density,
  paused = false,
}: {
  reactions: Reaction[];
  positionMs: number;
  density: number;
  /**
   * Holds the stream still without stopping the clock.
   *
   * WCAG 2.2.2 asks for a way to stop anything that moves by itself for more than five
   * seconds, and this moves for the length of an episode. Density thins it out; only
   * this stops it. Not the same control as the clock's pause — wanting the timecode to
   * keep running while the top of the screen holds still is a reasonable thing to want.
   */
  paused?: boolean;
}) {
  const reduced = useReducedMotion();

  /**
   * What this says out loud, which on the phone was nothing at all.
   *
   * The web's stream announced every reaction as it drifted past, which is twenty-four
   * interruptions a minute; the phone's announced none, which removes the feature
   * outright for anyone who cannot see it. Neither is the answer. A burst is collected
   * and summarised once — "four laughing" at the punchline — and between moments it is
   * quiet. Held stops the talking with the movement, because somebody who asked the
   * screen to hold still has asked for quiet.
   */
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<string[]>([]);
  const spokeAt = useRef(0);
  const lastAt = useRef(0);

  // Which reactions belong on screen right now: those whose moment has just passed.
  // Held, the position stops advancing as far as this is concerned, so what is on
  // screen stays on screen and nothing new arrives.
  const held = useRef(positionMs);
  if (!paused) held.current = positionMs;
  const at = paused ? held.current : positionMs;

  const visible = reactions
    .filter((r) => r.tMs <= at && at - r.tMs < REACTION_VISIBLE_MS)
    .slice(0, density);

  // Collected as their moment passes, from the same set that is shown — density thins
  // what is announced exactly as it thins what drifts.
  if (at > lastAt.current) {
    for (const reaction of visible) {
      if (reaction.tMs > lastAt.current && reaction.tMs <= at) pending.current.push(reaction.emoji);
    }
    lastAt.current = at;
  }

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (pending.current.length === 0) return;
      const now = Date.now();
      if (now - spokeAt.current < ANNOUNCE_EVERY_MS) return;
      spokeAt.current = now;
      setAnnouncement(summarise(pending.current));
      pending.current = [];
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <View
      style={styles.stream}
      pointerEvents="none"
      // Named for the same reason the web's is: without it this is an unlabelled box
      // that emoji appear inside of.
      accessibilityLabel="Reactions from other viewers"
    >
      {/* The only thing here that speaks. The emoji are a visual swell; read one at a
          time they are noise. */}
      <Text
        accessibilityLiveRegion="polite"
        style={styles.announcement}
        // Off-screen rather than invisible: react-native has no equivalent of sr-only,
        // and display:none would take it out of the accessibility tree with it.
      >
        {announcement}
      </Text>
      {visible.map((reaction, index) => (
        // aria-hidden: they are a visual swell, and swiping through them one at a
        // time is the noise the summary above exists to replace.
        <Floater
          key={reaction.id}
          emoji={reaction.emoji}
          lane={index % LANES}
          age={at - reaction.tMs}
          still={reduced || paused}
          slot={index % LANES}
        />
      ))}
    </View>
  );
}

function Floater({
  emoji,
  lane,
  age,
  still,
  slot,
}: {
  emoji: string;
  lane: number;
  age: number;
  /** No drift: reduced motion asked for, or the stream held. */
  still: boolean;
  slot: number;
}) {
  const progress = useRef(new Animated.Value(Math.min(1, age / REACTION_VISIBLE_MS))).current;

  useEffect(() => {
    if (still) {
      // Stopped where it is rather than run to the end. Flattening the duration would
      // send every reaction straight to its final state, which for a drift is off the
      // left-hand edge — reduced motion would have meant an empty stream.
      progress.stopAnimation();
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(0, REACTION_VISIBLE_MS - age),
      easing: Easing.linear,
      // The native driver keeps this off the JS thread, which matters here: the pad
      // is being tapped at the same time and a stutter would be felt immediately.
      useNativeDriver: true,
    }).start();
  }, [progress, age, still]);

  if (still) {
    // Placed rather than travelled, spread across the width so several at once do not
    // land on top of each other.
    return (
      <View aria-hidden style={[styles.floater, { top: lane * 34, right: 8 + slot * 64 }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
    );
  }

  return (
    <Animated.View
      aria-hidden
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
  announcement: { position: 'absolute', left: -10000, width: 1, height: 1 },
});
