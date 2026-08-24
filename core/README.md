# @reviewies/core

The parts of Reviewies that are not a user interface: the domain model, the repository,
metadata providers, the sync engine, stats, discovery, the fingerprint algorithm and the
importers.

Nothing here may import from `react`, `react-native`, `react-dom`, or touch `document`,
`window`, `localStorage` or `navigator`. Two things that genuinely need a platform are
injected instead, at startup, by whichever app is running:

- **`data/db`** — a `Database` implementing the small interface in `data/store.ts`.
  Dexie on the web, SQLite on a phone.
- **`data/storage`** — a key/value store for preferences. `localStorage` on the web,
  AsyncStorage on a phone.

Both are bound through `setDatabase()` and `setStorage()`. Until they are, using them
throws with a message saying so, rather than failing later in a way that looks like a
data bug.

Every test in here runs against the in-memory implementations, so the core is testable
with no app and no device.
