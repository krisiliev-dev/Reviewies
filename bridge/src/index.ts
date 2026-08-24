import { randomBytes } from 'node:crypto';
import { RokuAdapter } from './roku';
import { MprisAdapter } from './mpris';
import { gdbusMprisTransport, nodeRokuTransport } from './transports';
import { parseClientMessage, PROTOCOL_VERSION, tokensMatch, type BridgeMessage } from './protocol';
import type { Device, DeviceAdapter } from './types';

/**
 * Reviewies bridge.
 *
 * Dials outbound to a relay and waits to be told what to do. Nothing listens on a
 * port, so there is no inbound attack surface and no router configuration.
 *
 *   REVIEWIES_RELAY=wss://relay.example/bridge REVIEWIES_TOKEN=... node src/index.js
 */

const RELAY = process.env.REVIEWIES_RELAY;
const TOKEN = process.env.REVIEWIES_TOKEN ?? randomBytes(16).toString('hex');
const POLL_MS = 1000;

const adapters: DeviceAdapter[] = [
  new RokuAdapter(nodeRokuTransport),
  new MprisAdapter(gdbusMprisTransport),
];

let devices: Device[] = [];
let subscribed: string | undefined;
let pollTimer: NodeJS.Timeout | undefined;

async function refreshDevices(): Promise<Device[]> {
  const found = await Promise.all(
    // One failing adapter must not empty the whole list.
    adapters.map((a) => a.discover().catch(() => [] as Device[])),
  );
  devices = found.flat();
  return devices;
}

function adapterFor(device: Device): DeviceAdapter | undefined {
  return adapters.find((a) => a.name === device.adapter);
}

async function connect(): Promise<void> {
  if (!RELAY) {
    console.error('Set REVIEWIES_RELAY to the relay WebSocket URL.');
    process.exit(2);
  }

  const socket = new WebSocket(RELAY);
  const send = (message: BridgeMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  socket.addEventListener('open', () => {
    console.log('Connected to relay.');
    send({ type: 'welcome', version: PROTOCOL_VERSION, bridgeName: 'reviewies-bridge' });
    void refreshDevices().then((found) => {
      console.log(`Found ${found.length} device(s).`);
      send({ type: 'devices', devices: found });
    });
  });

  socket.addEventListener('message', async (event) => {
    const parsed = parseClientMessage(String(event.data));
    if ('error' in parsed) {
      send({ type: 'error', message: parsed.error });
      return;
    }

    switch (parsed.type) {
      case 'hello':
        // The token is the only thing between a relay connection and someone's
        // television, so a mismatch closes the socket rather than replying.
        if (!tokensMatch(parsed.token, TOKEN)) {
          send({ type: 'error', message: 'Bad token', code: 'unauthorised' });
          socket.close();
          return;
        }
        send({ type: 'welcome', version: PROTOCOL_VERSION, bridgeName: 'reviewies-bridge' });
        return;

      case 'listDevices':
        send({ type: 'devices', devices: await refreshDevices() });
        return;

      case 'command': {
        const device = devices.find((d) => d.id === parsed.deviceId);
        const adapter = device && adapterFor(device);
        if (!device || !adapter) {
          send({ type: 'error', message: 'Unknown device', code: 'no-device' });
          return;
        }
        try {
          await adapter.send(device, parsed.command);
        } catch (err) {
          send({
            type: 'error',
            message: err instanceof Error ? err.message : 'Command failed',
            code: 'send-failed',
          });
        }
        return;
      }

      case 'subscribe':
        subscribed = parsed.deviceId;
        return;

      case 'unsubscribe':
        subscribed = undefined;
        return;
    }
  });

  socket.addEventListener('close', () => {
    console.log('Relay disconnected; retrying in 5s.');
    // The bridge is meant to run unattended, so it reconnects rather than exiting.
    setTimeout(() => void connect(), 5000);
  });

  socket.addEventListener('error', () => {
    /* close fires next and handles the retry. */
  });

  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!subscribed) return;
    const device = devices.find((d) => d.id === subscribed);
    const adapter = device && adapterFor(device);
    if (!device || !adapter) return;

    const playback = await adapter.getPlayback(device).catch(() => undefined);
    if (playback) send({ type: 'playback', deviceId: device.id, playback, at: Date.now() });
    else send({ type: 'playbackEnded', deviceId: device.id, at: Date.now() });
  }, POLL_MS);
}

if (!process.env.REVIEWIES_TOKEN) {
  console.log(`No REVIEWIES_TOKEN set. Pair with this token:\n\n  ${TOKEN}\n`);
}
void connect();
