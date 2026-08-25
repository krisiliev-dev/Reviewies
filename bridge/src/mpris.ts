import type { Command, Device, DeviceAdapter, Playback } from '@reviewies/core/devices/types';

/**
 * The local machine, via the OS media transport API.
 *
 * This is the best case in the whole design: when you watch on the same computer the
 * bridge runs on, it reports title *and* exact position with no network protocol
 * involved. Watching Mode syncs perfectly and no extra hardware exists.
 *
 * These are the same controls the OS shows in its own media widget — the analogy the
 * user drew. They are programmable; they just need a process on the machine rather
 * than a browser tab.
 *
 * Linux/MPRIS is implemented here because it is what can be exercised in this
 * environment. Windows (GlobalSystemMediaTransportControls) and macOS (MediaRemote)
 * expose equivalent data and slot in behind the same adapter interface.
 */

export interface MprisPlayer {
  /** D-Bus bus name, e.g. org.mpris.MediaPlayer2.vlc */
  busName: string;
  identity?: string;
  status?: string;
  /** Microseconds, as D-Bus reports it. */
  positionUs?: number;
  metadata?: Record<string, unknown>;
}

export interface MprisTransport {
  listPlayers(): Promise<string[]>;
  read(busName: string): Promise<MprisPlayer | undefined>;
  call(busName: string, method: string): Promise<void>;
  seek(busName: string, offsetUs: number): Promise<void>;
}

const METHODS: Partial<Record<Command, string>> = {
  play: 'Play',
  pause: 'Pause',
  playpause: 'PlayPause',
  select: 'PlayPause',
};

const SEEK_OFFSET_US = 15_000_000;

export function playerName(player: MprisPlayer): string {
  if (player.identity) return player.identity;
  // org.mpris.MediaPlayer2.vlc -> vlc
  const short = player.busName.split('.').pop() ?? player.busName;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** Translate MPRIS metadata into our shape. */
export function toPlayback(player: MprisPlayer): Playback | undefined {
  if (player.positionUs === undefined) return undefined;

  const metadata = player.metadata ?? {};
  const title = metadata['xesam:title'];
  const lengthUs = metadata['mpris:length'];

  return {
    positionSec: player.positionUs / 1_000_000,
    durationSec: typeof lengthUs === 'number' ? lengthUs / 1_000_000 : undefined,
    // MPRIS reports Playing / Paused / Stopped.
    paused: player.status !== 'Playing',
    title: typeof title === 'string' ? title : undefined,
    source: playerName(player),
  };
}

/**
 * Minimum length to be plausibly an episode.
 *
 * Ten minutes, not two. Music players and notification sounds also speak MPRIS, and
 * most songs run three to six minutes — a two-minute bar would let an entire album
 * through. Ten minutes sits comfortably below the shortest television episode and
 * above all but the most indulgent tracks.
 */
const MIN_EPISODE_US = 600_000_000;

/**
 * Whether a player is worth surfacing.
 *
 * Syncing Watching Mode to a track change would be worse than not syncing at all.
 */
export function isVideoLike(player: MprisPlayer): boolean {
  const lengthUs = player.metadata?.['mpris:length'];
  if (typeof lengthUs !== 'number') return true; // unknown length: give it the benefit
  return lengthUs > MIN_EPISODE_US;
}

export class MprisAdapter implements DeviceAdapter {
  readonly name = 'mpris';
  private readonly transport: MprisTransport;

  constructor(transport: MprisTransport) {
    this.transport = transport;
  }

  async discover(): Promise<Device[]> {
    let busNames: string[];
    try {
      busNames = await this.transport.listPlayers();
    } catch {
      // No D-Bus, or not Linux. Not an error worth surfacing.
      return [];
    }

    const devices: Device[] = [];
    for (const busName of busNames) {
      const player = await this.transport.read(busName).catch(() => undefined);
      if (!player || !isVideoLike(player)) continue;
      devices.push({
        id: `mpris:${busName}`,
        adapter: this.name,
        name: playerName(player),
        address: busName,
      });
    }
    return devices;
  }

  async send(device: Device, command: Command): Promise<void> {
    if (command === 'forward') return this.transport.seek(device.address, SEEK_OFFSET_US);
    if (command === 'back') return this.transport.seek(device.address, -SEEK_OFFSET_US);

    const method = METHODS[command];
    // Directional keys and volume have no MPRIS equivalent. Silently ignoring is
    // right here: the remote UI is shared across adapters, and throwing would turn
    // an inapplicable button into an error dialog.
    if (!method) return;
    await this.transport.call(device.address, method);
  }

  async getPlayback(device: Device): Promise<Playback | undefined> {
    const player = await this.transport.read(device.address).catch(() => undefined);
    return player ? toPlayback(player) : undefined;
  }
}
