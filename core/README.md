# @reviewies/core

The parts of Reviewies that are not a user interface: the domain model, the repository,
metadata providers, the sync engine, stats, discovery, the fingerprint algorithm and the
importers.

Nothing here may import from `react`, `react-native`, `react-dom`, or touch `document`,
`window`, `localStorage`, `navigator` or `import.meta.env`. That last one matters as
much as the rest: `import.meta.env` is a Vite invention, and Metro does not provide it,
so reaching for it would stop the core running on a phone just as surely as reaching
for `localStorage`.

Four things that genuinely need a platform are injected instead, at startup:

- **`config`** — TMDB and Supabase credentials, endpoints, keys.
- **`data/db`** — a `Database` implementing the interface in `data/store.ts`.
- **`data/storage`** — a key/value store for preferences.
- **`data/transfer`'s file saver** — how this platform hands the user a file.

Each is bound through a `set*()` call. Until then, using one throws with a message
saying so, rather than failing later in a way that looks like a data bug.

## The Database interface

Derived by counting every `db.*` expression in the codebase — thirteen operations —
rather than by copying an ORM. Two implementations live in `data/adapters/`:

| | Used by | Tested by |
|---|---|---|
| `dexie.ts` | the web app | `npm test` |
| `sqlite.ts` | the phone app, via expo-sqlite | `npm run test:sqlite` |

**Both run the same suite.** The SQLite implementation is driver-agnostic so the
suite can point at sql.js in CI; on a device the driver is expo-sqlite. That is what
makes the port provable rather than merely plausible — every assertion was written
against Dexie's semantics, so anything failing under SQLite is a real difference
between the two rather than a test bending to fit.
