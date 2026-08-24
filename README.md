# Reviewies

A TV series and movie companion app — tracker, diary, and discovery tool, built as a
Progressive Web App with a path to a native iOS app later.

It exists because [TV Time shut down on 15 July 2026](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/),
taking ~26 million people's watch histories with it. The goal is to combine what TV Time
did well (episode-level tracking, community, breadth of catalogue) with what Letterboxd
does well (diary, reviews, lists, taste), while making the data genuinely yours —
local-first, exportable at any time, never hostage to someone else's business model.

**The differentiator is Watching Mode:** timestamped emoji reactions on a second screen,
replayed from everyone who watched that moment before you.

## Status

Core loop, social layer, backend, remote control and fingerprinting are all built.
**Nothing is deliberately skipped.** 342 app tests, 43 bridge tests and 19 relay tests
pass, including live tests against a real Supabase project and the real TMDB API;
27 browser checks cover the full flow.

| Area | State |
|---|---|
| Local data layer (watches as events, stable IDs) | ✅ Built, tested |
| Metadata: TMDB + fixtures behind a provider interface | ✅ Verified live |
| Up Next, mark watched, search, watchlist with notes | ✅ Built, smoke-tested |
| Watching Mode: shared reactions, replay, drift correction | ✅ Built |
| Episode comments, spoiler-gated in the database | ✅ Verified live |
| Backend schema + row-level security | ✅ Deployed and verified |
| Offline-first sync with outbox | ✅ Built, live round-trip tested |
| Stats and Year in Review | ✅ Built |
| Discovery excluding already-watched | ✅ Built |
| Upcoming calendar + notification granularity | ✅ Built |
| Browser extension + automatic Watching Mode sync | ✅ Built (site selectors unverified) |
| Anime season correction via AniList | ✅ Verified live |
| Push notification delivery | ✅ Built, not yet deployed |
| Local bridge (Roku ECP, desktop MPRIS) | ✅ Built, not verified on hardware |
| Remote drawer + relay server | ✅ Built, relay verified end to end |
| Audio fingerprinting + crowd-sourced references | ✅ Built, accuracy unverified on real audio |
| Half-star ratings, poster overrides | ✅ Built |
| Lists mixing film and TV | ✅ Built |

## Running it

```bash
cd app
npm install
npm run dev
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
```

Applies `supabase/migrations/` over HTTPS via the Management API, then verifies the
tables landed and reports any table left without RLS. This route exists because the
direct database host is IPv6-only and the IPv4 poolers listen on ports that egress
filtering commonly blocks. Pasting the SQL into the dashboard's SQL Editor works too.

### Tests

```bash
cd app
npx vitest run                        # 249 tests; live suites skip without credentials
SB_SECRET=sb_secret_... npx vitest run # includes live Supabase round-trips
npm run build
npx vite preview &
node smoke.mjs                        # 23 end-to-end checks in a real browser
```

Row-level security is tested against real Postgres via PGlite, running the deployable
migration SQL as an unprivileged role — Postgres bypasses RLS for superusers and table
owners, so testing as the owner would make every assertion pass vacuously.

The browser extension lives in [`extension/`](extension/README.md) and the device bridge
in [`bridge/`](bridge/README.md); both have their own builds and tests.

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

```
app/                    The PWA
  src/domain/           Types, ID scheme
  src/data/             Dexie schema, repository, import/export
  src/metadata/         Provider abstraction, TMDB, fixtures
  src/sync/             Auth, offline outbox, sync engine, Supabase adapter
  src/watching/         Playback clock, reaction stream, extension bridge
  src/social/           Comments and the effort filter
  src/stats/            Runtime-weighted stats
  src/discover/         Recommendations that exclude what you have seen
  src/calendar/         Upcoming episodes and notification granularity
  src/screens/          UI
  src/fingerprint/      Landmark-hash fingerprinting and microphone capture
  src/remote/           Remote drawer and bridge connection
extension/              Browser extension (MV3)
bridge/                 Local companion for device control (Roku ECP, MPRIS)
relay/                  WebSocket relay pairing the app to a bridge
supabase/               Schema, RLS policies, push edge function
scripts/                Migration runner
docs/research/          Research notes and decisions
```

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
   with the implementation, including where the research turned out to be wrong, what was
   deliberately skipped, and exactly which layers are and are not verified

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming
availability data is provided by JustWatch.
