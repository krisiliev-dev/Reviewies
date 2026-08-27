/**
 * Why a scan came back empty, which is two situations and was one message.
 *
 * `subnetHosts` refuses loopback, link-local and anything that is not four octets,
 * because none of them is a LAN worth probing. When it refuses, `discoverRokus` has
 * nothing to ask and returns an empty list — indistinguishable, from the screen's point
 * of view, from having asked 253 addresses and been told no by all of them.
 *
 * The screen said "the TV has to be on the same Wi-Fi, and awake" for both. On a real
 * iPhone the first one happened: instant failure, no progress, and the app never
 * appeared under Settings → Privacy & Security → Local Network, which means iOS was
 * never asked, which means nothing ever tried to connect. The message sent somebody to
 * go and look at their television. That is §6.57's distinction — unconfigured against
 * configured and failing — collapsed into the more reassuring of the two. 6.84.
 *
 * It lives apart from `useRemote` so it can be tested: importing the hook pulls in
 * react-native, whose Flow syntax vitest cannot parse, which is the reason the remote
 * had no tests on this side at all.
 */
export function scanFailure(localAddress: string, hostCount: number): string {
  if (hostCount > 0) {
    return (
      'Nothing found. The TV has to be on the same Wi-Fi, and awake — a Roku ' +
      'in deep sleep does not answer.'
    );
  }

  // Named, because it is the whole diagnosis: whatever `getIpAddressAsync` returned is
  // the reason there was nowhere to look, and nobody can guess it from the screen.
  const address = localAddress.trim();
  const reported = address ? `"${address}"` : 'nothing at all';

  // A self-assigned address means the interface came up and nothing gave it a lease.
  // The cause seen in practice is a USB cable to a Mac, which iOS presents as another
  // `en` interface — and which is exactly the state a phone is in while being
  // developed against, so this is the message a developer will meet first.
  if (/^169\.254\./.test(address)) {
    return (
      `No network to scan. This device reports its own address as ${reported}, which is ` +
      'a self-assigned one — the interface is up but nothing handed it a lease. If the ' +
      'phone is plugged into a computer, unplug it: that cable is a network too, and it ' +
      'is the one being read. Otherwise the Wi-Fi has associated without getting an ' +
      'address, and reconnecting to it will fix that.'
    );
  }

  return (
    `No network to scan. This device reports its own address as ${reported}, which is ` +
    'not an address on a local network, so there was nowhere to look. Check Wi-Fi is ' +
    'on — and that Reviewies has Local Network access under Settings, Privacy & Security.'
  );
}
