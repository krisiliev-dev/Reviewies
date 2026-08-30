import { ROW } from '@reviewies/core/ui/row';
import { COPY } from '@reviewies/core/copy';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Command } from '@reviewies/core/devices/types';
import { DPAD, HOME, KEY_HEIGHT, TRANSPORT, VOLUME } from '@reviewies/core/ui/key';
import { Key } from '../ui/Key';
import type { Remote } from './useRemote';
import { leadingOf, theme, space} from '../ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type, leading } from '@reviewies/core/tokens';
import { Section } from '../ui/Section';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Progress } from '../ui/Progress';
import { Button } from '../ui/Button';

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
            <Section>{COPY.controls.device}</Section>
            {/* A `Button`. It was a bare `Text` in the title face at primary ink inside a
                `Pressable` — brighter than the `Section` eyebrow beside it and shaped like
                nothing, so `24-watching-remote` reads it as a second heading rather than
                as the one action on a drawer that has no device. Same class as §6.126's
                47x16 "Add to list", and in the same place: a surface no design pass had
                ever photographed. §6.130. */}
            <Button
              size="inline"
              tone="secondary"
              onPress={remote.scan}
              busy={remote.scanning}
              disabled={remote.scanning}
              label={remote.scanning ? 'Scanning…' : 'Scan Wi-Fi'}
              name="Scan the Wi-Fi for a device"
            />
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
              aria-selected={remote.device?.id === found.id}
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
  /* A device is an entry in a list of devices, so a rule rather than a fill. */
  device: {
    borderBottomWidth: ROW.rule,
    borderBottomColor: theme[ROW.colour],
    marginHorizontal: SCREEN.bleed,
    paddingHorizontal: SCREEN.edge,
    paddingVertical: space.s12,
  },
  deviceOn: { borderWidth: 1, borderColor: theme.strokeSignal },
  deviceName: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  deviceAddress: { color: theme.inkSecondary },
  error: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.body.name },
  nowPlaying: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.body.name },

  transport: { flexDirection: 'row', gap: 8 },
  dpad: { alignItems: 'center', gap: 8 },
  dpadRow: { flexDirection: 'row', gap: 8 },
  /* An empty cell of the d-pad grid, the same width as the key it stands in for. It was
     `minWidth: 72` — the second hand-typed copy of a number `Key.tsx` also typed and the
     core never stated, so the grid lined up only as long as both files agreed. §6.181. */
  dpadGap: { minWidth: KEY_HEIGHT },

});
