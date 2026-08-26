# The web app

Reviewies in a browser. React, Vite and Dexie over IndexedDB, with every decision that is
not a screen living in [`@reviewies/core`](../core/README.md) so the phone app can make the
same ones.

This used to be the whole product. [Doc 9](../docs/research/09-app-first-pivot.md) moved it
to second place: the phone can reach a television on the local network, hold an audio
session in the background and survive iOS's storage eviction, and none of those are things
a page can do. What the browser is still better at is a laptop — where the position of what
you are watching is sitting on a `<video>` element and the [extension](../extension/README.md)
can read it exactly.

Everything works with nothing configured. No account, no keys: the metadata provider falls
back to fixtures, sync is absent rather than broken, and the account panel names the two
variables it would want. That is not a courtesy to developers — it is the product's
position, and the first screen a person arriving from TV Time sees is the import, not a
sign-up.

## Running it

From the repository root, because it is a workspace:

```bash
npm install
npm run dev --workspace app
```

`.env` at the *root* rather than here: `vite.config.ts` sets `envDir: '..'`, so one file
configures the app, the core's tests and the phone. `.env.example` lists the variables and
what each one turns on.

## Layout

```
src/screens/     One file per route. The route table is in App.tsx.
src/ui/          Shared components, the error boundary, the failure banner.
src/data/        Binds the Dexie adapter and this platform's config into the core.
src/remote/      The remote-control drawer and the relay socket behind it.
src/watching/    Receiving playback position from the browser extension.
src/backend/     Tests that read the SQL migrations rather than the client.
src/wiring/      Guards that read the repository itself — see below.
```

`src/wiring/` is worth knowing about. It holds checks that no unit test can make because
they are about the repository rather than about code: which core exports nothing calls,
which screen states nothing has ever rendered, whether a documented command names a file
that exists, whether a plain Node process could load what it is asked to. Each one exists
because something got past everything else.

## Tests

```bash
cd app
npm test                              # unit and component tests
npm run smoke                         # the whole app, in a real browser
```

The smoke suite builds, serves and drives the app end to end — the core loop, Watching
Mode, the import, accessibility, and every screen audited for named controls, target size
and behaviour at 200% text. It is the check that has found the most, by some margin.
