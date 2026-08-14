# Reviewies — Research Phase 1: Landscape, Constraints, Requirements

**Date:** 14 August 2026
**Status:** Research complete, no implementation decisions locked
**Purpose:** Establish what we're building, what already exists, what users actually want,
and — most importantly — what the hard technical and legal constraints are before we write code.

---

## 0. TL;DR — the five things that actually matter

1. **You may be able to get your TV Time library back.** If the app is still installed on your
   iPhone and you haven't deleted it or reinstalled it, your data is very likely still sitting in
   a local SQLite cache on the device. There is a working tool that extracts it from an iOS
   backup. **This is time-sensitive** — see §1. Do this before anything else.

2. **The metadata source is the single biggest constraint, and it's a licensing problem, not a
   technical one.** TMDB is free and excellent but is **non-commercial only**, forbids caching
   data beyond 6 months, and forbids AI/ML use. TheTVDB (better niche/anime coverage) is
   effectively paid. This shapes the product more than any framework choice. See §4.

3. **"Never lose your data again" is the product's actual thesis**, not a footnote. It's why you
   need this app. It argues directly for a local-first architecture with permanent, one-click
   export — which is also the cheapest architecture to run. See §6 and §7.

4. **The market gap is real.** Trakt has the best sync but [doubled its price to $60/yr and capped
   free watchlists](https://alternativeto.net/news/2025/2/trakt-tv-has-set-stricter-limits-for-free-users-and-raised-vip-subscription-prices-by-100-/),
   annoying its base. Simkl logs well but is weak socially. Serializd is pretty but has
   [near-nonexistent discovery](https://www.achriom.com/blog/serializd-vs-tv-time/). Letterboxd is
   adding TV but its community is [actively hostile to the idea](https://www.resetera.com/threads/following-the-tv-time-shutdown-letterboxd-confirms-they-are-still-working-on-adding-tv-shows-to-their-platform.1567171/)
   and it's [reportedly in acquisition talks with Netflix](https://techcrunch.com/2025/11/20/letterboxd-to-launch-new-movie-rental-feature-in-december). Nobody
   currently does *TV + film + good discovery + good social + no artificial limits*.

5. **A PWA is a genuinely good choice for iOS in 2026** — better than it was even two years ago —
   but it has three specific limits you must design around: manual install, a 50 MB Cache API cap,
   and push only working after home-screen install. See §5.

---

## 1. URGENT: recovering your own TV Time data

TV Time shut down on 15 July 2026. Whip Media pivoted to enterprise AI, said the free app wasn't
sustainable and that there wasn't enough demand for a paid one. All personal data was deleted
after that date, and the official GDPR export tool (`gdpr.tvtime.com`) is gone.

**But the server export was never the only copy.** TV Time cached server responses locally, as
plain JSON inside a SQLite database called `DioCache.db`. If that file still exists on your phone,
your library still exists.

### The recovery path

[`Marak123/tvtime-rescue-data`](https://github.com/Marak123/tvtime-rescue-data) reads a normal
iTunes/Finder/iMazing iOS backup, pulls `DioCache.db` out of it, and reconstructs your library.

**Prerequisites — all must be true:**
- TV Time is *still installed* on the iPhone/iPad, **or** you have a device backup made before you
  deleted it
- You have not reset the phone or reinstalled the app
- Access to a computer (Windows/Mac/Linux) to take the backup

**What it produces:**
- `TVTime.html` — a browsable page with posters, titles, genres, watched dates, episode progress
- CSVs — movies, series, watch history, episodes
- **Ready-made import files for Trakt, Letterboxd, Simkl and IMDb**
- A markdown summary report

**Caveats:**
- It's the app's *cache*, so it reflects what the app had last loaded. Usually complete or close
  to it, but not a guaranteed full account export.
- Episode-level watched status is partial unless you supply a free TheTVDB API key for enrichment
- iOS/iPadOS only

### Action items

- [ ] **Check whether TV Time is still on your phone. Do not delete it.**
- [ ] Take an unencrypted (or encrypted, with password) backup via Finder/iMazing **now**, before
      anything else. iOS storage pressure or an OS update could evict app data.
- [ ] Run the rescue tool, keep the CSVs
- [ ] Those CSVs become **test fixture #1** for Reviewies' importer — we design the import format
      around real data, and your own library becomes the seed dataset for development

Even if recovery only partially works, whatever comes out is far better than starting from zero,
and it gives us a realistic-shaped dataset to build against.

---

## 2. Why this app should exist (the strategic case)

### What happened to the incumbents

| App | Status / recent moves | Consequence |
|---|---|---|
| **TV Time** | Dead, 15 Jul 2026. 25M registered users, 26M installs. Parent pivoted to enterprise AI. | ~26M people displaced, actively looking |
| **Trakt** | Raised VIP $30 → $60/yr; free tier capped (2 lists, 100 items each; watchlist/collection caps; free users limited to one connected streaming app). Closed the feedback thread. | Users call it ["low-key predatory"](https://lemmy.world/post/24581115); goodwill damaged |
| **Letterboxd** | TV support "in development". PE owner selling 60% stake; [Netflix reportedly among bidders](https://techcrunch.com/2025/11/20/letterboxd-to-launch-new-movie-rental-feature-in-december). Community fears film-logging gets "overrun by people binge-watching Friends". | Adding TV reluctantly, to a hostile base, under ownership uncertainty |
| **Simkl** | Solid free tier, good auto-tracking, anime as first-class | Weak social layer — ["better at logging than at community"](https://www.achriom.com/blog/best-tv-tracking-apps/) |
| **Serializd** | Letterboxd-style TV reviews, clean aesthetic | ["Discovery features are basically non-existent"](https://www.achriom.com/blog/serializd-vs-tv-time/); reports of logging bugs |

### The gap

Nobody currently offers **TV and film in one library, with episode-level granularity, genuine
discovery, a social/review layer worth reading, and no artificial free-tier limits.**

Trakt has sync but paywalls the basics. Simkl has breadth but no soul. Serializd has soul but no
discovery. Letterboxd has the best review culture in the space but is film-first, TV-reluctant,
and possibly about to be bought by a streaming company.

### Our unfair advantages

- **Single-user-first.** We're not running a 25M-user service, so free-tier economics that broke
  Trakt and TV Time don't apply. No artificial caps, ever.
- **Local-first.** The data lives on your device. A shutdown of *our* server is an inconvenience,
  not a bereavement. This is the direct, structural answer to the thing that hurt you.
- **No growth pressure.** We can optimise for the experience rather than engagement metrics —
  which is precisely what users say they want after watching three apps enshittify in a row.

---

## 3. What users actually want (evidence)

### ⚠️ Source caveat — read this

You specifically asked for Reddit research. **Reddit is not accessible from this environment** —
`reddit.com` is blocked to the crawler (403 at their edge), the public JSON API returns 403, and
the mirror instances I tried are either down or behind Anubis anti-bot challenges. I could not
read r/tvtime, r/trakt, r/Serializd, or r/Letterboxd directly, and the web-search backend appears
to filter reddit.com out of results entirely.

**What I used instead**, which is arguably higher-signal because it's structured and vote-ranked:
- **Trakt's official roadmap and forums** (`roadmap.trakt.tv`, `forums.trakt.tv`) — public,
  votable feature requests from the most engaged users in the category
- **Hacker News threads** via the Algolia API — full comment trees on Letterboxd's decline, TV
  logging habits, and the Netflix acquisition rumour
- **App Store / Play Store review summaries** for Serializd, Simkl, Moviebase
- **AlternativeTo** user comparisons and news
- Comparison writeups (Achriom, Moviebase) that themselves aggregate community sentiment

**This is a real gap in the research.** If you want the Reddit layer specifically, the practical
fix is for you to pull a few threads manually (r/tvtime shutdown megathread, r/trakt reaction to
the 2026 limits, r/Serializd feature requests) and drop them in `docs/research/` as raw text. I'll
fold them into a revision. It's worth doing — Reddit is where the emotional texture lives, and
that's exactly what shapes feature priorities.

### Demand signals found

**From Trakt's roadmap** (recurring, user-voted):
- Better discovery — recommendations that **exclude already-watched content** and support real
  filtering. This complaint recurs constantly.
- "Continue watching" should show **episodes remaining**, not just a "NEW" badge
- **Notification granularity** — premieres and finales only, not every single episode
- **Calendar integration** — export release dates to a real calendar
- Watchlist front-and-centre on the home screen, in the user's chosen order and filters
- View TV library **by show** (collapsed), expandable to episodes
- Stats scoped to 30 days / year-to-date, not just all-time
- A large cluster of requests are **restorations of features removed in Trakt v2** — a warning
  about redesigns that drop functionality

**From Hacker News:**
- On Letterboxd reviews: *"you have to wade through a mountain of terrible one-liners from
  wannabe comedians... I wish they had a character or sentence length filter for reviews that
  could be toggled on, for those of us who aren't looking for a 'Twitter for movies' experience."*
  → **Review quality filtering is an unserved need.**
- The single most common bare-minimum ask: *"a place to save movies/shows that people recommend to
  me + it telling me what streaming service it's available on."*
- Strong desire for **data portability and non-fragile platforms**: *"There's not much Letterboxd
  does that cannot be federated... I'm not opposed to Letterboxd dying if it means people consider
  an alternative that is less fragile."*
- Repeated "this too shall be enshittified" fatalism — trust is the scarce resource here

**From Serializd reviews:**
- Logging and review-writing friction
- Stats treat a 22-minute comedy the same as a 60-minute drama — **runtime-weighted stats matter**
- Wants easier access to friends' profiles, lists, and currently-watching

**What TV Time did that people will miss** (per its store listings and coverage):
- Episode-level marking with per-episode **community comments**, revealed only *after* you mark
  watched — i.e. **spoiler-safe by construction**
- Rate episodes, express reactions, **vote for favourite characters**
- **Badges** for watching/voting/interacting
- **Stats** — time spent, graphs, rankings; the annual **REWIND** recap
- **Home/lock-screen widgets** for watchlist and upcoming
- Very broad catalogue including niche and anime
- Notably, TV Time **never offered Trakt sync** — a deliberate lock-in that made the shutdown worse

### Synthesised requirements

The evidence converges on these, roughly in priority order:

1. Fast, low-friction episode marking (the core loop — everything else is secondary)
2. "What do I watch next / what's out now" — a genuinely good upcoming + continue-watching view
3. Where to stream it, per title
4. Watchlist with no caps
5. Discovery that respects what you've already seen
6. Runtime-accurate stats and a year-in-review
7. Diary + reviews with quality controls (length filters, spoiler gating)
8. Notification granularity
9. Full export, always, no questions asked

---

## 4. Data sources — the decisive constraint

This is the section that most shapes the product. Read it before picking a framework.

### TMDB (The Movie Database)

- **Coverage:** Excellent for film, very good for TV, good international breadth
- **Cost:** Free
- **Rate limit:** ~40 req/sec, limited **by IP, not by key** — generous
- **Streaming availability:** Yes — `/watch/providers`, **powered by a JustWatch partnership**,
  per-country, covering stream/rent/buy. This is a big deal: it's the one free route to
  "where can I watch this".

**The catches, and they are sharp:**

| Restriction | Impact on us |
|---|---|
| **Non-commercial only.** Commercial use requires a separate written agreement. "Deriving revenues from the use or provision of TMDB" is prohibited. | Fine for a personal/free app. **Blocks any future monetisation** — subscriptions, ads, even a paid iOS app — without negotiating a licence first. |
| **No caching beyond 6 months** | We cannot build a permanent local metadata mirror. Metadata must be treated as a refreshable cache with a TTL, structurally separate from user data. |
| **No AI/ML use** — including using TMDB content in or to train an AI/ML application | Rules out LLM-powered recommendations built on TMDB content. Any "smart" features must be computed from *your own* watch data, not TMDB's corpus. |
| **Attribution mandatory** — TMDB logo, less prominent than ours, plus the exact "not endorsed, certified, or otherwise approved by TMDB" notice | Design requirement, must be in the UI from day one |
| Watch-provider data must be **attributed to JustWatch** | Second mandatory attribution |
| Watch providers return **no deep links** — only "it's on Netflix" plus a link to TMDB's own `/watch` page | Tapping a provider sends users to TMDB, not into the Netflix app. Real deep links need a direct JustWatch partnership. |

**The 6-month cache rule has a clean architectural answer** and it happens to be the right design
anyway: **two separate stores.** User data (what you watched, when, your ratings, reviews, lists)
is ours, permanent, fully exportable. Metadata (titles, posters, synopses, episode lists) is a
TTL'd cache keyed by TMDB ID, refreshable and disposable. If TMDB access ever disappears, your
history survives with stable IDs and re-hydrates from any other source. This also makes the export
honest — we export *your* data, not TMDB's.

### TheTVDB

- **Coverage:** Historically the strongest for TV, especially niche, international and anime.
  Critically, it supports **multiple episode orderings** — aired, DVD, absolute — coexisting.
- **Cost:** This is the problem. v4 is licence-based:
  - Negotiated (often free) licences for open-source/community projects
  - Paid commercial licences by revenue tier
  - Or a **user-supported model** where every end user supplies their own PIN from a
    **$11.99/yr TheTVDB subscription**

**Verdict:** Not viable as the primary source for a general app — you can't ask users to pay a
third party $12/yr to use your free app. Two legitimate uses:
1. Apply for a community/open-source licence, since Reviewies plausibly qualifies
2. Support it as an **optional power-user enhancement** where a user supplies their own PIN — this
   is exactly the model the TV Time rescue tool uses for enrichment

### TVmaze

- Free tier with a permissive-ish licence, strong on **episode air dates and schedules**
- Weaker on artwork and film (it's TV-only)
- **Good candidate as a secondary source for the calendar/upcoming feature**, which is one of our
  top-priority views

### The anime / episode-ordering problem

This directly affects your "no matter how niche" requirement, so it's worth understanding.

TMDB mandates **absolute episode numbering** for anime and adds long-running continuous-numbered
series as a single season. TVDB allows absolute *and* seasonal ordering to coexist. The result is
[ongoing editorial conflict on TMDB](https://www.themoviedb.org/talk/697d0680d564e13094e4e270),
where the single-season rule gets applied to shows that genuinely do have seasons.

**Practical consequence:** if you track anime, TMDB alone will sometimes present a show as one
1000-episode season where you'd expect seasons. Mitigations:
- Store progress against **stable episode IDs**, never against "S3E4" strings, so a metadata
  re-ordering upstream doesn't corrupt your history
- Consider AniList (free, well-documented GraphQL API) as an anime-specific supplementary source
- Offer a per-show ordering preference if this becomes a real annoyance

### Recommendation

**Start TMDB-only.** It's free, broad, fast, and uniquely gives us streaming availability.
Architect the metadata layer behind a **provider interface** from day one so TVmaze (calendar),
TheTVDB (optional user PIN), and AniList (anime) can slot in later without touching user data.

**Flag for you:** the non-commercial restriction is the one decision worth making consciously
*now*. If Reviewies is a personal app you and friends use, TMDB is perfect and free forever. If
you ever want to charge for it or ship it on the App Store as a paid app, you need a TMDB
commercial agreement first. Building on TMDB doesn't prevent that, but it does mean a conversation
with them before any money changes hands.

---

## 5. Platform: PWA on iOS in 2026

Good news: this is the best it has ever been.

### What works

- **Installable** via Share → Add to Home Screen. As of iOS 26, sites added to the home screen
  **open as web apps by default** rather than Safari tabs.
- **Push notifications work** — the Push API is available to home-screen web apps, and Safari 18.4+
  supports **Declarative Web Push**. This covers our "new episode is out" notification requirement.
- **Offline** via service worker — full app shell, and the local database keeps working
- **Storage persistence:** Safari's 7-day ITP eviction of script-writable storage (IndexedDB,
  localStorage, service worker registrations) **does not apply to home-screen web apps**. An
  installed PWA with `display: standalone` or `fullscreen` in its manifest maintains its own
  usage counter and is exempt from the Safari-wide 7-day tally. This is what makes a local-first
  design viable on iOS at all.
- **Persistent Storage API** (Safari 17+) can request explicit protection from eviction — note it
  requires notification permission to take effect, which we'll be requesting anyway

### What doesn't, and how we design around it

| Limit | Mitigation |
|---|---|
| **Push requires home-screen install.** No push from a Safari tab. | Make install a deliberate, well-designed onboarding step, not an afterthought. The app should explain *why* installing unlocks notifications. |
| **No automatic install prompt on iOS** — the user must use the Share menu manually | A clear, illustrated "Add to Home Screen" walkthrough on first visit, iOS-specific |
| **Cache API capped at ~50 MB per partition** | Do **not** bulk-cache posters. Cache the app shell and a small working set; stream images from TMDB's CDN with normal HTTP caching. Keep IndexedDB for structured data, which is far more space-efficient. |
| Storage still evictable under device storage pressure (LRU) | Request persistent storage; make server sync the durability backstop; make export trivial |
| No home-screen/lock-screen widgets — a genuinely loved TV Time feature | **Cannot be replicated in a PWA.** This is the strongest single argument for an eventual native wrapper. Note it as a known gap. |

### Path to a native app later

Build the PWA as a standard web app and wrap it with **Capacitor** when you want App Store
presence. Capacitor gives native push, widgets (via a small native extension), Shortcuts/Siri
integration, and App Store distribution while reusing essentially all the code. This is a
deliberate, low-cost option to keep open — it mainly means avoiding web-only architectural
assumptions and keeping the UI touch-first.

**Cost note:** the Apple Developer Program is $99/yr. You mentioned wanting to avoid that for now,
which is exactly right — the PWA route gets you a real home-screen app with push for $0.

---

## 6. Proposed product shape

### The thesis

> **Your watch history is yours. It lives on your device, it exports in one click, and no company
> shutting down can take it from you again.**

Everything else is features. This is the reason the app exists, and it should be visible in the
product — a prominent, always-available export; an honest "here's where your data lives" screen.

### MVP — the thing that must work perfectly

Deliberately small. The core loop is *mark an episode watched*; if that isn't instant and
delightful, nothing else matters.

- Search TV + film (TMDB), add to library
- **Up Next** — the home screen. What's ready to watch, with episodes-remaining counts, not a
  vague "NEW" badge
- Mark episode watched — one tap, optimistic, works offline
- Season/show progress view
- Watchlist, uncapped
- Where to watch (TMDB/JustWatch providers, per-country)
- **Import** — TV Time rescue CSVs first, then Trakt/Simkl/Letterboxd CSV formats
- **Export** — full JSON + CSV, one click, no account needed
- Installable PWA with offline support

### v1 — the reasons to keep using it

- Calendar / upcoming, with granular notifications (premieres & finales only, or every episode —
  user's choice)
- Diary — a chronological log of what you watched and when
- Ratings and reviews, at episode / season / show / film level
- Stats: **runtime-weighted** (a 22-min comedy ≠ a 60-min drama), scoped to 30d / YTD / all-time
- Lists, with sharing
- Discovery that **excludes what you've already watched** — the single most-requested Trakt fix

### Later — differentiation

- **Year in Review** (the REWIND replacement) — genuinely one of the most-loved TV Time features
- Social layer, spoiler-safe by construction: per-episode discussion revealed only after you've
  marked it watched. TV Time got this exactly right and it's the feature most worth stealing.
- **Review quality controls** — minimum-length filter, hide one-liners. Directly addresses a real,
  unserved Letterboxd complaint and is trivially easy to implement.
- Character voting / reactions (TV Time's most distinctive light-social feature)
- Badges — but tied to genuine milestones, not engagement farming
- Native wrapper for widgets + real push

### Explicit non-goals

- Automatic scrobbling from Plex/Kodi/Netflix. Trakt and Simkl have years of head start and it's a
  maintenance treadmill. Manual marking done *very* well beats mediocre automation.
- A social network. The social layer should serve the tracking, not the other way round.
- Anything requiring us to be a business — no ads, no subscriptions. TMDB's terms forbid it and
  the whole premise is not repeating TV Time's failure mode.

---

## 7. Proposed architecture

### Shape

**Local-first PWA with an optional sync server.** Three layers, per current local-first practice:

1. **Service worker** — app shell, offline capability
2. **Local database** — IndexedDB via **Dexie.js**, the single source of truth for user data.
   Reads and writes never wait on the network. (OPFS-backed SQLite/WASM is the more powerful
   ceiling, but is overkill here and costs bundle size.)
3. **Sync engine** — a write queue with last-write-wins at field level. Field-level LWW resolves
   the overwhelming majority of conflicts for this data shape; CRDTs are not warranted. The
   operations are naturally idempotent — "episode X watched at time T" either happened or didn't.

### Data separation (non-negotiable)

```
user_data/     Yours. Permanent. Exportable. Keyed by stable external IDs.
               watches, ratings, reviews, lists, watchlist, settings
metadata_cache/  TMDB's. TTL'd (< 6 months, per their terms). Disposable.
               shows, seasons, episodes, films, people, providers
```

This satisfies TMDB's caching restriction, makes export legally and ethically clean, and means
losing the metadata provider never costs you your history.

### Stack recommendation

| Layer | Choice | Why |
|---|---|---|
| Framework | React + Vite, or SvelteKit | Both are fine. React if you want the larger ecosystem and an easier Capacitor path; Svelte for a smaller bundle and less ceremony. |
| Local DB | Dexie.js (IndexedDB) | The pragmatic standard; good TypeScript support, good migration story |
| PWA | Vite PWA plugin (Workbox) | Handles manifest, service worker, precaching |
| Styling | Tailwind | Fast iteration, and this app is heavily visual/poster-driven |
| Backend | Deferred — start with **no server at all** | MVP works entirely local. Add sync only when multi-device becomes a real need. |
| Later sync | Supabase or a small Postgres API | Straightforward auth + row-level security; can be self-hosted |
| Native later | Capacitor | Reuses the whole codebase; unlocks widgets and native push |

**Strong recommendation: ship the MVP with no backend whatsoever.** Everything in IndexedDB, TMDB
called directly from the client. Zero hosting cost, zero ops, zero data-breach surface, and it
proves the core loop. Add a sync server only when you actually want your library on two devices.
Note the tradeoff: a client-side TMDB key is visible to anyone who looks — acceptable for a
personal non-commercial app, but it's the first thing a server would fix.

---

## 8. Open questions for you

These change the design meaningfully, so they're worth answering before implementation:

1. **Is TV Time still installed on your phone?** Determines whether we build the importer around
   real recovered data or synthetic fixtures. (See §1 — please check before anything else.)
2. **Just you, or you and friends?** Single-user means no auth, no server, no moderation — vastly
   simpler. A social layer is only worth building if there are actual people in it.
3. **Any chance you'd want to monetise this later?** If yes, we need a TMDB commercial
   conversation before building. If it's personal/free forever, TMDB is settled.
4. **How much do you care about anime?** If it's a significant part of your watching, that raises
   the priority of the ordering work and an AniList integration.
5. **Which country for streaming availability?** The providers endpoint is per-country and I should
   default it correctly.
6. **Do you want the social/community layer at all**, or is this primarily a personal tracker with
   great stats? This is the biggest single fork in scope.

---

## 9. Recommended next steps

1. **You:** check your phone for TV Time, take a backup, run the rescue tool (§1)
2. **Me:** prototype the TMDB integration — search, show/season/episode fetch, watch providers —
   and validate coverage against a handful of the most niche shows you watch. This de-risks the
   single biggest assumption in the whole plan.
3. **Me:** design the local data schema around stable IDs and the user/metadata split
4. **Me:** build the Up Next view and the mark-watched loop — the irreducible core
5. Iterate outward from there

---

## 10. Sources

**TV Time shutdown & recovery**
- [TechCrunch — TV Time is shutting down as company focuses on AI](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/)
- [MacRumors — Show tracking app TV Time shutting down](https://www.macrumors.com/2026/07/02/show-tracking-app-tv-time-shutting-down/)
- [TechTimes — 26 million users face permanent watch history deletion](https://www.techtimes.com/articles/319583/20260703/tv-time-closes-july-15-26-million-users-face-permanent-watch-history-deletion.htm)
- [Whip Media support — TV Time is Shutting Down](https://whipmedia.freshdesk.com/support/solutions/articles/68000029988-tv-time-is-shutting-down)
- [Marak123/tvtime-rescue-data — recovery tool](https://github.com/Marak123/tvtime-rescue-data)
- [Achriom — How TV Time data export worked](https://www.achriom.com/blog/export-tv-time-data/)

**Competitors & user sentiment**
- [Trakt roadmap — feature requests](https://roadmap.trakt.tv/)
- [Trakt Forums — Updating Trakt Limits for 2026](https://forums.trakt.tv/t/updating-trakt-limits-for-2026/101592)
- [Trakt Forums — Coming from TV Time? We're here to help](https://forums.trakt.tv/t/coming-from-tv-time-we-re-here-to-help/114199)
- [AlternativeTo — Trakt stricter free limits, VIP price up 100%](https://alternativeto.net/news/2025/2/trakt-tv-has-set-stricter-limits-for-free-users-and-raised-vip-subscription-prices-by-100-/)
- [Lemmy — Trakt list limit discussion](https://lemmy.world/post/24581115)
- [HN — The Rise and (Potential) Fall of Letterboxd](https://news.ycombinator.com/item?id=48463894)
- [HN — Netflix reportedly among parties in talks to buy Letterboxd](https://news.ycombinator.com/item?id=48865960)
- [HN — Ask HN: How do you log TV shows?](https://news.ycombinator.com/item?id=28389598)
- [Letterboxd — Do you support TV shows?](https://letterboxd.zendesk.com/hc/en-us/articles/15269096507407-Do-you-support-TV-shows)
- [ResetEra — Letterboxd confirms TV shows still in development](https://www.resetera.com/threads/following-the-tv-time-shutdown-letterboxd-confirms-they-are-still-working-on-adding-tv-shows-to-their-platform.1567171/)
- [Achriom — TV Time alternatives tested & ranked](https://www.achriom.com/blog/best-tv-tracking-apps/)
- [Achriom — Serializd vs TV Time](https://www.achriom.com/blog/serializd-vs-tv-time/)
- [Moviebase — Trakt vs Simkl](https://moviebase.app/resources/trakt-vs-simkl)
- [Simkl docs — Simkl vs Trakt](https://docs.simkl.org/how-to-use-simkl/faq/frequently-asked-questions/simkl-alternatives/simkl-vs-trakt)
- [Serializd — FAQs](https://www.serializd.com/about)

**Data sources & licensing**
- [TMDB — API Terms of Use](https://www.themoviedb.org/api-terms-of-use)
- [TMDB — Movie Watch Providers reference](https://developer.themoviedb.org/reference/movie-watch-providers)
- [TMDB — TV Series Watch Providers reference](https://developer.themoviedb.org/reference/tv-series-watch-providers)
- [TMDB — Developer FAQ](https://developer.themoviedb.org/docs/faq)
- [TMDB Talk — anime episode ordering debate](https://www.themoviedb.org/talk/697d0680d564e13094e4e270)
- [TheTVDB — Licensed vs. User-supported API Keys](https://support.thetvdb.com/kb/faq.php?id=62)
- [TheTVDB — User Subscriptions](https://thetvdb.com/subscribe)
- [TheTVDB v4 API docs](https://github.com/thetvdb/v4-api)

**PWA / iOS platform**
- [MobiLoud — Do PWAs work on iOS? 2026 guide](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [MagicBell — PWA iOS limitations and Safari support 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Apple Developer Forums — Safari iOS PWA data persistence beyond 7 days](https://developer.apple.com/forums/thread/710157)
- [Smashing Magazine — The architecture of local-first web development](https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/)
- [OpenReplay — Local-first architecture for PWAs](https://blog.openreplay.com/local-first-pwa-architecture/)
