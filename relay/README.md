# Reviewies relay

Pairs an app session with a bridge by shared token and forwards bytes between them.

## Why it exists

The bridge dials **outbound** to this relay rather than the app finding it on the LAN.
That inversion is what makes the remote work from a PWA: no mixed-content blocking, no
mDNS the browser cannot do, no port forwarding, and it works off-network unchanged.

## Deliberately dumb

The relay never inspects commands and stores nothing. A compromised relay leaks no
watch history — the worst it could do is drop or replay remote-control traffic. That is
why the token is the only credential it needs, and why the token has to be long.

## Running it

```bash
cd relay
npm install
PORT=8787 npm start
```

`GET /health` reports `{ ok, rooms }`.

Connections are `wss://host/?role=app|bridge&token=<token>`. Tokens must be at least
20 url-safe characters; anything shorter is refused at the handshake.

Point the app at it with `VITE_BRIDGE_RELAY` and `VITE_BRIDGE_TOKEN`, and the bridge
with `REVIEWIES_RELAY` and `REVIEWIES_TOKEN`. Use the same token for both.

## Behaviour worth knowing

- **A reconnecting peer replaces the old one** and the stale socket is closed.
  Reconnecting after a drop is the common case, and leaving a stale peer in place would
  silently swallow every message.
- **A late close from a replaced socket cannot evict the newer peer.**
- **Undeliverable messages are reported**, not dropped silently, so the app can say
  "your bridge is offline" rather than appearing to work.
- **Half-open sockets are terminated** by a 30-second heartbeat, so they cannot hold a
  room slot forever.

## Tests

```bash
npm test
```

19 tests over pairing, reconnection and token validation — including that traffic never
crosses between tokens, which is the property that matters most.

Verified end to end with real WebSockets: bidirectional forwarding, cross-token
isolation, and short tokens refused at the handshake.
