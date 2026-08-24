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
Go. `npm run web --workspace @reviewies/mobile` runs the same app in a browser.

## Checks

```bash
npx expo export --platform web
npx serve dist -p 4200 &
node smoke.mjs         # 10 checks against a real SQLite database
```

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
| file saver | expo-file-system plus a share sheet |

If that file grows, the core has started depending on the device in ways it should
not.

## Configuration

`app.json`'s `extra` block carries the TMDB and Supabase values, which is the Metro
equivalent of Vite replacing `import.meta.env`. With none of them the app runs on
sample data, so it is always launchable.

## What is built

Up Next and Search, backed by SQLite, with a placeholder title page. The rest of the
screens port in the order doc 9 §5 sets out — Watching Mode next, then direct device
control, which is the thing going native actually unlocks.
