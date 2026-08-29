# Reviewies

A TV series and movie companion app — tracker, diary, and discovery tool. **An app
first**, for iOS and Android, with the browser version falling out of the same
codebase.

It exists because [TV Time shut down on 15 July 2026](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/),
taking ~26 million people's watch histories with it. The goal is to combine what TV Time
did well (episode-level tracking, community, breadth of catalogue) with what Letterboxd
does well (diary, reviews, lists, taste), while making the data genuinely yours —
local-first, exportable at any time, never hostage to someone else's business model.

**The differentiator is Watching Mode:** timestamped emoji reactions on a second screen,
replayed from everyone who watched that moment before you.

**Live:** [reviewies-beryl.vercel.app](https://reviewies-beryl.vercel.app) — the web
build. Open it in Safari on an iPhone and Share → Add to Home Screen; that is what
exempts it from Safari's seven-day storage eviction, which matters because your history
lives in IndexedDB.

> **The deployment is behind the branch.** Everything below is committed and passing;
> the site is serving an older bundle because deploying needs a `VERCEL_TOKEN` this
> checkout does not have. `npm run whats-live` compares the two and says so. Saying
> "deployed" about work that is not is the failure this repository has already had
> once, so it is written down rather than assumed.

## Status

Core loop, social layer, backend, remote control, fingerprinting and the whole
migration path from TV Time are built. The core suite runs twice, against both database
implementations, and there are separate suites for the app, the bridge and the relay;
live suites run against the real Supabase project and the real TMDB and AniList APIs,
including the listen-to-sync pipeline end to end — two people contribute timelines, the
promoter cross-validates them, and a client reads back a reference it can sync against.
Browser checks drive the web app and the phone app end to end. Exact counts are not
repeated here because they are wrong by the next commit; `npm test` prints them.

**What is deliberately not built**, so the table below is not read as a to-do list:

- **Continuous listening in the browser.** The phone corrects its clock every few
  seconds while backgrounded; a browser tab loses its audio graph when it stops being
  looked at, so the web would have a feature that stops working exactly when a
  second-screen app is useful. The web syncs by listening once, accurately.
- **Cast and AirPlay.** Both need native SDKs and a custom development build. Roku is
  reachable over plain HTTP and works today; the rest is [doc 6](docs/research/06-cast-airplay-and-fingerprint-sizing.md) §2.

**What is built but has never met reality**, which is a different thing from untested:
nothing has run on a physical phone, so haptics, the local-network entitlement and how
any of it feels are unknown; the fingerprinter has never heard a real television through
a real microphone; and the Roku and MPRIS adapters have never spoken to hardware.

| Area | State |
|---|---|
| Local data layer (watches as events, stable IDs) | ✅ Built, tested |
| Metadata: TMDB + fixtures behind a provider interface | ✅ Verified live |
| Up Next, mark watched, search, watchlist with notes | ✅ Built, smoke-tested |
| Spoiler-free quick log and catch-up | ✅ Built, smoke-tested |
| GDPR zip and DioCache.db recovery (with `-wal`) | ✅ Built, verified against real SQLite |
| Finished shows complete themselves | ✅ Built, smoke-tested |
| Where to watch, per country | ✅ Built, verified live |
| Watching Mode: shared reactions, replay, drift correction | ✅ Built |
| Reactions sampled across the episode, not its first minutes | ✅ Deployed |
| Episode comments, spoiler-gated in the database | ✅ Verified live |
| Screenshots in comments | ✅ Deployed and verified live |
| Backend schema + row-level security | ✅ Deployed, all 12 migrations, RLS on every table |
| Offline-first sync with outbox | ✅ Built, live round-trip tested |
| Sync that actually runs, on both platforms | ✅ Built — it used to belong to one screen on the web and not exist at all on the phone |
| Stats and Year in Review | ✅ Built |
| Discovery excluding already-watched | ✅ Built |
| Upcoming calendar + notification granularity | ✅ Built |
| Browser extension + automatic Watching Mode sync | ✅ Built, deployed origin now reachable (site selectors unverified) |
| Anime season correction via AniList | ✅ Verified live |
| Push notification delivery (web) | ✅ Deployed and verified |
| Push notification delivery (phone) | ⚠️ Built and deployed; needs a device to obtain a token |
| Direct TV control from the app (Roku ECP over the LAN) | ✅ Built, not verified on hardware |
| Local bridge for a laptop (MPRIS) | ✅ Built, not verified on hardware |
| Remote drawer + relay server | ✅ Built on both platforms, relay verified end to end |
| Audio fingerprinting + crowd-sourced references | ✅ Built, accuracy unverified on real audio |
| Continuous listening in the background (phone) | ✅ Built, unverified on a device |
| Mapping a whole episode from the phone | ✅ Built |
| Contributions cross-validated by content before promotion | ✅ Deployed, proven end to end live |
| Half-star ratings, poster overrides | ✅ Built |
| Lists mixing film and TV | ✅ Built |
| TV Time rescue CSV import | ✅ Built against the real tool's output |
| Migration is the first thing a new arrival is offered | ✅ Built on both platforms |
| An import writes the library, the names and the episodes it knows | ✅ Built, tested |
| Matching imported shows to TMDB, asking when unsure | ✅ Built, measured against live TMDB |
| Community-voted content warnings | ✅ Deployed |
| Profiles, following, blocking | ✅ Deployed |
| Every control named and reachable by keyboard | ✅ Built, asserted per screen in both smoke suites |
| Reduced motion, and a way to stop the reaction stream | ✅ Built on both platforms |
| 24px targets and 200% text without losing a control | ✅ Built, measured per screen |
| The reaction stream summarised rather than read out one by one | ✅ Built on both platforms |
| The same five tabs on both platforms, everything else behind More | ✅ Built — one row at the default size and at 200% |
| The calendar refreshes itself, so a new season appears | ✅ Built on both platforms — nothing refetched a tracked show before |
| Cached metadata expires and can be cleared, keeping imported names | ✅ Built on both platforms |
| Deleting your own comment | ✅ Built on both platforms |
| Attaching a screenshot from the phone | ✅ Built, native picker unverified on a device |
| The export carries your lists, follows and comments too | ✅ Built, live round-trip written and unrun |
| Restoring lists and follows from an export | ✅ Built, live round-trip written and unrun |

## Running it

```bash
npm install          # from the repository root; it is a workspace
npm run dev --workspace app
```

Without credentials the app runs on built-in sample data, so it is always launchable.
Copy `app/.env.example` to `app/.env` to use real services:

- `VITE_TMDB_TOKEN` — TMDB **API Read Access Token** (v4 bearer), not the v3 API key
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — Project Settings → API

The anon/publishable key is safe in a client bundle; row-level security is what protects
the data. **Never** put a `sb_secret_` key there — it bypasses RLS, and the app refuses
to start if it detects one.

TMDB is free for non-commercial use only, requires attribution, forbids caching beyond
six months, and forbids AI/ML use. See [research doc 01](docs/research/01-landscape-and-requirements.md) §4.

### Backend

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... node scripts/apply-migrations.mjs
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com \
  CRON_SECRET=... node scripts/deploy-functions.mjs --secrets
```

The first applies `supabase/migrations/` over HTTPS via the Management API, then
verifies the tables landed and reports any table left without RLS. The second deploys
`supabase/functions/` the same way. Both routes exist because the direct database host
is IPv6-only, the IPv4 poolers listen on ports that egress filtering commonly blocks,
and the Supabase CLI wants Docker. `SUPABASE_ACCESS_TOKEN` is a personal access token
from [account settings](https://supabase.com/dashboard/account/tokens), not a project
API key.

Then schedule the sender — see [`supabase/README.md`](supabase/README.md).

### Hosting the app

`vercel.json` and `netlify.toml` are set up so importing the repository deploys it with
no build settings to configure. Add the `VITE_` variables above and it is live.

The existing Vercel project has **no Git connection**, so nothing deploys on push:

```bash
VERCEL_TOKEN=…                                       npm run deploy:web
SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=…   npm run whats-live
```

The first builds, deploys, and then checks the site is serving the bundle it just built.
The second compares everything deployed against the repository — web bundle, migrations,
edge functions — and exits non-zero if anything is behind. It exists because the deployed
site once sat three weeks behind without anything reporting a problem, not because a
warning was ignored but because there was no way to ask.

### The design tokens

Every colour, size, radius, duration and stacking order lives in `core/src/tokens.ts`.
The phone imports it; the web gets the same values as generated CSS:

```bash
npm run tokens          # regenerate app/src/tokens.generated.css
npm run tokens:check    # fail if the checked-in file is stale
```

Never edit `app/src/tokens.generated.css`. `app/src/ui/tokens.generated.test.ts`
regenerates it in memory and byte-compares, so a hand edit fails the build rather than
quietly becoming a second palette — which is how the two platforms drifted apart last
time. [docs/design/tokens.md](docs/design/tokens.md) has the reasoning and every
computed contrast ratio.

[docs/deploying.md](docs/deploying.md) has the reasoning behind each step, including why
deploying from inside the checkout fails with an error naming the wrong cause. It also
covers installing it on an iPhone — and why that matters more than it sounds.

### Tests

```bash
npx playwright install chromium       # once, unless your environment ships one
npm test                              # every workspace that has tests
SB_SECRET=sb_secret_... npm test      # includes live Supabase round-trips
npm run test:sqlite --workspace core  # the same core tests, against SQLite
npm run test:tz --workspace core      # the same core tests again, at UTC+14

npm run smoke                         # all four end-to-end suites, in order

# …or one at a time. Pin the ports: vite and serve pick a free one if the default is
# taken, and the suites dial the default regardless.
cd app && npm run build
npx vite preview --port 4173 &
node smoke.mjs                        # the web app, in a real browser

cd ../mobile && npm run export:web     # or: npx expo export --platform web
npx serve dist -p 4200 &
node smoke.mjs                        # the same, driving the phone app

cd ../extension && npm run smoke       # loads the extension into a real browser
cd ../bridge && npm run smoke          # app → relay → bridge → a fake Roku

cd ../app && npm run smoke:failures    # the same web app, with the provider failing
```

### The suites that need somebody else's server

```sh
npm run test:live --workspace core    # TMDB, AniList and Supabase, for real
```

`verify` does **not** run these, and §6.158 is why. `anime.live.test.ts` asks AniList to
reconstruct Frieren's seasons, and twice in two sprints it timed out at 60,005 ms and turned
the command this whole method treats as the arbiter of green into a red one — for a reason
that had nothing to do with the change under test, and that looks exactly like a real
failure until you read the name.

§6.125 found the same shape in the phone's smoke suite ("failing like a regression whenever
the network did") and fixed it by blanking the credentials. These tests cannot be fixed that
way, because reaching the real service is the whole of what they are for. So they moved
instead: still here, still gated on having credentials, run on purpose rather than on every
`verify`.

### Screenshots

```sh
npm run design                        # all three passes, whatever the others do
npm run design:phone                  # the phone, viewport shots and their feet
npm run design:signedin               # the six screens behind an account
npm run design:web                    # the web app, both themes

npm run design:snapshot               # take a snapshot of real TMDB (needs a token)
npm run design:real                   # the phone, photographed against that snapshot
npm run design:web:real               # the web app against it, at 420 and 1280
```

The three run independently and `design` reports a failure at the end rather than stopping
at the first: they share no state, and chaining them with `&&` meant one intermittent in
the phone's pass silently cost the other two entirely — §6.142 found twenty-six screenshots
that had not been taken for several sprints.

Two passes, because a screen behind an account is a screen nobody reviews. The first
builds with every credential blanked, so the metadata provider is the fixture provider by
construction rather than by whether you happen to have a `.env` — §6.125 found that the
phone's suite had been reaching the live TMDB API on every run it ever made, and failing
like a regression whenever the network did.

The second builds again into `mobile/dist-signedin` (`npm run export:signedin --workspace
mobile`) against a Supabase host that does not exist, signs in with a fabricated session
and answers PostgREST from `design/signedIn.mjs`. No network, no account, the same pixels
every run. It exists because four of the twelve routes used to photograph a gate rather
than a screen, and three sprints of design work landed behind it unseen.

Both passes measure as well as photograph: rule reach against the viewport edge, what a
press repaints to, and the target size of controls only an account can reach.

### And a fourth, against data nobody invented

The three above photograph `FixtureProvider`: five titles of two or three short words,
`Episode 8` for every episode name, one-sentence overviews, and **no artwork at all** — it
supplies no `posterUrl`, so every poster in the design record is the two-letter fallback.
Thirty sprints of review judged screens whose content resembles nothing anybody will put in
them.

```sh
npm run design:snapshot   # once, or whenever the library should change
npm run design:real       # the phone
npm run design:web:real   # the web app, at 420 and at 1280
```

`design:web:real` builds the web app into `app/dist-real` (`npm run build:real --workspace
app`) so it cannot share a directory with the fixture build — §6.153 lost a sprint to two
passes writing the same `mobile/dist`, which meant whichever ran last decided which provider
the other had been photographing.

It shoots at **two widths**. Everything else in the design track shoots at 390 or 420, so
the window an ordinary desktop visitor gets had never been photographed by anything, and
§6.157 found the app was the phone layout stretched across it — a row's title at the far
left of a 1280-wide window and its own checkbox at the far right.

The signed-in pass is deliberately **not** in this list. Its three routes are an email, a
handle and two list names; there is no TMDB content on any of them, so pointing it at the
snapshot would change nothing. That was measured by looking at the shots rather than
assumed, and what it did turn up is filed instead: the pass photographs three *collapsed*
list rows and has never opened one, so the row that shows a list's titles has never been
photographed at all.

`design/snapshot.mjs` fetches six real titles with node — chosen for what they stress: the
longest title anybody tracks, an anime with 1,220 episodes, a show airing now with real
episode names, one that drops a season at a time, a diacritic, and a film — and keeps the
API responses and every image they mention. `design/serveSnapshot.mjs` answers those from
`http://localhost:4203`, and the build points `tmdbBase`/`tmdbImage` there, so
`TmdbProvider` runs unmodified and **no real token goes into the build**.

A snapshot rather than a live pass because Chromium in this container has no outbound
network at all — `example.com` fails exactly as TMDB does. It is also the better shape: a
snapshot is deterministic, which is the property the other three passes blank the token
for. Re-take it to change what is photographed; `design/real/` is not committed (534 MB).

It builds into `mobile/dist-real` (`npm run export:real --workspace mobile`), the way the
signed-in pass builds into `dist-signedin`. It shared `mobile/dist` with the phone pass for
one sprint, which meant whichever ran last decided which provider the *other* was serving —
§6.153 lost half an hour to a probe searching the snapshot's library against the fixture's
four invented titles.

That last one is the odd member of the family: it builds *with* the TMDB token — the
others blank it on purpose — and then makes every request to the provider fail three
ways: refused, answered with a 500, and left hanging with no answer at all. The third is
the one worth the trouble. A hang never rejects, so no `catch` in the app can see it, and
only the deadline in `SEARCH_TIMEOUT_MS` ends it. No network is needed: interception
happens before the request leaves the browser.

`test:tz` runs the core suite a third time at `Pacific/Kiritimati`, UTC+14. It is in
`npm run verify` because a UTC runner cannot see a UTC bug: a calendar date read as UTC
midnight is right in Greenwich and wrong for most of the world, and the planted proof in
doc 9 §6.66 passes every test at UTC and fails four of them anywhere else. Kiritimati
rather than a nearer offset because it is the far edge — a date read wrongly is wrong by
the whole fourteen hours there, so nothing squeaks through on a rounding.

### What has never run

```bash
npm run coverage
```

Runs every workspace's tests in one process and prints the only part of a coverage report
worth reading: files nothing entered at all, and functions nothing ever called. There is
no threshold and no percentage in `verify` — the standard here is a named guard that fails
for a stated reason, and a number drifts, can be gamed by testing the easy half, and says
nothing about *which* line matters.

It has to be the whole monorepo at once. Measured per workspace the report is wrong in
both directions and silent about it: `core/src/devices/relayUrl.ts` comes back entirely
dead because the suite that executes it lives in `relay/`, and
`core/src/data/adapters/sqlite.ts` comes back three-quarters dead because the SQLite
config is a separate run. Doc 9 §6.68 has the details, including what it still cannot see
— the five browser suites drive a *built bundle*, so nothing they exercise appears here.

Two suites are deliberately not part of `npm test`:

```bash
RECONCILE_LIVE=1 npx vitest run src/data/reconcile.live.test.ts   # in core/
```

That one asks TMDB about thirty real shows and asserts on the shape of the replies, so a
new entry sharing a name with an existing show changes the result. That is the event it
exists to catch when run deliberately, and somebody else's flake when it is blocking a
routine test run. The other live suites ask a handful of questions with known answers and
run whenever a token is present.

Two environment variables appear only inside tests: `TZ`, which the stats suite sets to
prove day boundaries are local rather than UTC, and `DATA`, which carries a base64
SQLite fixture into a subprocess in the write-ahead-log test.

`core/src/data/scale.test.ts` runs the app's own queries against a library somebody has
actually used — a hundred and twenty shows, six thousand episodes, a decade of watches —
on whichever store the run is using, and fails if any of them stops being quick. Three
switches steer it, none of them needed for a normal run:

```bash
SCALE_REPORT=1 npx vitest run src/data/scale.test.ts   # print the timings
SCALE_SHOWS=300 SCALE_SEASONS=8 …                      # a harsher library, for probing
```

The budgets in it are deliberately loose. A container's timings say nothing exact about a
phone; what a budget catches is the shape of a mistake — a query that went from indexed to
scanning — which shows up as an order of magnitude rather than as fifty milliseconds.

The browser checks work either way. They ask the app once whether it has credentials and
then assert the correct behaviour for that build — an account-only control has to hide
itself when there is no account behind it and appear when there is, and both are worth
checking. Asserting only the credential-free answer is what they used to do, and since
`vite.config.ts` reads `.env` from the repository root, an ordinary build took the other
branch and the run failed against a perfectly correct app.

The live Supabase suite makes and unmakes its own user through the admin API, so it
needs `SB_SECRET` and skips without one. It cannot be replaced by signing up through the
public endpoint: the project rejects obviously-disposable addresses, and an account
created that way could not be cleaned up afterwards. What does not need credentials is
`sync/columnMap.test.ts`, which checks the adapter's column mapping against the
migration SQL — a column missing from that mapping is not an error anywhere, the field
just never leaves the device, and a second device is the only place it shows.

Row-level security is tested against real Postgres via PGlite, running the deployable
migration SQL as an unprivileged role — Postgres bypasses RLS for superusers and table
owners, so testing as the owner would make every assertion pass vacuously.

The browser extension ([`extension/`](extension/README.md)), device bridge
([`bridge/`](bridge/README.md)) and relay ([`relay/`](relay/README.md)) each have their
own build and tests.

## Architecture in one paragraph

IndexedDB (via Dexie) is the source of truth for user data, so marking an episode
watched never waits on the network; writes queue in an outbox and upload when they can.
Provider metadata lives in physically separate tables with a TTL, which is what makes
TMDB's six-month caching limit enforceable and keeps exports legally clean. Watching
something is recorded as an **event**, not a boolean, so rewatch counts work. Progress is
keyed to provider episode IDs, never `"S3E4"` strings, because upstream databases reorder
episodes routinely. Spoiler safety is a **database policy**, not application code: a
comment is only selectable once you have watched that episode.

## Arriving from TV Time

The premise of the product, so it is the first thing the app offers rather than
something on a settings screen. Three different things turn up under the name "my TV
Time data" and all three are read by content rather than by filename: the GDPR zip, a
CSV from the [rescue tool](docs/research/05-universal-remote-and-timestamp-sync.md), and
a `DioCache.db` pulled off a phone — with its `-wal`, which holds the most recent months
and is silently lost if you import the database alone.

What an export carries is names and dates. It has no provider IDs, so everything lands
under local ones (`local:tv:tvtime-900`) that TMDB has never heard of. The import writes
three things from that: the library rows the history implies, the names, and the
episodes it knows were watched. The last of those is what makes the rest possible —
matching a show is easy, but moving a watch history onto it means mapping each episode
to the provider's own ID, and the only route across is season and number.

Matching then runs against the provider, and the shape of it is set by one asymmetry.
An unmatched row is visibly unfinished and costs nothing; a **wrong** match silently
moves somebody's history onto the wrong show, and there is no way for them to notice. So
acting without asking needs two conditions rather than one — high confidence *and* a
clear margin over the runner-up — because the dangerous case is not a weak match, it is
a remake or a regional twin, two answers that both look right. Everything else becomes a
question with posters and years, and "none of these" leaves the row alone.

Both numbers were measured rather than guessed, and measuring them found one wrong
match: at a 0.2 margin, "Ghost in the Shell" matched onto a 2026 entry of that exact
name ahead of the 2002 series. `core/src/data/reconcile.live.test.ts` records what
thirty real names do at the thresholds that replaced it.

## Reachable without a pointer, and without sight

Not a compliance exercise: the failures found were ones that made features unusable
rather than merely awkward, and every one of them was invisible until something
measured it.

- **There was no focus indicator.** The browser's default outline computed to
  `rgb(16, 16, 16)` against a `#0b0b0f` background — 1.03:1, which is to say nothing at
  all. Every control was reachable by keyboard and none of them showed where you were.
- **The overlays could not be escaped.** The catch-up sheet and the remote drawer were
  openable, correctly labelled, and left a keyboard standing outside: focus stayed
  behind, Tab walked into the page underneath, Escape did nothing.
- **Reduced motion emptied the flagship feature.** The reaction drift is a keyframe
  animation with `forwards`, so a global `animation-duration: 0.01ms` ran it instantly
  to its end state — off the left-hand edge. The setting meant an empty strip.
- **The reaction stream was unusable in both directions.** On the web it announced every
  emoji as it passed, twenty-four interruptions a minute; on the phone it announced
  nothing, so the feature was simply absent. It summarises a moment now — "2 funny and 1
  other" — at most every ten seconds, and Hold stops the talking with the movement.
- **Ten targets in a row were seven pixels wide.** The star rating's halves were well
  under the 24 CSS pixels WCAG asks for, and at 200% text the whole control was pushed
  off the side of the screen — twice, the second time because the minimum had been
  written in `rem` and doubled along with the text.

Both smoke suites now audit every screen they visit: every control named, the count of
them asserted so a screen reporting nothing fails rather than passes, every target
measured, and the page re-rendered at 200% text to check nothing leaves the viewport.

## Repository layout

An npm workspace. The rule that shapes it: **anything that is not a screen lives in
`core/`**, so the phone app and the web app run the same logic rather than two copies
of it.

```
core/                   @reviewies/core — no DOM, no React, no platform assumptions
  src/domain/           Types, ID scheme
  src/data/             Repository, importers, the injectable Database interface
  src/metadata/         Provider abstraction, TMDB, AniList, fixtures
  src/sync/             Auth, offline outbox, sync engine and the driver that runs it
  src/social/           Comments, lists, people, content warnings, the account export
  src/stats/            Runtime-weighted stats
  src/discover/         Recommendations that exclude what you have seen
  src/calendar/         Upcoming episodes, the refresh that keeps them current, notifications
  src/fingerprint/      Landmark-hash fingerprinting
  src/watching/         Reactions, drift estimation, the emoji pad, what it says aloud
  src/devices/          Roku over the LAN, device discovery, the direct-control adapters
mobile/                 The iOS and Android app (Expo)
  app/(tabs)/           Up Next, Search, Discover, Watchlist, More
  app/watching/         Watching Mode
  app/comments/         Episode conversations
  app/remote.tsx        Direct device control over the LAN
  src/ui/               Shared controls, theme, importers
  src/watching/         Reaction stream, listen-to-sync
  src/fingerprint/      Background audio session
  src/devices/          The remote's connection to a television
  src/social/           Lists and content warnings, as the phone renders them
  src/comments/         The image picker, and the one branch no browser run reaches
  src/platform.ts       The only file that knows it is a phone
app/                    The web app
  src/screens/          UI — the same five tabs the phone has, and a More behind the fifth
  src/ui/               Shared controls: posters, importers, catch-up, dialogs, palette
  src/data/             Dexie adapter and the platform bindings
  src/watching/         Playback clock, reaction stream, extension bridge
  src/remote/           Remote drawer and bridge connection
  src/fingerprint/      Microphone capture
  src/social/           Lists and content warnings, as the web renders them
  src/sync/             Reads the driver's status; does not own it
  src/calendar/         Web Push subscription
  src/metadata/         Region selection
  src/extension/        Receives what the browser extension reports
  src/backend/          Checks the deployed backend and the prose about it
  src/wiring/           What core exports, against what each app imports
extension/              Browser extension (MV3)
bridge/                 Local companion for controlling a laptop (MPRIS over D-Bus)
relay/                  WebSocket relay pairing the app to a bridge
supabase/               Schema, RLS policies, edge functions
scripts/                Migration and function deployment
docs/research/          Research notes and decisions
```

The core reaches a platform through four bindings, injected at startup: configuration,
a `Database`, a key/value store for preferences, and a file saver. Until they are
bound, using them throws with a message saying so — rather than failing later in a way
that looks like a data bug. See [`core/README.md`](core/README.md).

Two `Database` implementations ship: Dexie over IndexedDB, and SQLite. **The same core
suite runs against both**, so the SQLite one is proven by the suite that was written
against Dexie rather than by a second suite written to agree with it. Counts are not
repeated here for the reason given under Status; `npm test` prints them.

Three of the checks are about the codebase rather than its behaviour, and each exists
because something got through without one:

- `app/src/wiring/` compares every symbol `core` exports against what each app imports,
  because sync existed in core for the life of the phone app and nothing there ever
  called it. It is pointed at the commit before that was fixed on every run and has to
  find the gap there.
- `core/src/sync/writes.test.ts` requires every function that writes a syncable table to
  queue it, because the importers and the matcher did not.
- `core/src/sync/backendQueries.test.ts` checks every column, table, foreign key and
  policy the client names against the migrations, because supabase-js answers a bad
  column with an empty result rather than an error.

## Research

Read in order; later documents revise earlier ones where evidence changed.

1. [Landscape and requirements](docs/research/01-landscape-and-requirements.md) — competitors,
   data-source licensing, iOS PWA constraints
2. [Decisions and revised architecture](docs/research/02-decisions-and-revised-architecture.md)
3. [Reddit findings and new features](docs/research/03-reddit-findings-and-new-features.md) —
   **materially revises 1 and 2.** Comments, not tracking, were what people valued;
   simplicity is the loudest demand
4. [Remote architecture and feature gaps](docs/research/04-remote-architecture-and-feature-gaps.md)
5. [Universal remote and timestamp sync](docs/research/05-universal-remote-and-timestamp-sync.md)
6. [Cast/AirPlay and fingerprint sizing](docs/research/06-cast-airplay-and-fingerprint-sizing.md) —
   includes a live-verified correction to the anime claims in 2 and 4
7. [What was actually built](docs/research/07-what-was-built.md) — reconciles the plan
   with the implementation: where the research turned out to be wrong, which decisions
   were reversed and why, and exactly which layers are and are not verified
8. [Second Reddit sweep](docs/research/08-second-reddit-sweep.md) — five weeks after the
   shutdown, once people had lived with fifteen replacements. **Withdraws doc 4's plan to
   import the TV Time comment archive**, and finds the GDPR zip is the recovery path
   everyone judges a tracker on
9. [Going app-first](docs/research/09-app-first-pivot.md) — **reverses the PWA decision in
   docs 1 and 2.** Why Expo rather than Capacitor, what the pivot costs, and a running
   account of what was built afterwards: continuous listening, mapping episodes from the
   phone, cross-validating contributions, and a run of bugs that all turned out to share
   one cause — test fixtures smaller than the values production produces

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming
availability data is provided by JustWatch.
