import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Command } from '@reviewies/core/devices/types';
import type { Remote } from './useRemote';
import { radius, theme } from '../ui/theme';

/**
 * The remote's controls, without deciding where they live.
 *
 * From the original brief: "pause, play, skip 15s, rewind 15s… hidden in a drawer to the
 * side." The controls were right from the start; where they lived was not. On the phone
 * this was a screen reached from the More tab, which meant that reaching for the remote
 * during an episode threw away Watching Mode — the clock, the reaction stream, the whole
 * reason for being on that screen. Extracted so it can be both a screen and a drawer,
 * because the drawer is the half the brief actually specified.
 *
 * It talks to the television directly over the Wi-Fi. That is the single clearest thing
 * going native bought — the same feature on the web needed a companion process on the
 * user's machine dialling out to a relay we host, because a page cannot open a
 * connection to a LAN address.
 *
 * Skipping is built from repeated key presses because Roku's ECP has no seek: it has
 * `Fwd` and `Rev`, which move by a fixed step in whatever is playing. The number of
 * presses is a decent approximation and the honest alternative — no skip button — is
 * worse.
 */
export function RemotePanel({ remote }: { remote: Remote }) {
  const press = async (command: Command, times = 1) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    for (let i = 0; i < times; i++) await remote.send(command);
  };

  return (
    <>
        <View style={styles.devices}>
          <View style={styles.devicesHead}>
            <Text style={styles.sectionHeading}>Device</Text>
            <Pressable onPress={remote.scan} disabled={remote.scanning} hitSlop={8}>
              <Text style={styles.scan}>{remote.scanning ? 'Scanning…' : 'Scan Wi-Fi'}</Text>
            </Pressable>
          </View>

          {remote.scanning && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${remote.progress * 100}%` }]} />
            </View>
          )}

          {remote.devices.length === 0 && !remote.scanning && (
            <Text style={styles.blurb}>
              No device yet. Scan while the TV is on and on the same Wi-Fi.
            </Text>
          )}

          {remote.devices.map((found) => (
            <Pressable
              key={found.id}
              onPress={() => remote.select(found)}
              style={[styles.device, remote.device?.id === found.id && styles.deviceOn]}
            >
              <Text style={styles.deviceName}>{found.name}</Text>
              <Text style={styles.deviceAddress}>{found.address}</Text>
            </Pressable>
          ))}
        </View>

        {remote.error && <Text style={styles.error}>{remote.error}</Text>}

        {remote.playback?.title && (
          <Text style={styles.nowPlaying}>
            {remote.playback.paused ? 'Paused' : 'Playing'} · {remote.playback.title}
          </Text>
        )}

        <View style={styles.transport}>
          <Key label="⏪ 15s" onPress={() => press('back', 3)} wide />
          <Key label="⏯" onPress={() => press('playpause')} primary />
          <Key label="15s ⏩" onPress={() => press('forward', 3)} wide />
        </View>

        <View style={styles.dpad}>
          <View style={styles.dpadRow}>
            <Key label="▲" onPress={() => press('up')} />
          </View>
          <View style={styles.dpadRow}>
            <Key label="◀" onPress={() => press('left')} />
            <Key label="OK" onPress={() => press('select')} primary />
            <Key label="▶" onPress={() => press('right')} />
          </View>
          <View style={styles.dpadRow}>
            <Key label="▼" onPress={() => press('down')} />
          </View>
        </View>

        <View style={styles.transport}>
          <Key label="Home" onPress={() => press('home')} wide />
          <Key label="Vol −" onPress={() => press('volumeDown')} wide />
          <Key label="Vol +" onPress={() => press('volumeUp')} wide />
        </View>

        <Text style={styles.footnote}>
          Roku over Wi-Fi, and a laptop through the companion bridge. Every device type is
          its own adapter — there is no vendor-neutral protocol to use instead, which is
          why every universal remote is a pile of them behind one set of buttons. Cast and
          AirPlay need their vendors&apos; SDKs and are not built; Bluetooth is not a way
          to control a television at all.
        </Text>
    </>
  );
}

function Key({
  label,
  onPress,
  primary,
  wide,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        wide && styles.keyWide,
        primary && styles.keyPrimary,
        pressed && styles.keyPressed,
      ]}
    >
      <Text style={[styles.keyText, primary && styles.keyTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, backgroundColor: theme.ink, flexGrow: 1 },
  devices: { gap: 8 },
  devicesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  scan: { color: theme.accent, fontSize: 14, fontWeight: '600' },
  progressTrack: { height: 3, backgroundColor: theme.surface2, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: theme.accent, borderRadius: 2 },
  blurb: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  device: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: 12 },
  deviceOn: { borderWidth: 1, borderColor: theme.accent },
  deviceName: { color: theme.text, fontSize: 15, fontWeight: '600' },
  deviceAddress: { color: theme.muted, fontSize: 11 },
  error: { color: theme.accent, fontSize: 13, lineHeight: 19 },
  nowPlaying: { color: theme.muted, fontSize: 13 },

  transport: { flexDirection: 'row', gap: 8 },
  dpad: { alignItems: 'center', gap: 8 },
  dpadRow: { flexDirection: 'row', gap: 8 },

  key: {
    minWidth: 72,
    minHeight: 60,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWide: { flex: 1 },
  keyPrimary: { backgroundColor: theme.accent },
  keyPressed: { transform: [{ scale: 0.95 }] },
  keyText: { color: theme.text, fontSize: 16 },
  keyTextPrimary: { color: theme.ink, fontWeight: '700' },

  footnote: { color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
});
