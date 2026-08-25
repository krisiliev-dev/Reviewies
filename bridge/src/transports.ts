import { createSocket } from 'node:dgram';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RokuTransport } from '@reviewies/core/devices/roku';
import type { MprisPlayer, MprisTransport } from './mpris';

const run = promisify(execFile);

/**
 * Real transports.
 *
 * These are the capabilities a browser does not have — UDP multicast for discovery,
 * plain HTTP to a private address, D-Bus to the local session — and having them is
 * the entire reason a small local process exists rather than doing this in the app.
 */

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;

export const nodeRokuTransport: RokuTransport = {
  async get(url, signal) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  async post(url, signal) {
    const res = await fetch(url, { method: 'POST', signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },

  discover(timeoutMs) {
    return new Promise((resolve) => {
      const responses: string[] = [];
      const socket = createSocket({ type: 'udp4', reuseAddr: true });

      socket.on('message', (msg) => responses.push(msg.toString()));
      socket.on('error', () => {
        socket.close();
        resolve(responses);
      });

      socket.bind(() => {
        const query = [
          'M-SEARCH * HTTP/1.1',
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
          'MAN: "ssdp:discover"',
          'ST: roku:ecp',
          'MX: 2',
          '',
          '',
        ].join('\r\n');
        socket.send(query, SSDP_PORT, SSDP_ADDRESS);
      });

      setTimeout(() => {
        try {
          socket.close();
        } catch {
          /* already closed */
        }
        resolve(responses);
      }, timeoutMs);
    });
  },
};

/**
 * MPRIS over the `busctl`/`gdbus` command line rather than a D-Bus binding.
 *
 * Keeps the bridge dependency-free and installable as a plain Node script. A native
 * binding would be faster, but this polls once a second at most.
 */
async function gdbus(args: string[]): Promise<string> {
  const { stdout } = await run('gdbus', args, { timeout: 3000 });
  return stdout;
}

function parseVariant(raw: string): unknown {
  // gdbus prints GVariant text, e.g. (<int64 754000000>,)
  const int = /int64\s+(-?\d+)/.exec(raw)?.[1];
  if (int) return Number(int);
  const str = /'([^']*)'/.exec(raw)?.[1];
  return str;
}

export const gdbusMprisTransport: MprisTransport = {
  async listPlayers() {
    const stdout = await gdbus(['call', '--session', '--dest', 'org.freedesktop.DBus',
      '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.ListNames']);
    return [...stdout.matchAll(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g)].map((m) => m[1]);
  },

  async read(busName): Promise<MprisPlayer | undefined> {
    const prop = async (name: string) =>
      gdbus([
        'call', '--session', '--dest', busName,
        '--object-path', '/org/mpris/MediaPlayer2',
        '--method', 'org.freedesktop.DBus.Properties.Get',
        'org.mpris.MediaPlayer2.Player', name,
      ]).catch(() => '');

    const [statusRaw, positionRaw, metadataRaw] = await Promise.all([
      prop('PlaybackStatus'),
      prop('Position'),
      prop('Metadata'),
    ]);

    const metadata: Record<string, unknown> = {};
    const title = /'xesam:title':\s*<'([^']*)'>/.exec(metadataRaw)?.[1];
    const length = /'mpris:length':\s*<(?:int64|uint64)\s+(\d+)>/.exec(metadataRaw)?.[1];
    if (title) metadata['xesam:title'] = title;
    if (length) metadata['mpris:length'] = Number(length);

    return {
      busName,
      status: typeof parseVariant(statusRaw) === 'string' ? String(parseVariant(statusRaw)) : undefined,
      positionUs: typeof parseVariant(positionRaw) === 'number' ? Number(parseVariant(positionRaw)) : undefined,
      metadata,
    };
  },

  async call(busName, method) {
    await gdbus([
      'call', '--session', '--dest', busName,
      '--object-path', '/org/mpris/MediaPlayer2',
      '--method', `org.mpris.MediaPlayer2.Player.${method}`,
    ]);
  },

  async seek(busName, offsetUs) {
    await gdbus([
      'call', '--session', '--dest', busName,
      '--object-path', '/org/mpris/MediaPlayer2',
      '--method', 'org.mpris.MediaPlayer2.Player.Seek',
      String(offsetUs),
    ]);
  },
};
