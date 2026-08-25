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

## Status

Core loop, social layer, backend, remote control and fingerprinting are all built and
deployed. 497 core tests (run twice, against both database implementations), 159 app
tests, 24 bridge tests and 19 relay tests pass, plus 31 live tests against the real
Supabase project and the real TMDB and AniList APIs. 49 browser checks cover the web
app end to end and 27 drive the phone app through react-native-web.

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
| Backend schema + row-level security | ✅ Deployed, all 11 migrations, RLS on every table |
| Offline-first sync with outbox | ✅ Built, live round-trip tested |
| Stats and Year in Review | ✅ Built |
| Discovery excluding already-watched | ✅ Built |
| Upcoming calendar + notification granularity | ✅ Built |
| Browser extension + automatic Watching Mode sync | ✅ Built (site selectors unverified) |
| Anime season correction via AniList | ✅ Verified live |
| Push notification delivery | ✅ Deployed and verified |
| Direct TV control from the app (Roku ECP over the LAN) | ✅ Built, not verified on hardware |
| Local bridge for a laptop (MPRIS) | ✅ Built, not verified on hardware |
| Remote drawer + relay server | ✅ Built, relay verified end to end |
| Audio fingerprinting + crowd-sourced references | ✅ Built, accuracy unverified on real audio |
| Continuous listening in the background (phone) | ✅ Built, unverified on a device |
| Mapping a whole episode from the phone | ✅ Built |
| Contributions cross-validated by content before promotion | ✅ Deployed and invoked live |
| Half-star ratings, poster overrides | ✅ Built |
| Lists mixing film and TV | ✅ Built |
| TV Time rescue CSV import | ✅ Built against the real tool's output |
| Community-voted content warnings | ✅ Deployed |
| Profiles, following, blocking | ✅ Deployed |

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
no build settings to configure. Add the `VITE_` variables above and it is live. See
[docs/deploying.md](docs/deploying.md), which also covers installing it on an iPhone —
and why that matters more than it sounds.

### Tests

```bash
npm test                              # 656 tests across core and app
SB_SECRET=sb_secret_... npm test      # includes live Supabase round-trips
npm run test:sqlite --workspace core  # the same 497 core tests, against SQLite

cd app && npm run build
npx vite preview &
node smoke.mjs                        # 49 end-to-end checks in a real browser

cd mobile && npx expo export --platform web
npx serve dist &
node smoke.mjs                        # 27 checks driving the phone app
```

The browser checks work either way. They ask the app once whether it has credentials and
then assert the correct behaviour for that build — an account-only control has to hide
itself when there is no account behind it and appear when there is, and both are worth
checking. Asserting only the credential-free answer is what they used to do, and since
`vite.config.ts` reads `.env` from the repository root, an ordinary build took the other
branch and the run failed against a perfectly correct app.

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

## Repository layout

An npm workspace. The rule that shapes it: **anything that is not a screen lives in
`core/`**, so the phone app and the web app run the same logic rather than two copies
of it.

```
core/                   @reviewies/core — no DOM, no React, no platform assumptions
  src/domain/           Types, ID scheme
  src/data/             Repository, importers, the injectable Database interface
  src/metadata/         Provider abstraction, TMDB, AniList, fixtures
  src/sync/             Auth, offline outbox, sync engine, Supabase adapter
  src/social/           Comments, lists, people, content warnings
  src/stats/            Runtime-weighted stats
  src/discover/         Recommendations that exclude what you have seen
  src/calendar/         Upcoming episodes and notification granularity
  src/fingerprint/      Landmark-hash fingerprinting
  src/watching/         Reactions, drift estimation, the emoji pad
mobile/                 The iOS and Android app (Expo)
  app/(tabs)/           Up Next, Search, Discover, Watchlist, More
  app/watching/         Watching Mode
  app/remote.tsx        Direct device control over the LAN
  src/platform.ts       The only file that knows it is a phone
app/                    The web app
  src/data/             Dexie adapter and the platform bindings
  src/screens/          UI
  src/watching/         Playback clock, reaction stream, extension bridge
  src/remote/           Remote drawer and bridge connection
  src/fingerprint/      Microphone capture
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

Two `Database` implementations ship: Dexie over IndexedDB, and SQLite. **The same 497
core tests run against both**, so the SQLite one is proven by the suite that was
written against Dexie rather than by a second suite written to agree with it.

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
