# Reviewies — Research Phase 2: Decisions & Revised Architecture

**Date:** 14 August 2026
**Supersedes:** the architecture recommendation in `01-landscape-and-requirements.md` §7
**Status:** Decisions locked, ready to plan implementation

---

## 1. Decisions taken

| Question | Decision | Consequence |
|---|---|---|
| Scope | **Social from the start** | Backend required from day one. Auth, social graph, moderation are in scope, not deferred. |
| Monetisation | **Maybe someday** | TMDB commercial licence becomes a real gate before any revenue. Provider abstraction is mandatory, not nice-to-have. |
| Anime | **Core to the experience** | AniList integration and cross-database ID mapping are first-class MVP concerns, not later polish. |

These three answers invalidate the "ship with no backend" recommendation from phase 1. That advice
was correct for a personal tracker and is wrong for a social product. Revised plan below.

---

## 2. What changes because of "social from the start"

### The backend is no longer optional

A social layer needs: identity, a follow graph, server-authoritative reviews and comments, spoiler
gating, notifications, and moderation. None of that works client-side.

**Recommendation: Supabase.** Postgres, auth, row-level security, realtime subscriptions, and
storage in one package, with a self-hosting escape hatch if the managed service ever goes the way
of TV Time. Row-level security is a particularly good fit here — spoiler gating and privacy
settings express naturally as RLS policies rather than scattered application checks.

### One large silver lining

Moving to a server **fixes the exposed API key problem** flagged in phase 1. TMDB (and AniList)
calls now go through our backend, which means:
- Keys stay secret
- We can cache metadata server-side once, shared across all users, instead of every client
  re-fetching — dramatically fewer upstream calls
- Rate limits become manageable (AniList's 90 req/min is a *global* budget, and would be
  impossible to respect from uncoordinated clients)
- We control the 6-month TMDB cache TTL centrally and provably

**The AniList rate limit alone makes a server mandatory.** 90 requests per minute across the whole
app is not something clients can be trusted to coordinate.

### Still local-first for *your* data

The local-first thesis survives and still matters — it's the reason the app exists. The split:

- **Personal tracking data** (watches, ratings, progress, watchlist, lists) — written to IndexedDB
  first, always available offline, synced to the server in the background. Marking an episode
  watched must never block on the network.
- **Social data** (reviews, comments, follows, feeds) — server-authoritative, cached locally for
  reading, requires connectivity to write.

This gives the best of both: the core loop stays instant and offline-capable, while social
features get the consistency they need. And the export promise is unaffected — your history is
still fully yours and still leaves in one click.

### Moderation is now in scope

Worth being clear-eyed: any social product needs it. Minimum viable version:
- Report/flag on reviews and comments
- Block and mute users
- **Spoiler gating by construction** — per-episode discussion visible only after you've marked that
  episode watched. TV Time's best idea, and it doubles as a moderation mechanism because it
  structurally prevents the most common bad behaviour in TV communities.
- **Review length filter** — the unserved Letterboxd complaint from phase 1. Cheap to build,
  genuinely differentiating.

---

## 3. What changes because anime is core

### The problem, restated

TMDB mandates absolute episode numbering for anime and collapses long-running
continuous-numbered series into a single season. A show you think of as four seasons may appear as
one 100-episode block. For someone who watches a lot of anime, this is a daily annoyance, not an
edge case.

### The solution: multi-source with an ID mapping layer

The anime tooling community has already solved cross-database identity, and the datasets are
public and actively maintained:

