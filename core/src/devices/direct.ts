import { RokuAdapter, type RokuTransport } from './roku.ts';
import { scanSubnet, subnetHosts, type ProbeOptions } from './scan.ts';
import type { Command, Device, Playback } from './types.ts';

/**
 * Talking to a television directly, with nothing in between.
 *
 * This is what going native bought. A web page cannot open a connection to
 * `192.168.1.42` — mixed content forbids it, and there is no way to be granted local
 * network access — so doc 5 inverted the whole problem: a companion process on the
 * user's own machine dialled *outward* to a relay we host, and the app talked to the
 * relay. Three moving parts to send "pause".
 *
 * An app with the local network entitlement just sends the request. The bridge stays
 * useful for controlling a laptop, because MPRIS is a D-Bus interface with no network
 * protocol at all — but for a television it is no longer the only way through.
 */

const ECP_PORT = 8060;

/** A `RokuTransport` over ordinary HTTP. Discovery is handled by the scanner. */
export function createFetchTransport(): Omit<RokuTransport, 'discover'> {
  return {
    async get(url, signal) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    async post(url, signal) {
      const response = await fetch(url, { method: 'POST', signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
  };
}

export interface DiscoveryOptions extends ProbeOptions {
  /** This device's own address on the LAN, from the platform's network API. */
  localAddress: string;
}

/**
 * Find Rokus by asking every address on the subnet whether it is one.
 *
 * The probe is `/query/device-info`, which is unauthenticated and answers instantly on
 * a real Roku. Anything else either refuses the connection or returns something that
 * is not Roku's XML, and both are treated the same way: not a television.
 */
export async function discoverRokus(options: DiscoveryOptions): Promise<Device[]> {
  const transport = createFetchTransport();
  const hosts = subnetHosts(options.localAddress);

  return scanSubnet(
    hosts,
    async (host, signal) => {
      const xml = await transport.get(`http://${host}:${ECP_PORT}/query/device-info`, signal);
      // Confirm it is actually a Roku rather than something that returned 200.
      if (!xml.includes('<device-info>')) return undefined;
      const name = /<friendly-device-name>([^<]*)<\/friendly-device-name>/.exec(xml)?.[1];
      return {
        id: `roku:${host}`,
        adapter: 'roku',
        name: name?.trim() || `Roku (${host})`,
        address: host,
      } satisfies Device;
    },
    options,
  );
}

/**
 * A device adapter that needs no discovery of its own.
 *
 * `RokuAdapter` expects a transport that can do SSDP. Here discovery is the scanner's
 * job, so the transport reports no devices and `discoverRokus` supplies them instead.
 */
export function createDirectRokuAdapter(): {
  send(device: Device, command: Command, signal?: AbortSignal): Promise<void>;
  getPlayback(device: Device, signal?: AbortSignal): Promise<Playback | undefined>;
} {
  const adapter = new RokuAdapter({
    ...createFetchTransport(),
    discover: async () => [],
  });
  return {
    send: (device, command, signal) => adapter.send(device, command, signal),
    getPlayback: (device, signal) => adapter.getPlayback(device, signal),
  };
}
