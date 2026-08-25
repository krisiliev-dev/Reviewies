import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, theme } from '../ui/theme';
import { useListenSync } from '../fingerprint/listen';

/**
 * The control for continuous listening.
 *
 * Written to be readable in a dark room at arm's length and, more importantly, to be
 * unambiguous about whether the microphone is on. There is exactly one affordance, its
 * label always says what will happen next, and while it is running the screen says so
 * in plain words rather than with an icon someone has to already know the meaning of.
 */
export function ListenSync({
  targetId,
  positionMs,
  onCorrection,
}: {
  targetId: string;
  positionMs: number;
  onCorrection: (ms: number) => void;
}) {
  const listen = useListenSync({ targetId, positionMs, onCorrection });

  // On the web build there is no native audio stream, and the web app has its own
  // one-shot capture. Showing a button that cannot work would be worse than nothing.
  if (listen.state === 'unsupported') return null;

  const running = listen.state === 'listening';

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Pressable
          onPress={() => (running ? listen.stop() : void listen.start())}
          style={[styles.button, running && styles.buttonOn]}
        >
          <Text style={[styles.buttonText, running && styles.buttonTextOn]}>
            {running ? 'Stop listening' : 'Keep in sync by listening'}
          </Text>
        </Pressable>

        {running && (
          <Text style={styles.status}>
            {listen.lastMatch
              ? `Following along, ${Math.round(listen.lastMatch.confidence * 100)}% sure`
              : listen.misses > 0
                ? 'Listening — nothing recognised yet'
                : 'Listening…'}
          </Text>
        )}
      </View>

      {listen.note && <Text style={styles.note}>{listen.note}</Text>}

      <Text style={styles.blurb}>
        {running
          ? // Said again while it is actually running, because this is the moment it
            // matters and the moment someone is most likely to want reassurance.
            'The microphone is on, including while this screen is in the background. Audio is analysed here and thrown away — nothing is recorded or sent.'
          : 'Listens to the room so the clock keeps itself right through pauses and skips. Audio never leaves this device.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: theme.surface2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
  },
  buttonOn: { backgroundColor: theme.accent },
  buttonText: { color: theme.text, fontSize: 13 },
  buttonTextOn: { color: theme.ink, fontWeight: '600' },
  status: { color: theme.muted, fontSize: 12, flexShrink: 1 },
  note: { color: theme.accent, fontSize: 12, marginTop: 6 },
  blurb: { color: theme.muted, fontSize: 11, lineHeight: 15, marginTop: 6 },
});
