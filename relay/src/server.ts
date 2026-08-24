import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseConnectionParams, Relay, type Peer } from './relay.ts';

/**
 * Bridge relay.
 *
 * Pairs an app session with a bridge by shared token and forwards bytes between
 * them. It never inspects commands and stores nothing, so a compromised relay leaks
 * no history — the worst it could do is drop or replay remote-control traffic, which
 * is why the token is the only credential it needs.
 *
 *   PORT=8787 node src/server.js
 */

const PORT = Number(process.env.PORT ?? 8787);
const MAX_MESSAGE_BYTES = 64 * 1024;

const relay = new Relay();
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: relay.roomCount }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (socket: WebSocket, req) => {
  const params = parseConnectionParams(req.url ?? '');

  if ('error' in params) {
    socket.close(1008, params.error);
    return;
  }

  const peer: Peer = {
    id: randomUUID(),
    role: params.role,
    token: params.token,
    send: (data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    },
    close: (reason) => socket.close(1000, reason),
  };

  relay.join(peer);

  socket.on('message', (raw) => {
    const data = raw.toString();
    if (data.length > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'message too large');
      return;
    }

    if (!relay.forward(peer, data)) {
      // Tell the sender rather than letting the message vanish — the app needs to
      // know the bridge is not there so it can say so.
      peer.send(JSON.stringify({ type: 'error', message: 'Other side not connected', code: 'no-peer' }));
    }
  });

  socket.on('close', () => relay.leave(peer));
  socket.on('error', () => relay.leave(peer));

  // Drop connections that stop responding, so a half-open socket does not hold a
  // room slot forever.
  let alive = true;
  socket.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, 30_000);
  socket.on('close', () => clearInterval(heartbeat));
});

server.listen(PORT, () => {
  console.log(`Relay listening on :${PORT}`);
});