| Resource | What it gives us |
|---|---|
| [`Fribb/anime-lists`](https://github.com/Fribb/anime-lists) | The canonical merged ID mapping — MAL, AniList, AniDB, Kitsu, TMDB, TVDB, IMDb. Auto-updated. |
| [`anibridge/anibridge-mappings`](https://github.com/anibridge/anibridge-mappings) | **Episode-level** mapping across AniDB, AniList, MAL, TMDB, TVDB, IMDb. Released daily. This is the important one — it maps *episodes*, not just series. |
| [`arm-server`](https://arm.haglund.dev/docs) | A hosted ID-mapping API built on Fribb's data, refreshed every 24h. Useful as a fallback or to avoid hosting our own. |
| [`Otaku-Mappings`](https://github.com/Goldenfreddy0703/Otaku-Mappings) | Broader mapping incl. Simkl and Trakt IDs |

**Plan:** ingest `anibridge-mappings` into our own Postgres on a daily job. That gives us
episode-level correspondence between TMDB's flattened view and AniList's seasonal view, which is
exactly the missing piece. Self-hosting the mapping avoids a hard runtime dependency on a
community service.

### AniList as the anime metadata source

- **Free** for commercial applications under **$150/month revenue**; above that needs a commercial
  licence. Notably more generous and clearer than TMDB's blanket non-commercial rule.
- GraphQL, no API key needed for public reads
- **Rate limit: 90 requests/minute** — tight, and a strong argument for aggressive server-side
  caching
- **Prohibited:** using the API as backup/data storage; hoarding or mass collection of data. Same
  shape of constraint as TMDB's 6-month rule — treat it as a cache, never a mirror.
- AniList is not currently granting rate limit increases, so we must design within 90/min

### Per-show ordering preference

Because we'll have episode-level mappings, we can offer per-show ordering (aired / absolute /
seasonal) and store progress against **stable internal episode IDs** that carry mappings to every
external database. This is the single most important schema decision in the whole project: never
store progress as `"S3E4"`, always as an internal episode ID with a mapping table. Upstream
re-orderings then can't corrupt history, and switching metadata providers becomes possible.

---

## 4. What changes because of "maybe monetise"

**TMDB is now a live risk rather than a settled question.** Their terms prohibit deriving revenue
without a separate written agreement — that covers subscriptions, ads, and a paid App Store
listing. AniList is comfortable (free under $150/mo revenue), but TMDB is our primary source for
everything non-anime.

**Mitigation — do these now, they're cheap now and expensive later:**

1. **Hard provider abstraction.** All metadata access goes through an internal interface
   (`MetadataProvider`) with our own normalised types. No TMDB response shape ever reaches a React
   component. This makes TMDB swappable rather than load-bearing.
2. **Stable internal IDs with external mappings.** Already required for anime; doubles as
   provider-independence insurance.
3. **Never persist TMDB content beyond the 6-month TTL**, and keep it in a physically separate
   table/store from user data — so "delete all TMDB-derived content" is one statement, and the
   export contains only data we're entitled to give away.
4. **Open the TMDB conversation before, not after, any revenue.** They have a stated commercial
   licensing path (`api@themoviedb.org`). Worth doing early if monetisation becomes concrete.

Also note the **AI/ML restriction**: we cannot build LLM-powered recommendations on TMDB content.
Any "smart" features must be computed from your own watch data and your social graph. That's
actually a decent constraint — collaborative filtering over real watch history tends to beat
generic LLM suggestions for this problem anyway.

---

## 5. Revised architecture

```
┌─ Client (PWA) ─────────────────────────────────────────────┐
│  React + Vite, Tailwind, Workbox service worker            │
│                                                             │
│  IndexedDB (Dexie) — local-first, source of truth for:     │
│    watches · progress · ratings · watchlist · lists         │
│    + write queue for background sync                        │
│                                                             │
│  Read-through cache for: metadata, social feeds             │
└────────────────────────┬────────────────────────────────────┘
                         │  sync + social API
┌────────────────────────▼────────────────────────────────────┐
│  Supabase (Postgres + Auth + RLS + Realtime)               │
│                                                             │
│  user_data/      watches, ratings, lists      (permanent)  │
│  social/         reviews, comments, follows, reports        │
│  metadata_cache/ TMDB + AniList          (TTL'd, < 6 mo)   │
│  anime_mappings/ episode-level cross-DB IDs (daily job)     │
│                                                             │
│  Edge functions: metadata proxy (keys secret, rate limited) │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼────────────────┬──────────────────┐
      TMDB          AniList        anibridge-mappings   TVmaze
   (film + TV,    (anime,          (episode-level      (air dates,
    providers)     90 req/min)      ID mapping)         optional)
```

### Sync model

Field-level last-write-wins, as in phase 1 — still correct. The operations are naturally
idempotent ("episode X watched at time T" either happened or it didn't), so CRDTs remain
unwarranted. Social writes go straight to the server and don't participate in the offline queue.

### Stack

| Layer | Choice | Note |
|---|---|---|
| Frontend | React + Vite + TypeScript | Larger ecosystem, and the cleanest Capacitor path for the eventual native app |
| Styling | Tailwind | Poster-heavy, highly visual UI |
| Local DB | Dexie.js (IndexedDB) | Personal data + offline write queue |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, precache |
| Backend | Supabase | Postgres, auth, RLS, realtime; self-hostable escape hatch |
| Metadata proxy | Supabase edge functions | Keeps keys secret, centralises rate limiting and TTL |
| Mapping ingest | Scheduled job → Postgres | Daily pull of `anibridge-mappings` |
| Native later | Capacitor | Widgets + native push, reusing the codebase |

---

## 6. Revised MVP scope

Social-from-day-one expands the MVP, so the ordering matters more. Build in this sequence — each
stage should be independently usable:

**Stage 1 — the core loop (no social yet, but on the real backend)**
- Auth
- Search TV + film + anime, add to library
- **Up Next** home view with episodes-remaining counts
- Mark episode watched — one tap, optimistic, offline-capable
- Watchlist, uncapped
- Where to watch (TMDB/JustWatch providers)
- Import (TV Time rescue CSVs first, then Trakt/Simkl/Letterboxd)
- Export — full JSON + CSV, one click
- Installable PWA

**Stage 2 — anime correctness**
- AniList integration + mapping ingest
- Per-show ordering preference
- Verify against the niche shows you actually watch

**Stage 3 — social**
- Profiles, follow graph
- Reviews + ratings at episode / season / show / film level
- **Spoiler-gated per-episode discussion**
- Review length filter, block/mute, reporting

**Stage 4 — retention**
- Calendar + granular notifications (premieres/finales only, or all)
- Runtime-weighted stats, scoped 30d / YTD / all-time
- Diary
- Discovery that excludes already-watched
- Year in Review

---

## 7. Remaining open questions

1. **Country for streaming availability** — the providers endpoint is per-country; I need a default
2. **Do you want the anime library visually separated** from live-action TV, or unified in one
   library with anime just being shows that happen to have better metadata?
3. **Scale expectation for the social layer** — just you and friends, or public sign-ups? This
   determines how much moderation tooling is genuinely needed versus theatre.

None of these block starting Stage 1.

---

## 8. Sources (phase 2)

- [AniList API — Terms of Use](https://docs.anilist.co/guide/terms-of-use)
- [AniList API — Rate Limiting](https://docs.anilist.co/guide/rate-limiting)
- [AniList API Docs](https://docs.anilist.co/)
- [Fribb/anime-lists — merged anime ID mapping](https://github.com/Fribb/anime-lists)
- [anibridge/anibridge-mappings — episode-level cross-DB mapping](https://github.com/anibridge/anibridge-mappings)
- [arm-server — hosted anime ID mapping API](https://github.com/BeeeQueue/arm-server) · [docs](https://arm.haglund.dev/docs)
- [Goldenfreddy0703/Otaku-Mappings](https://github.com/Goldenfreddy0703/Otaku-Mappings)
- [TMDB — API Terms of Use](https://www.themoviedb.org/api-terms-of-use)
- [TMDB Talk — anime episode ordering debate](https://www.themoviedb.org/talk/697d0680d564e13094e4e270)
