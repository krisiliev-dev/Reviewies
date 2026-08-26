# Reviewies bridge

A small companion process that gives Reviewies the two things a browser cannot do:
**discover devices on your network** and **speak their control protocols**.

## Why this exists

There is no single protocol that reaches every device. Matter Casting was the only
vendor-neutral candidate and both Apple and Google declined to adopt it, so every
"universal remote" is a set of per-vendor adapters behind one UI. This is too.

What keeps that tolerable is confinement: the app only ever sees `listDevices`,
`sendCommand` and `getPosition`. Adding a device type is one new adapter here, with no
app change.

The bridge **dials outbound** to a relay rather than the app finding it on the LAN.
That inversion is what makes it work from a PWA at all — no mixed-content blocking, no
mDNS the browser cannot do, no port forwarding, and it works off-network unchanged.
Nothing listens on a port, so there is no inbound attack surface.

## Running it

```bash
cd bridge
npm install
REVIEWIES_RELAY=wss://your-relay REVIEWIES_TOKEN=your-token node src/index.ts
```

Without `REVIEWIES_TOKEN` it prints a generated one to pair with.

## Adapters

| Adapter | Devices | Position? |
|---|---|---|
| **Roku** (ECP) | Roku TVs and sticks | ✅ via `/query/media-player` |
| **MPRIS** (D-Bus) | The Linux machine the bridge runs on | ✅ exact |

Roku is first because its protocol is the simplest in the category — plain HTTP on
port 8060, no auth, no pairing — *and* it reports playback position, which most
alternatives do not.

**Control and position are separate problems.** A device can accept commands while
telling you nothing about what is playing; Netflix inside a smart-TV app is the common
case. `getPlayback` returning undefined is normal, not a failure.

### The best case: watching on this machine

When you watch on the same computer the bridge runs on, MPRIS reports title *and*
exact position with no network protocol involved. Watching Mode syncs perfectly and no
extra hardware exists. These are the same controls your OS shows in its own media
widget — they are programmable, they just need a process rather than a browser tab.

Windows (`GlobalSystemMediaTransportControls`) and macOS (MediaRemote) expose
equivalent data and slot in behind the same interface. Only the Linux/MPRIS
implementation is written so far, because it is the one that could be exercised here.

## Safety

- The command vocabulary is an **explicit allow-list**. Anything unrecognised is
  refused rather than passed through — this process can drive your television.
- The pairing token is compared without leaking its length or prefix through timing.
- A bad token closes the socket rather than replying.

## Tests

```bash
cd bridge
npm test
npm run typecheck      # tsc --noEmit; there is no build step to catch it otherwise
```

The suite covers ECP XML parsing (playing, paused, buffering, no position, malformed
input), SSDP deduplication and malformed headers, adapter error handling when a device
is unreachable, MPRIS unit conversion and the music filter, protocol validation
including rejected commands and version mismatch, and token comparison.

## Not yet verified

The adapters are tested against captured protocol responses, not live hardware. ECP
and MPRIS are both stable, well-documented protocols, but no real Roku or desktop
player has been driven by this code. The relay server itself is not written — the
bridge speaks the protocol, and the endpoint it dials is left to deployment.
