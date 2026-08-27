import { describe, expect, it } from 'vitest';
import { subnetHosts } from '@reviewies/core/devices/scan';
import { scanFailure } from './scanFailure';

/**
 * The remote's empty-handed message, which was the same for two different failures.
 *
 * Found on a real iPhone: "Scan Wi-Fi" failed instantly, no progress, and the app never
 * appeared under Settings → Privacy & Security → Local Network — meaning iOS was never
 * asked, because nothing ever tried to connect. `subnetHosts` had refused the address
 * and `discoverRokus` had nothing to probe. The screen reported that as "Nothing found.
 * The TV has to be on the same Wi-Fi, and awake."
 *
 * Nobody could act on that. It names a television that was never contacted, and the one
 * fact that would have explained it — the address the phone thinks it has — was on the
 * device and in no message. 6.84.
 */
describe('what the remote says when it finds nothing', () => {
  /** The addresses `subnetHosts` refuses, and therefore the ones with nothing to scan. */
  const NOTHING_TO_SCAN = ['127.0.0.1', '169.254.14.9', '::1', 'fe80::1c2b', '', '   '];

  it('agrees with the scanner about which addresses have no subnet', () => {
    // Otherwise this file tests a rule the scanner does not follow.
    for (const address of NOTHING_TO_SCAN) {
      expect(subnetHosts(address), `${address} should yield no hosts`).toEqual([]);
    }
    expect(subnetHosts('192.168.0.70').length).toBe(253);
  });

  it('does not blame the television for a scan that never happened', () => {
    for (const address of NOTHING_TO_SCAN) {
      const message = scanFailure(address, subnetHosts(address).length);
      expect(message, `${address} still blames the TV`).not.toMatch(/\bTV\b|asleep|deep sleep/i);
    }
  });

  it('names the address, because that is the whole diagnosis', () => {
    expect(scanFailure('127.0.0.1', 0)).toContain('"127.0.0.1"');
    expect(scanFailure('fe80::1c2b', 0)).toContain('"fe80::1c2b"');
  });

  it('says so plainly when there was no address at all', () => {
    // `getIpAddressAsync` returning empty is not the same as returning a useless
    // address, and quoting `""` at somebody explains nothing.
    expect(scanFailure('', 0)).toContain('nothing at all');
    expect(scanFailure('   ', 0)).toContain('nothing at all');
  });

  it('points at Local Network access, which is what was actually missing', () => {
    expect(scanFailure('127.0.0.1', 0)).toMatch(/Local Network/i);
  });

  /**
   * The other half. A real subnet that answered nothing *is* the television's problem,
   * and the original message was right about it — this keeps it.
   */
  it('still blames the television when it really did ask', () => {
    const message = scanFailure('192.168.0.70', subnetHosts('192.168.0.70').length);
    expect(message).toMatch(/deep sleep/);
    expect(message).not.toMatch(/Local Network/i);
  });
});

/**
 * The case that actually happened, which the first version of this message did not name.
 *
 * `169.254.227.90` on a phone whose Wi-Fi was on and working. `expo-network` walks every
 * interface beginning with `en` and keeps the last one's address; a USB cable to a Mac
 * adds one, later in the list, with a self-assigned address because nothing serves DHCP
 * over a cable. `scripts/patch-expo-network.mjs` fixes the reading. This is what the
 * screen says while it is still true — a lease can go missing without any cable. 6.84.
 */
describe('a self-assigned address, which is what a USB cable looks like', () => {
  const LINK_LOCAL = '169.254.227.90';

  it('says the cable is a network too, rather than talking about permissions', () => {
    const message = scanFailure(LINK_LOCAL, 0);
    expect(message).toMatch(/unplug/i);
    expect(message).toContain(`"${LINK_LOCAL}"`);
  });

  it('does not send someone to a Settings switch that would not have helped', () => {
    // Local Network access was never the problem here: nothing had been probed, so iOS
    // had never been asked. Naming it would have sent somebody to a list the app was
    // not in, to look for a switch that does not exist yet.
    expect(scanFailure(LINK_LOCAL, 0)).not.toMatch(/Local Network/i);
  });

  it('still offers the other cause, since a lease can go missing without a cable', () => {
    expect(scanFailure(LINK_LOCAL, 0)).toMatch(/Wi-Fi/i);
  });

  it('keeps the permissions wording for addresses that are not self-assigned', () => {
    expect(scanFailure('127.0.0.1', 0)).toMatch(/Local Network/i);
    expect(scanFailure('127.0.0.1', 0)).not.toMatch(/unplug/i);
  });
});
