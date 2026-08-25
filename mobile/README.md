# Reviewies for iOS and Android

The app-first build. Everything that is not a screen comes from
[`@reviewies/core`](../core/README.md), so the tracking logic, sync, importers and
stats here are the same code the web app runs — not a port of them.

## Running it

```bash
npm install            # from the repository root
npm start --workspace @reviewies/mobile
```

Then press `i` for the iOS simulator, `a` for Android, or scan the QR code with Expo
Go. `npm run web --workspace @reviewies/mobile` runs the same app in a browser, and
`npm run ios` / `npm run android` go straight to a simulator without the menu.

## Checks

```bash
npm run export:web     # or: npx expo export --platform web
npx serve dist -p 4200 &
node smoke.mjs         # against a real SQLite database
```

`npm run smoke` does all three in one command.

This drives the app through react-native-web. It cannot see haptics, the local-network
entitlement, or how anything feels — that needs a device. What it does prove on every
change is the part most likely to break silently: the app boots, SQLite opens, and the
core loop still works against a real database rather than a mock.

## What is bound to the platform

`src/platform.ts`, and only that file:

| Core needs | Bound to |
|---|---|
| `config` | `Constants.expoConfig.extra` |
| `Database` | expo-sqlite, in WAL mode |
| key/value storage | AsyncStorage, hydrated once at startup |
| Supabase session storage | AsyncStorage — supabase-js reaches for `localStorage` otherwise, and the session would be lost every launch |
| file saver | expo-file-system plus a share sheet |

If that file grows, the core has started depending on the device in ways it should
not.

## Configuration

`app.json`'s `extra` block carries the TMDB and Supabase values, which is the Metro
equivalent of Vite replacing `import.meta.env`. With none of them the app runs on
sample data, so it is always launchable.

## What is built

Five tabs — Up Next, Search, Discover, Watchlist, More — plus the title page with its
episode list and half-star ratings, Stats, the import/export screen, and **Watching
Mode**.

Five and no more is deliberate. The web app carries eight, which is already too many
for a phone: iOS collapses a tab bar past five, and simplicity was the loudest single
finding in the research. The four things done daily get a tab; everything else is one
level down under More.

**The remote** talks to a Roku directly over the Wi-Fi, which is the clearest thing
going native bought: the same feature on the web needed a companion process on your
machine dialling out to a relay we host. Discovery probes the subnet over HTTP rather
than using SSDP, so it needs no native module and works in Expo Go — see
`core/src/devices/scan.ts` for what that trades away.

**The social layer** is wired up: account, episode comments behind the spoiler gate,
lists, people and following, content warnings on the title page, and the calendar.
Sign-in is framed as optional throughout — the app is fully usable signed out.

The spoiler gate is a row-level security policy rather than code in the screen, so no
forgotten path here can leak a plot twist; the screen only explains the rule.

The port is complete. Still to come: a background audio session for fingerprinting,
which is the last thing on doc 9 §5's list.
