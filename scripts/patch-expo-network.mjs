/**
 * Make `getIpAddressAsync()` return the Wi-Fi address rather than the last `en*` one.
 *
 * `expo-network`'s iOS implementation walks every interface and keeps the address of
 * any whose name begins with `en`, with no `break` and no preference:
 *
 *   if name.starts(with: "en") {
 *     ...
 *     address = String(cString: hostname)   // last one wins
 *   }
 *
 * On iOS `en0` is Wi-Fi. Plugging the phone into a Mac adds a USB-ethernet interface
 * that also starts with `en`, comes later in the list, and carries a self-assigned
 * `169.254.x.x` because nothing serves DHCP on a USB cable. So a tethered phone reports
 * the cable's address as its own.
 *
 * That broke the remote in a way that pointed nowhere near the cause: `subnetHosts`
 * correctly refuses a link-local address, so nothing was ever probed, so iOS never
 * raised the local-network prompt, so the app never even appeared in Settings. Observed
 * on a real iPhone: `169.254.227.90` while on Wi-Fi, and a working scan the moment the
 * cable came out. 6.84.
 *
 * Restricting to `en0` loses nothing this ever had: cellular is `pdp_ip0`, which the
 * loop never matched either way.
 *
 * Exact-match on purpose. If upstream rewrites this loop the pattern stops matching and
 * `scanFailure.test.ts`'s companion guard says the patch has stopped applying, rather
 * than this silently editing something it no longer understands.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);

const BROKEN = 'if name.starts(with: "en") {';
const FIXED = 'if name == "en0" {';

let file;
try {
  file = join(dirname(require_.resolve('expo-network/package.json')), 'ios/NetworkModule.swift');
} catch {
  process.exit(0);
}

let source;
try {
  source = readFileSync(file, 'utf8');
} catch {
  process.exit(0);
}

if (!source.includes(BROKEN)) process.exit(0);

writeFileSync(file, source.replace(BROKEN, FIXED));
console.log('patched expo-network to read en0 rather than the last en* interface (see 6.84)');
