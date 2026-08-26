import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { relayConnectionUrl } from '@reviewies/core/devices/relayUrl';
import { parseConnectionParams, Relay, type Peer } from './relay.ts';

/**
 * The app and the bridge, dialling a running relay.
 *
 * Everything else in this package is unit-level: `Relay` pairs peers that are handed to
 * it, and `parseConnectionParams` reads a URL it is given. Both were correct, and the
 * connection they describe had never been made — the app opened `new WebSocket(url)` with
 * a bare address and the bridge did the same, so every real connection was closed with
 * 1008 before either side sent anything. Nothing dialled the server, so nothing knew.
 * §6.43.
 *
 * The address is built here by the same helper the two clients now use, so this fails if
 * either the relay's expectations or the clients' URLs move. That is the whole point: the
 * bug was not in either half.
 */
const TOKEN = 'a-token-long-enough-to-be-valid';

let server: Server;
let base: string;

beforeAll(async () => {
  const relay = new Relay();
  server = createServer();
  const wss = new WebSocketServer({ server });

  // The same wiring as `server.ts`, kept to the part under test: parse the URL, join,
  // forward, and tell a sender when there is nobody to forward to.
  wss.on('connection', (socket, req) => {
    const params = parseConnectionParams(req.url ?? '');
    if ('error' in params) {
      socket.close(1008, params.error);
      return;
    }
    const peer: Peer = {
      id: randomUUID(),
      role: params.role,
      token: params.token,
      send: (data) => socket.readyState === socket.OPEN && void socket.send(data),
      close: (reason) => socket.close(1000, reason),
    };
    relay.join(peer);
    socket.on('message', (raw) => {
      if (!relay.forward(peer, raw.toString())) {
        peer.send(JSON.stringify({ type: 'error', code: 'no-peer' }));
      }
    });
    socket.on('close', () => relay.leave(peer));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `ws://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
});

/**
 * Open a socket and report whether it survived.
 *
 * A rejected connection still *opens*: the relay closes it after the WebSocket handshake
 * has completed, so the client sees `open` and then `close`, in that order. Resolving on
 * `open` would call every refusal a success, which is exactly the mistake the code under
 * test made — so this waits out a grace period before deciding.
 */
function dial(url: string): Promise<{ socket: WebSocket; closed?: { code: number; reason: string } }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled: { code: number; reason: string } | undefined;
    const timer = setTimeout(() => reject(new Error('neither opened nor closed')), 5000);

    socket.on('open', () => {
      setTimeout(() => {
        clearTimeout(timer);
        resolve({ socket, closed: settled });
      }, 300);
    });
    socket.on('close', (code, reason) => {
      settled = { code, reason: reason.toString() };
      clearTimeout(timer);
      resolve({ socket, closed: settled });
    });
    socket.on('error', () => {});
  });
}

const nextMessage = (socket: WebSocket) =>
  new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no message within 5s')), 5000);
    socket.once('message', (raw) => {
      clearTimeout(timer);
      resolve(raw.toString());
    });
  });

describe('dialling the relay', () => {
  it('refuses a bare URL, which is what both clients used to send', async () => {
    const { closed } = await dial(base);
    expect(closed?.code).toBe(1008);
    expect(closed?.reason).toMatch(/role/);
  });

  it('accepts the address the clients build', async () => {
    const { socket, closed } = await dial(relayConnectionUrl(base, 'app', TOKEN));
    expect(closed).toBeUndefined();
    socket.close();
  });

  it('carries a command from the app to the bridge', async () => {
    const app = await dial(relayConnectionUrl(base, 'app', TOKEN));
    const bridge = await dial(relayConnectionUrl(base, 'bridge', TOKEN));
    expect(app.closed).toBeUndefined();
    expect(bridge.closed).toBeUndefined();

    const arriving = nextMessage(bridge.socket);
    app.socket.send(JSON.stringify({ type: 'command', deviceId: 'roku:1', command: 'pause' }));

    expect(JSON.parse(await arriving)).toEqual({
      type: 'command',
      deviceId: 'roku:1',
      command: 'pause',
    });
    app.socket.close();
    bridge.socket.close();
  });

  it('answers back rather than swallowing a command with no bridge on the other side', async () => {
    const app = await dial(relayConnectionUrl(base, 'app', `${TOKEN}-lonely`));
    const reply = nextMessage(app.socket);
    app.socket.send(JSON.stringify({ type: 'command', command: 'pause' }));

    expect(JSON.parse(await reply).code).toBe('no-peer');
    app.socket.close();
  });

  it('does not pair two clients holding different tokens', async () => {
    const app = await dial(relayConnectionUrl(base, 'app', `${TOKEN}-one`));
    const bridge = await dial(relayConnectionUrl(base, 'bridge', `${TOKEN}-two`));

    const reply = nextMessage(app.socket);
    app.socket.send(JSON.stringify({ type: 'command', command: 'pause' }));
    // The app is told it is alone, and the other bridge hears nothing at all.
    expect(JSON.parse(await reply).code).toBe('no-peer');

    app.socket.close();
    bridge.socket.close();
  });
});
