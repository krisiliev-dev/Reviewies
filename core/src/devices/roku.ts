import type { Command, Device, DeviceAdapter, Playback } from './types.ts';
import { DeviceError } from './types.ts';

/**
 * Roku, via its External Control Protocol.
 *
 * The simplest protocol in the category by some margin: plain HTTP on port 8060, no
 * authentication, no pairing. It also reports playback position, which most
 * alternatives do not — which is why it is the first adapter rather than the third.
 *
 * Discovery is SSDP over UDP multicast. That is exactly the capability a browser
 * lacks and a small local process has, and is the reason the bridge exists at all.
 */

const PORT = 8060;

/** ECP key names. Our vocabulary is deliberately smaller than the full remote's. */
const KEYS: Record<Command, string> = {
  play: 'Play',
  pause: 'Play', // ECP has no separate pause; Play toggles.
  playpause: 'Play',
  forward: 'Fwd',
  back: 'Rev',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  select: 'Select',
  home: 'Home',
  volumeUp: 'VolumeUp',
  volumeDown: 'VolumeDown',
  mute: 'VolumeMute',
};

export function commandToKey(command: Command): string {
  return KEYS[command];
}

/**
 * Parse the XML from `/query/media-player`.
 *
 * A regex rather than an XML parser on purpose: the response is a fixed, shallow
 * shape, and this keeps the bridge dependency-free enough to run anywhere Node does.
 */
export function parseMediaPlayer(xml: string): Playback | undefined {
  const state = /<player[^>]*state="([^"]*)"/i.exec(xml)?.[1]?.toLowerCase();
  if (!state || state === 'close' || state === 'none') return undefined;

  // Positions come as "12345 ms".
  const ms = (tag: string) => {
    const raw = new RegExp(`<${tag}[^>]*>\\s*([0-9]+)\\s*ms\\s*</${tag}>`, 'i').exec(xml)?.[1];
    return raw ? Number(raw) / 1000 : undefined;
  };

  const position = ms('position');
  if (position === undefined) return undefined;

  return {
    positionSec: position,
    durationSec: ms('duration'),
    // ECP reports "play", "pause" and "buffer"; only "play" is really playing.
    paused: state !== 'play',
    title: /<title[^>]*>([^<]*)<\/title>/i.exec(xml)?.[1]?.trim() || undefined,
    source: /<plugin[^>]*name="([^"]*)"/i.exec(xml)?.[1] || undefined,
  };
}

/** Parse the device name out of `/query/device-info`. */
export function parseDeviceName(xml: string): string | undefined {
  const friendly =
    /<friendly-device-name[^>]*>([^<]*)<\/friendly-device-name>/i.exec(xml)?.[1] ??
    /<user-device-name[^>]*>([^<]*)<\/user-device-name>/i.exec(xml)?.[1] ??
    /<model-name[^>]*>([^<]*)<\/model-name>/i.exec(xml)?.[1];
  return friendly?.trim() || undefined;
}

/** Pull LOCATION headers out of SSDP responses and reduce them to host addresses. */
export function parseSsdpLocations(responses: string[]): string[] {
  const hosts = new Set<string>();
  for (const response of responses) {
    const location = /^location:\s*(\S+)/im.exec(response)?.[1];
    if (!location) continue;
    try {
      hosts.add(new URL(location).hostname);
    } catch {
      // Malformed LOCATION; skip rather than abort the whole discovery.
    }
  }
  return [...hosts];
}

export interface RokuTransport {
  get(url: string, signal?: AbortSignal): Promise<string>;
  post(url: string, signal?: AbortSignal): Promise<void>;
  /** Returns raw SSDP response bodies. */
  discover(timeoutMs: number): Promise<string[]>;
}

export class RokuAdapter implements DeviceAdapter {
  readonly name = 'roku';
  private readonly transport: RokuTransport;

  constructor(transport: RokuTransport) {
    this.transport = transport;
  }

  async discover(signal?: AbortSignal): Promise<Device[]> {
    let hosts: string[];
    try {
      hosts = parseSsdpLocations(await this.transport.discover(2000));
    } catch {
      // No devices, no multicast, or a firewall. An empty network is not an error.
      return [];
    }

    const devices: Device[] = [];
    for (const host of hosts) {
      try {
        const xml = await this.transport.get(`http://${host}:${PORT}/query/device-info`, signal);
        devices.push({
          id: `roku:${host}`,
          adapter: this.name,
          name: parseDeviceName(xml) ?? `Roku (${host})`,
          address: host,
        });
      } catch {
        // Something answered SSDP but is not a reachable Roku; skip it.
      }
    }
    return devices;
  }

  async send(device: Device, command: Command, signal?: AbortSignal): Promise<void> {
    const key = commandToKey(command);
    if (!key) throw new DeviceError(device.id, `Unsupported command: ${command}`);

    try {
      await this.transport.post(`http://${device.address}:${PORT}/keypress/${key}`, signal);
    } catch (err) {
      throw new DeviceError(device.id, err instanceof Error ? err.message : 'Send failed');
    }
  }

  async getPlayback(device: Device, signal?: AbortSignal): Promise<Playback | undefined> {
    try {
      const xml = await this.transport.get(
        `http://${device.address}:${PORT}/query/media-player`,
        signal,
      );
      return parseMediaPlayer(xml);
    } catch {
      // Nothing playing, or the device went away mid-poll.
      return undefined;
    }
  }
}
