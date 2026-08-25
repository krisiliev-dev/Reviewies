# Reviewies relay

Pairs an app session with a bridge by shared token and forwards bytes between them.

## Why it exists

The bridge dials **outbound** to this relay rather than the app finding it on the LAN.
That inversion is what makes the remote work from a browser: no mixed-content blocking,
no mDNS a page cannot do, no port forwarding, and it works off-network unchanged.

## Does this still have a job, now the app talks to a television directly?

Yes, for laptops — and only for laptops, which is a narrower job than it was built for.

The phone reaches a Roku over the LAN by itself now: ECP is plain HTTP on port 8060, so
there is nothing to relay. That was the original reason this existed and it is gone.

What has not changed is a laptop. Controlling media playing on a computer means MPRIS,
which is a D-Bus interface — a local IPC bus with no network protocol at all. There is
nothing on the other end for an app to connect to, with or without a local-network
entitlement, so something has to run on that machine and dial out. That is the bridge,
and this is what it dials.

So the relay was not made redundant by going app-first; it was made *specific*. Research
doc 9 §4 predicted it would be deleted once the television case went direct. The
television case did go direct, and the prediction was still wrong, because it assumed
televisions were the only thing worth controlling.

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
