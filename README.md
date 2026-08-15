# Reviewies

A TV series and movie companion app — a tracker, diary, and discovery tool built as a
Progressive Web App, with a path to a native iOS app later.

It exists because [TV Time shut down on 15 July 2026](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/),
taking ~26 million people's watch histories with it. The goal is to combine what TV Time did
well (episode-level tracking, community, breadth of catalogue) with what Letterboxd does
well (diary, reviews, lists, taste), while making the data genuinely yours — local-first,
exportable at any time, never hostage to someone else's business model.

**The differentiator is Watching Mode:** timestamped emoji reactions on a second screen,
replayed from everyone who watched that moment before you.

## Status

Core loop works end to end. Running on sample data until a TMDB token is supplied.

| Area | State |
|---|---|
| Local data layer (watches as events, stable IDs) | ✅ Built, tested |
| Metadata provider abstraction + TMDB + fixtures | ✅ Built |
| Up Next, mark watched, search, watchlist with notes | ✅ Built, smoke-tested |
| Watching Mode (manual sync, reaction replay) | ✅ Built, local-only |
| Import / export | ✅ Built, tested |
| Backend, accounts, shared reactions | ⬜ Not started |
| Browser extension, bridge, fingerprinting | ⬜ Not started |

## Running it

```bash
cd app
npm install
npm run dev
```

Without a TMDB token the app runs on built-in sample data, so it is always launchable.
To use real metadata, create `app/.env`:

```
VITE_TMDB_TOKEN=your_tmdb_v4_read_access_token
```

Note that TMDB is free for non-commercial use only, requires attribution, forbids caching
beyond six months, and forbids AI/ML use. See [research doc 01](docs/research/01-landscape-and-requirements.md) §4.

### Tests

```bash
npm test              # 47 unit tests
npm run build
npm run preview &     # then, in another shell:
node smoke.mjs        # 13 end-to-end checks in a real browser
```

## Architecture in one paragraph

IndexedDB (via Dexie) is the source of truth for user data, so marking an episode watched
never waits on the network. Provider metadata lives in physically separate tables with a TTL,
which is what makes TMDB's six-month caching limit enforceable and keeps exports legally
clean. Watching something is recorded as an **event**, not a boolean, so rewatch counts work.
Progress is keyed to provider episode IDs, never `"S3E4"` strings, because upstream databases
reorder episodes routinely — especially for anime.

## Repository layout

```
app/              The PWA
  src/domain/     Types, ID scheme
  src/data/       Dexie schema, repository, import/export
  src/metadata/   Provider abstraction, TMDB, fixtures
  src/screens/    UI
  src/watching/   Watching Mode: playback clock, reaction stream, emoji
docs/research/    Research notes and decisions
```

## Research

Read these in order; later documents revise earlier ones where the evidence changed.

1. [Landscape and requirements](docs/research/01-landscape-and-requirements.md) — competitors,
   data-source licensing, iOS PWA constraints
2. [Decisions and revised architecture](docs/research/02-decisions-and-revised-architecture.md)
3. [Reddit findings and new features](docs/research/03-reddit-findings-and-new-features.md) —
   **materially revises 1 and 2.** Comments, not tracking, were what people valued; simplicity
   is the loudest demand
4. [Remote architecture and feature gaps](docs/research/04-remote-architecture-and-feature-gaps.md)
5. [Universal remote and timestamp sync](docs/research/05-universal-remote-and-timestamp-sync.md)
6. [Cast/AirPlay and fingerprint sizing](docs/research/06-cast-airplay-and-fingerprint-sizing.md)

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming
availability data is provided by JustWatch.
