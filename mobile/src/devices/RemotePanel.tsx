import { SURFACE } from '@reviewies/core/ui/surface';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Command } from '@reviewies/core/devices/types';
import { DPAD, HOME, TRANSPORT, VOLUME } from '@reviewies/core/ui/key';
import { Key } from '../ui/Key';
import type { Remote } from './useRemote';
import { leadingOf, radius, tap, theme } from '../ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type, leading } from '@reviewies/core/tokens';
import { Section } from '../ui/Section';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Progress } from '../ui/Progress';

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
  // The repeat count comes from the fascia table now. It used to be typed at each call
  // site, and the web typed a different one — the same key moved a different distance
  // depending on which screen you pressed it from.
  const press = async (command: Command, times = 1) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    for (let i = 0; i < times; i++) await remote.send(command);
  };

  return (
    <>
        <View style={styles.devices}>
          <View style={styles.devicesHead}>
            <Section>Device</Section>
            <Pressable
              onPress={remote.scan}
              disabled={remote.scanning}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Scan the Wi-Fi for a device"
              accessibilityState={{ disabled: remote.scanning, busy: remote.scanning }}
              style={tap}
            >
              <Text style={styles.scan}>{remote.scanning ? 'Scanning…' : 'Scan Wi-Fi'}</Text>
            </Pressable>
          </View>

          {remote.scanning && (
            <View>
              <Progress size="rule" value={remote.progress} max={1} label="Scanning your network" />
            </View>
          )}

          {remote.devices.length === 0 && !remote.scanning && (
            <Note>
              No device yet. Scan while the TV is on and on the same Wi-Fi.
            </Note>
          )}

          {remote.devices.map((found) => (
            <Pressable
              key={found.id}
              onPress={() => remote.select(found)}
              style={[styles.device, remote.device?.id === found.id && styles.deviceOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: remote.device?.id === found.id }}
              accessibilityLabel={`Use ${found.name} at ${found.address}`}
            >
              <Text style={styles.deviceName}>{found.name}</Text>
              <Data value={found.address} size="s12" style={styles.deviceAddress} />
            </Pressable>
          ))}
        </View>

        {remote.error && <Text style={styles.error}>{remote.error}</Text>}

        {remote.playback?.title && (
          <Text style={styles.nowPlaying}>
            {remote.playback.paused ? 'Paused' : 'Playing'} · {remote.playback.title}
          </Text>
        )}

        {/* Off until there is something to talk to. Every key used to render pressable
            with no device attached: pressing one did nothing and said nothing, which is
            the state a control should never be in. */}
        <View style={styles.transport}>
          {TRANSPORT.map((spec) => (
            <Key key={spec.command} spec={spec} disabled={!remote.device} onPress={press} />
          ))}
        </View>

        <View style={styles.dpad}>
          {[0, 3, 6].map((start) => (
            <View key={start} style={styles.dpadRow}>
              {DPAD.slice(start, start + 3).map((spec, i) =>
                spec ? (
                  <Key key={spec.command} spec={spec} disabled={!remote.device} onPress={press} />
                ) : (
                  <View key={`gap-${start + i}`} style={styles.dpadGap} />
                ),
              )}
            </View>
          ))}
        </View>

        <View style={styles.transport}>
          {VOLUME.map((spec) => (
            <Key key={spec.command} spec={spec} disabled={!remote.device} onPress={press} />
          ))}
        </View>

        <View style={styles.transport}>
          <Key spec={HOME} disabled={!remote.device} onPress={press} />
        </View>

        {/* What somebody standing here needs to know, and nothing else.
            *
            * This was a paragraph about adapter architecture — that there is no
            * vendor-neutral protocol, that every universal remote is a pile of adapters
            * behind one set of buttons, that Cast and AirPlay need their vendors' SDKs.
            * All true, and all reasoning about the implementation, in a drawer somebody
            * opens mid-episode to press pause. The reasons live in doc 6 §2 and doc 9
            * §1.2 where they belong. Doc 10, second evening. */}
        <Note level="footnote">
          Works with Roku over Wi-Fi, and with a laptop through the companion bridge.
          Chromecast and AirPlay are not supported.
        </Note>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN.edge, gap: 20, backgroundColor: theme.ground, flexGrow: 1 },
  devices: { gap: 8 },
  devicesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scan: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  device: { backgroundColor: theme[SURFACE.card], borderRadius: radius.plate, padding: 12 },
  deviceOn: { borderWidth: 1, borderColor: theme.strokeSignal },
  deviceName: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  deviceAddress: { color: theme.inkSecondary },
  error: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.body.name },
  nowPlaying: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.body.name },

  transport: { flexDirection: 'row', gap: 8 },
  dpad: { alignItems: 'center', gap: 8 },
  dpadRow: { flexDirection: 'row', gap: 8 },
  dpadGap: { minWidth: 72 },

});
