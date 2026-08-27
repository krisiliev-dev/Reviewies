const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Strip the push entitlement so a free Apple ID can sign the app.
 *
 * `expo-notifications` is autolinked, and prebuild writes `aps-environment` into
 * `ios/Reviewies/Reviewies.entitlements` because of it. A personal team — the free
 * team any Apple ID gets in Xcode — cannot sign an app that declares it, so the build
 * fails on the entitlement before it ever reaches the device.
 *
 * Deleting it in Xcode is not a fix: that file is generated, and the next `prebuild`
 * writes it back. §6.81 gitignored `ios/` for exactly this reason — anything that has
 * to survive belongs in the config, which is what this is.
 *
 * Off by default, because push is a real feature and the paid build should keep it.
 * Set `REVIEWIES_PERSONAL_TEAM=1` for a free-signing build. The app is already honest
 * about the consequence: `pushSupported()` is false without a projectId and
 * `whyNotSupported()` says so rather than offering a switch that does nothing (§6.50).
 */
module.exports = function withPersonalTeamSigning(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
