import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverRokus } from './direct';

/**
 * Discovery is the part with the interesting failure modes: almost every address
 * refuses the connection, and one or two answer with something that is not a Roku.
 */

const DEVICE_INFO = `<?xml version="1.0"?>
<device-info>
  <udn>29380007-0800-1025-80a4-bcd0554d3f00</udn>
  <serial-number>X00000ABCDEF</serial-number>
  <friendly-device-name>Living Room TV</friendly-device-name>
  <model-name>Roku Streaming Stick</model-name>
</device-info>`;

function mockNetwork(responses: Record<string, string | number>) {
  vi.stubGlobal('fetch', async (url: string) => {
    const host = new URL(url).hostname;
    const answer = responses[host];
    if (answer === undefined) throw new Error('ECONNREFUSED');
    if (typeof answer === 'number') return { ok: false, status: answer } as Response;
    return { ok: true, status: 200, text: async () => answer } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('finding a Roku on the subnet', () => {
  it('finds the one address that answers', async () => {
    mockNetwork({ '192.168.1.50': DEVICE_INFO });
    const found = await discoverRokus({ localAddress: '192.168.1.42', timeoutMs: 50 });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: 'roku:192.168.1.50',
      adapter: 'roku',
      name: 'Living Room TV',
      address: '192.168.1.50',
    });
  });

  it('ignores something that answers but is not a Roku', async () => {
    // A printer, a router's admin page, a NAS — plenty of things return 200 on a
    // port scan, and calling one of them a television would be worse than finding
    // nothing.
    mockNetwork({ '192.168.1.50': '<html>router admin</html>' });
    expect(await discoverRokus({ localAddress: '192.168.1.42', timeoutMs: 50 })).toEqual([]);
  });

  it('ignores an error response', async () => {
    mockNetwork({ '192.168.1.50': 403 });
    expect(await discoverRokus({ localAddress: '192.168.1.42', timeoutMs: 50 })).toEqual([]);
  });

  it('falls back to the address when the device has no name', async () => {
    mockNetwork({ '192.168.1.50': DEVICE_INFO.replace(/<friendly-device-name>[^<]*<\/friendly-device-name>/, '') });
    const [device] = await discoverRokus({ localAddress: '192.168.1.42', timeoutMs: 50 });
    expect(device.name).toBe('Roku (192.168.1.50)');
  });

  it('finds more than one', async () => {
    mockNetwork({ '192.168.1.50': DEVICE_INFO, '192.168.1.77': DEVICE_INFO });
    const found = await discoverRokus({ localAddress: '192.168.1.42', timeoutMs: 50 });
    expect(found.map((d) => d.address).sort()).toEqual(['192.168.1.50', '192.168.1.77']);
  });

  it('returns nothing on an empty network rather than throwing', async () => {
    mockNetwork({});
    expect(await discoverRokus({ localAddress: '192.168.1.42', timeoutMs: 50 })).toEqual([]);
  });

  it('does not scan at all when there is no usable local address', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await discoverRokus({ localAddress: '127.0.0.1', timeoutMs: 50 })).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
