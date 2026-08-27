# Putting Reviewies on an iPhone

Three routes, and the free one is better than it looks.

| | Cost | Needs | Remote drawer | Audio sync | Push |
|---|---|---|---|---|---|
| **Xcode, free Apple ID** | free | a Mac | yes | yes (background too) | no |
| **EAS Build** | $99/yr | nothing but an Expo account | yes | yes | yes |
| **Expo Go** | free | a computer on the same Wi-Fi | no | foreground only | no |
| **Home-screen PWA** | free | a deployed web build | no | in Safari only | web push |

## The free route: Xcode with a personal team

Any Apple ID gets a **Personal Team** in Xcode, which can sign an app and install it on
your own device. It is a real build — the config plugins run, so the Info.plist gets the
Bonjour service types the remote needs and the microphone descriptions the fingerprinter
needs. Two of the three things Expo Go cannot do, for nothing.

What it costs instead of money:

- **A Mac.** Apple's free signing only works through Xcode. EAS's cloud builders cannot
  use a personal team, because EAS creates certificates through the Developer Portal API
  and personal teams are not exposed there.
- **Seven days.** A personal-team provisioning profile expires after a week. Rebuild and
  reinstall from Xcode to reset it. Your data is untouched — it is in the app's SQLite
  database, and reinstalling over the top keeps it.
- **No push.** `aps-environment` is an entitlement, and entitlements need the paid
  program. The app knows: `pushSupported()` returns false and the notification screen
  says why rather than offering a switch that does nothing.

### Steps

```sh
# 1. From the repository root, with .env in place (see below).
cd mobile

# 2. The free-signing build. `npm run ios:native` is the paid one — see below.
npm run ios:native:free

# 3. Open the workspace — not the .xcodeproj. It exists because prebuild ran
#    `pod install`; if you passed --no-install there will not be one.
open ios/Reviewies.xcworkspace
```

In Xcode:

4. **Xcode → Settings → Accounts**, add your Apple ID. A "Personal Team" appears.
5. Select the **Reviewies** target → **Signing & Capabilities**:
   - tick **Automatically manage signing**
   - set **Team** to your personal team
   - if the bundle identifier is rejected as taken, change it to something unique —
     `dev.<yourname>.reviewies` — in `app.json` and re-run `prebuild`
6. Plug the iPhone in, pick it as the run destination, press **Run**.
7. The first launch is refused. On the phone: **Settings → General → VPN & Device
   Management → your Apple ID → Trust**. Once per Apple ID per device.

### Why `REVIEWIES_PERSONAL_TEAM=1`

`expo-notifications` is autolinked, so prebuild writes this whether anybody asked or not:

```xml
<key>aps-environment</key><string>development</string>
```

A personal team cannot sign an app that declares it, and the build fails on the
entitlement before it ever reaches the device. **Deleting it in Xcode is not a fix** —
that file is generated, and the next `prebuild` writes it back. `ios/` is gitignored for
that reason: anything that has to survive belongs in the config.

The flag applies `plugins/withPersonalTeamSigning.js`, which strips the entitlement. It
is off by default so the eventual paid build keeps push.

### What is actually in the build (checked, not assumed)

Running prebuild both ways and reading the generated files:

| | default | `REVIEWIES_PERSONAL_TEAM=1` |
|---|---|---|
| `aps-environment` | `development` | *absent* |
| `NSBonjourServices` | `_roku-rcp._tcp`, `_googlecast._tcp`, `_airplay._tcp` | same |
| `UIBackgroundModes` | `["audio"]` | same |
| `NSMicrophoneUsageDescription` | present | same |
| `NSPhotoLibraryUsageDescription` | present | same |

The second column is the point: **background audio survives free signing**.
`UIBackgroundModes` is an Info.plist key, not an entitlement, so a personal team can
carry it. The remote's Bonjour discovery and the fingerprinter's microphone are both
plain Info.plist too. Push is the only casualty.

### The environment

`mobile/app.config.ts` reads the repository's own `.env`, so a build picks up the same
three values the web uses:

```
VITE_TMDB_TOKEN=…
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
```

`EXPO_PUBLIC_`-prefixed names are accepted too and win where both are set. Anything
already exported wins over the file, including a deliberately empty value.

Everything here ships inside the app bundle in plain text, exactly as it does in the web
build. The **anon** key belongs there and row-level security is what protects the data; a
`sb_secret_` key does not, and the config refuses to build if one is in that slot.

## When you are ready to release: EAS

The paid Developer Program ($99/yr) buys three things the free route cannot have: push
notifications, builds without a Mac, and distribution to anybody but yourself.

Then it is `npx eas build -p ios --profile preview` — Expo's cloud macOS builders, an
install link, no Xcode. TestFlight is `eas submit` on top. That needs an `eas.json` and
an EAS project ID in `extra.eas.projectId`, neither of which exists yet; there is no
point creating them until there is an account to attach them to.

## Expo Go, for a quick look

`npx expo start --tunnel` from a computer, scan the QR with Expo Go. The core loop,
import, stats and Watching Mode all work.

It cannot do the remote drawer or background audio, and this is worth understanding
rather than working around: Expo Go is one prebuilt app with a fixed `Info.plist`, and
the entries that make those features possible are added by config plugins at build time.
No amount of JavaScript reaches them. Push was removed from Expo Go on iOS in SDK 53.

## The web app on the home screen

Safari → the deployed URL → Share → **Add to Home Screen**. Not Chrome, not an in-app
browser: an installed home-screen web app gets its own storage that Safari's seven-day
eviction does not touch, and the in-app browsers do not offer the option at all.

See `docs/deploying.md` for getting a build deployed in the first place.
