import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, theme } from '../ui/theme';
import { useListenSync } from '../fingerprint/listen';

/**
 * The two microphone controls.
 *
 * Written to be readable in a dark room at arm's length and, more importantly, to be
 * unambiguous about whether the microphone is on. Whichever job is running, its button
 * turns into the one that stops it, the screen says in plain words what is happening,
 * and nothing starts without a tap.
 *
 * Mapping is deliberately the quieter of the two. It is an act of contribution rather
 * than something you do for yourself, it only helps if the clock is already right, and
 * offering it as prominently as listening would invite exactly the well-meaning
 * badly-timed contributions that would misplace everyone else's reactions.
 */
export function ListenSync({
  targetId,
  positionMs,
  clockRunning,
  onCorrection,
}: {
  targetId: string;
  positionMs: number;
  /** Mapping is only meaningful against a clock that is actually running. */
  clockRunning: boolean;
  onCorrection: (ms: number) => void;
}) {
  const listen = useListenSync({ targetId, positionMs, onCorrection });

  // On the web build there is no native audio stream, and the web app has its own
  // one-shot capture. Showing a button that cannot work would be worse than nothing.
  if (listen.state === 'unsupported') return null;

  const listening = listen.state === 'listening';
  const mapping = listen.state === 'mapping';
  const uploading = listen.state === 'uploading';
  const busy = listening || mapping || uploading;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Pressable
          onPress={() => (listening ? listen.stop() : void listen.startListening())}
          disabled={mapping || uploading}
          style={[styles.button, listening && styles.buttonOn, mapping && styles.buttonOff]}
          accessibilityRole="button"
          accessibilityState={{ disabled: mapping || uploading, selected: listening }}
        >
          <Text style={[styles.buttonText, listening && styles.buttonTextOn]}>
            {listening ? 'Stop listening' : 'Keep in sync by listening'}
          </Text>
        </Pressable>

        {listening && (
          <Text style={styles.status}>
            {listen.lastMatch
              ? `Following along, ${Math.round(listen.lastMatch.confidence * 100)}% sure`
              : listen.misses > 0
                ? 'Listening — nothing recognised yet'
                : 'Listening…'}
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={() => (mapping ? listen.stop() : void listen.startMapping())}
          disabled={listening || uploading || (!mapping && !clockRunning)}
          style={[
            styles.quiet,
            mapping && styles.buttonOn,
            (listening || uploading || (!mapping && !clockRunning)) && styles.buttonOff,
          ]}
          accessibilityRole="button"
          accessibilityState={{
            disabled: listening || uploading || (!mapping && !clockRunning),
            selected: mapping,
            busy: uploading,
          }}
        >
          <Text style={[styles.quietText, mapping && styles.buttonTextOn]}>
            {mapping ? 'Finish and contribute' : uploading ? 'Sending…' : 'Help map this episode'}
          </Text>
        </Pressable>

        {mapping && listen.mapping && (
          <Text style={styles.status}>
            {formatDuration(listen.mapping.seconds)} · {listen.mapping.landmarks.toLocaleString()}{' '}
            landmarks
          </Text>
        )}

        {!busy && !clockRunning && (
          // Said rather than merely disabled: a greyed-out button with no explanation
          // reads as broken, and the reason here is the whole point — a contribution is
          // only as accurate as the clock it was recorded against.
          <Text style={styles.status}>Start the episode first, so the timing is right</Text>
        )}
      </View>

      {listen.note && <Text style={styles.note}>{listen.note}</Text>}

      <Text style={styles.blurb}>
        {mapping
          ? 'Recording the whole episode is best. Audio is turned into landmarks as it arrives and discarded — what gets sent cannot be turned back into sound.'
          : listening
            ? // Repeated while it is actually running, because that is the moment it
              // matters and the moment someone is most likely to want reassurance.
              'The microphone is on, including while this screen is in the background. Audio is analysed here and thrown away — nothing is recorded or sent.'
            : 'Listening keeps the clock right through pauses and skips. Mapping is how an episode becomes listenable for everyone else. Audio never leaves this device.'}
      </Text>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

const styles = StyleSheet.create({
  block: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: radius.plate,
    backgroundColor: theme.surface2,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: theme.surface,
  },
  buttonOn: { backgroundColor: theme.accent },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: theme.text, fontSize: 13 },
  buttonTextOn: { color: theme.ink, fontWeight: '600' },
  quiet: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.edge,
  },
  quietText: { color: theme.muted, fontSize: 12 },
  status: { color: theme.muted, fontSize: 12, flexShrink: 1 },
  note: { color: theme.accent, fontSize: 12 },
  blurb: { color: theme.muted, fontSize: 11, lineHeight: 15 },
});
