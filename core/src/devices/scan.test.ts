import { describe, expect, it, vi } from 'vitest';
import { scanSubnet, subnetHosts } from './scan.ts';

describe('working out which addresses to probe', () => {
  it('covers the rest of the /24', () => {
    const hosts = subnetHosts('192.168.1.42');
    expect(hosts).toHaveLength(253);
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts.at(-1)).toBe('192.168.1.254');
  });

  it('skips our own address, which cannot be the television', () => {
    expect(subnetHosts('192.168.1.42')).not.toContain('192.168.1.42');
  });

  it('refuses loopback', () => {
    expect(subnetHosts('127.0.0.1')).toEqual([]);
  });

  it('refuses link-local, which means no DHCP rather than a LAN', () => {
    // 169.254.x.x is what a device gives itself when nothing answered. Scanning it
    // finds nothing, slowly.
    expect(subnetHosts('169.254.10.1')).toEqual([]);
  });

  it('refuses anything that is not an address', () => {
    expect(subnetHosts('not-an-ip')).toEqual([]);
    expect(subnetHosts('192.168.1')).toEqual([]);
    expect(subnetHosts('192.168.1.999')).toEqual([]);
    expect(subnetHosts('')).toEqual([]);
  });
});

describe('scanning', () => {
  it('returns only the hosts that answered', async () => {
    const found = await scanSubnet(
      ['a', 'b', 'c'],
      async (host) => (host === 'b' ? { host } : undefined),
      { concurrency: 2 },
    );
    expect(found).toEqual([{ host: 'b' }]);
  });

  it('treats a failed probe as an empty address, not an error', async () => {
    // 253 of 254 addresses fail. If that propagated, no scan would ever finish.
    const found = await scanSubnet(['a', 'b'], async (host) => {
      if (host === 'a') throw new Error('ECONNREFUSED');
      return { host };
    });
    expect(found).toEqual([{ host: 'b' }]);
  });

  it('never has more than the configured number of probes in flight', async () => {
    // Flooding a router hard enough to drop the television's reply would make the
    // scan worse the faster it went.
    let inFlight = 0;
    let peak = 0;
    await scanSubnet(
      Array.from({ length: 40 }, (_, i) => String(i)),
      async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return undefined;
      },
      { concurrency: 5 },
    );
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('gives every probe a deadline', async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    const scan = scanSubnet(
      ['a'],
      (_host, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted();
            reject(new Error('aborted'));
          });
        }),
      { timeoutMs: 500 },
    );
    await vi.advanceTimersByTimeAsync(600);
    await scan;
    expect(aborted).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('stops when the caller gives up', async () => {
    const controller = new AbortController();
    const probed: string[] = [];
    const scan = scanSubnet(
      Array.from({ length: 50 }, (_, i) => String(i)),
      async (host) => {
        probed.push(host);
        if (probed.length === 3) controller.abort();
        return undefined;
      },
      { concurrency: 1, signal: controller.signal },
    );
    await scan;
    expect(probed.length).toBeLessThan(50);
  });

  it('reports progress, because a blank screen for four seconds reads as broken', async () => {
    const seen: Array<[number, number]> = [];
    await scanSubnet(['a', 'b'], async () => undefined, {
      concurrency: 1,
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
