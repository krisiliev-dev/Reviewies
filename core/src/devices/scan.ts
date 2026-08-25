/**
 * Find devices by probing the local subnet over HTTP.
 *
 * The obvious way to find a Roku is SSDP: a UDP multicast to 239.255.255.250. That
 * needs a raw socket, which on a phone needs a native module, which needs a custom
 * development build — so the feature would not work in Expo Go and would not work at
 * all on the web.
 *
 * Roku's ECP is plain HTTP on port 8060. So instead of asking the network who is
 * there, ask every address on it directly. A /24 is 254 requests that either answer
 * in milliseconds or fail on connect, and both outcomes are fast.
 *
 * The honest trade-offs, because this is not strictly better than SSDP:
 *
 *  - Only /24 subnets. Nearly every home network is one; a /16 would be 65,000 probes
 *    and is refused rather than attempted slowly.
 *  - It finds devices that answer on a known port, not devices that announce
 *    themselves. Adding a vendor means adding a probe, which SSDP would not need.
 *  - It is noisier: 254 connection attempts show up in a router's logs.
 *
 * What it buys is that it works today, in Expo Go, with no native module — and every
 * adapter behind it is the same one the bridge already uses.
 */

/** Candidate addresses on the same /24 as `address`, excluding the device itself. */
export function subnetHosts(address: string): string[] {
  const parts = address.trim().split('.');
  if (parts.length !== 4) return [];

  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return [];

  // Loopback and link-local mean we are not on a LAN worth scanning.
  if (octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)) return [];

  const prefix = octets.slice(0, 3).join('.');
  const hosts: string[] = [];
  for (let last = 1; last <= 254; last++) {
    if (last === octets[3]) continue;
    hosts.push(`${prefix}.${last}`);
  }
  return hosts;
}

export interface ProbeOptions {
  /** Per-host budget. Short on purpose: a device that is there answers at once. */
  timeoutMs?: number;
  /** How many probes are in flight together. */
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Probe every host on the subnet, returning those the probe accepted.
 *
 * Bounded concurrency rather than one big `Promise.all`: 254 simultaneous connections
 * is enough to make some phones and routers drop traffic, and a scan that misses the
 * television because it flooded the network is worse than one that takes four seconds.
 */
export async function scanSubnet<T>(
  hosts: string[],
  probe: (host: string, signal: AbortSignal) => Promise<T | undefined>,
  options: ProbeOptions = {},
): Promise<T[]> {
  const { timeoutMs = 1200, concurrency = 24, signal, onProgress } = options;

  const found: T[] = [];
  let index = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (index < hosts.length) {
      if (signal?.aborted) return;
      const host = hosts[index++];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onOuterAbort = () => controller.abort();
      signal?.addEventListener('abort', onOuterAbort);

      try {
        const result = await probe(host, controller.signal);
        if (result !== undefined) found.push(result);
      } catch {
        // Nothing there. This is the expected outcome for 253 of 254 addresses, so
        // it must be silent rather than logged.
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onOuterAbort);
        onProgress?.(++done, hosts.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  return found;
}
