# Reviewies — Phase 7: What Was Actually Built

**Date:** 24 August 2026
**Purpose:** Reconcile the research documents with the implementation. Where the code
diverged from the plan, this records why — the divergences are more useful than the
agreements.

---

## 1. Where the research was wrong, and how we found out

Three claims from earlier documents did not survive contact with real systems.

### 1.1 TMDB does not systematically flatten anime (docs 2 and 4)

Phases 2 and 4 treated TMDB collapsing long-running anime into one enormous season as a
headline risk, and made AniList integration an MVP requirement on that basis.

Checked against the live API, **One Piece is split across 23 seasons by story arc** —
more useful than absolute numbering, not less. Frieren does show merging, so the problem
is real but occasional rather than systemic.

That downgraded AniList from "MVP requirement" to "worth doing when a specific show is
wrong" — and an earlier revision of this document then used that as grounds to skip it
entirely. That was a step too far, and §3 records the reversal: occasional is not never,
Frieren is a real show someone actually watches, and the correction is now built and
verified live.

Two genuine problems surfaced instead, neither anticipated:

- **Search ranking, not coverage, is the anime problem.** "One Piece" returns the 2023
  live-action above the 1999 anime. Nothing is missing; the wrong thing is on top.
- **Specials are season 0, and season 0 sorts before season 1.** A naive "first unwatched
  episode" offers a recap special instead of episode 1. One Piece has 39 specials. This
  was a live bug in Up Next, now fixed and tested.

### 1.2 The migration was not idempotent, though doc 6 said it was

Postgres has no `create policy if not exists`. Re-running the migration failed the moment
policies existed. Every policy is now dropped first, verified by running it twice.

### 1.3 "Ship with no backend" was withdrawn (doc 1 §7)

Correct for a personal tracker, wrong once the answer to "social?" was yes. Doc 2 records
the reversal. Worth noting the deciding factor was not social at all: **AniList's 90
requests/minute is a global budget that uncoordinated clients cannot respect**, which
makes a server mandatory regardless.

---

## 2. What shipped, mapped to the research that motivated it

| Feature | Motivated by | Notes |
|---|---|---|
| Up Next as the landing screen, one-tap mark watched | "The only important thing is that it opens directly to the page where I can see and mark the next episodes" (r/tvtime) | Excludes specials and unaired episodes |
| Episodes-remaining count | Most repeated Trakt roadmap complaint: a vague "NEW" badge | |
| Watches as events, not booleans | Rewatch counts wanted across r/Letterboxd, r/Simkl, r/Serializd | Schema decision, painful to retrofit |
| Progress keyed to provider episode IDs | Upstream reordering corrupts positional keys | Protects against the anime case when it does occur |
| Watchlist notes | "I have ZERO memory for why they're there" (r/Letterboxd) | Nobody else ships it |
| Spoiler-free quick log and catch-up | "It's a little hard to [avoid ratings] when I have to go to the page to add it" (doc 4 §2.2) | The catch-up picker renders numbers and nothing else |
| Where to watch, per country | Doc 4 MVP item 3 | The country picker is load-bearing: one answer would be wrong for most of the world |
| Free, complete, unauthenticated export | TV Time deleting 26M histories; r/Simkl asking whether paywalling export is even GDPR-compliant | |
| Watching Mode with history replay | Comments, not tracking, were what people valued; danmaku prior art | Replay is what makes it work alone and for old shows |
| Crowd drift correction | Own idea; reuses reaction data already collected | Median-based, silent below 2s |
| Spoiler gating in the database | TV Time's best idea, made structural | RLS policy, not application code |
| Comment effort filter | Triple-sourced: Hacker News and r/Letterboxd, shipped by nobody | Never hides your own or image-bearing comments |
| Runtime-weighted stats | "Half-hour programs can't compete with 45-60 minute programs" (Serializd) | Ranking and bar widths both use time |
| Year in Review | TV Time REWIND was among the most-loved features | |
| Discovery excluding watched | Most repeated Trakt complaint | Exclusion is the module's purpose, not a filter |
| Notification granularity | Top Trakt roadmap request | Premieres/finales as the default |
| Browser extension | Cleanest sync mechanism for browser watching; Universal Trakt Scrobbler prior art | Exact position, no hardware |
| AniList season correction | TMDB merges some anime; anime is core to this user | Episode IDs preserved, so history survives the re-cut |
| Push delivery | Notification granularity is pointless without it | Idempotent claiming; granularity enforced twice |
| Local bridge | Docs 4–6; the laptop case needs no extra hardware | Roku ECP and MPRIS behind one adapter interface |
| Audio fingerprinting | Doc 6 sized it as feasible; the universal fallback | Refuses a wrong episode rather than guessing |
| Lists mixing film and TV | The split between Letterboxd and TV Time is the complaint | Adding to one is offered wherever a title appears |
| TV Time rescue CSV import | Doc 1: `tvtime-rescue-data` is the only surviving copy of many people's history | Written against the tool's source, not guessed at |
| Community content warnings | Doc 4 §2.2, the doesthedogdie idea | Advisory only; a `no` vote can argue a wrong flag down |
| Profiles, following, blocking | Social was chosen as day-one scope | No public follower count: the policy does not expose one |

---

## 3. Nothing is deliberately skipped any more

An earlier version of this document listed four features as deliberately skipped. The
user pushed back and was right to: two of those reasons did not hold up.

**Reversed, because the reasoning was wrong:**

- **AniList integration.** Skipped on the grounds that TMDB handles most anime well.
  "Most" was doing a lot of work — Frieren is reported as one 38-episode season when
  its first season is 28 — and anime is central to how this app gets used. Now built
  and verified live.
- **Push delivery.** Called "needs a server we do not have" when Supabase edge
  functions *are* that server. The missing piece was schema plus a handler, not
  infrastructure. Now built.

**Reversed, because it was not my decision to make:**

- **The device bridge.** Deferred over adoption cost — it needs a machine on the user's
  network. That cost is real, but whether to pay it is the user's call, and it is moot
  in the laptop case where the machine running the bridge is the one playing the video.
  Now built, with Roku and MPRIS adapters.
- **Audio fingerprinting.** Judged unnecessary because other mechanisms cover the
  realistic cases. They do, but "sufficient" is not the same as "complete", and the
  sizing work in doc 6 had already shown it feasible. Now built.

**Still genuinely out of scope:**

- **Automatic scrobbling from Plex/Kodi** — a non-goal since doc 2, and unchanged. The
  browser extension delivers most of the value at a fraction of the maintenance, and
  Trakt and Simkl have years of head start on the media-server treadmill.

---

## 4. Verification status — what is proven and what is not

**Proven against real systems:**
- Row-level security, including spoiler gating in both directions, via 10 end-to-end
  checks with real users and JWTs against the deployed project, plus 22 PGlite tests
  running the deployable SQL as an unprivileged role
- The sync adapter round-tripping: push, pull, idempotency, tombstones, cursor
  advancement, error classification
- TMDB coverage of niche and non-English television (Detectorists, Kaamelott, Dark, The
  Bureau, Nathan for You), stable episode IDs, per-country watch providers
- The full app flow in a real browser: 37 checks, against a credential-free build

**Not proven:**
- **The app calling TMDB or Supabase from a browser.** Headless Chromium in the build
  sandbox cannot reach external hosts through the proxy. Both are verified at the layer
  below, so this is expected to work, but it wants a local `npm run dev` to confirm.
- **The extension's per-site CSS selectors.** Written from documented selectors; streaming
  services redesign without notice. Breakage degrades to page-title parsing rather than
  failing.
- **Migrations 0007 and 0008 in the live project.** Both are tested against real
  Postgres via PGlite but neither has been applied to the deployed project, for the
  same reason as push: the access token was rotated. Until they are, content warnings
  render empty and the block list cannot show handles — neither fails, but neither
  works.
- **The signed-in People screen.** The signed-out and unconfigured branches are
  checked in a real browser; following, blocking and handle changes have only been
  exercised against Postgres directly, because the sandbox browser cannot reach
  Supabase.
- **Push notification delivery end to end.** Schema and scheduler are tested against
  real Postgres and the edge function is written, but nothing has been deployed: the
  Supabase personal access token was rotated, as intended. Needs a fresh token, VAPID
  keys, and the pg_cron schedule in `supabase/README.md`.
- **The bridge against live hardware.** Adapters are tested against captured protocol
  responses. ECP and MPRIS are stable, well-documented protocols, but no real Roku or
  desktop player has been driven by this code. The relay it dials has since been built
  and verified end to end over real WebSockets, so the untested surface is now only the
  hardware conversation itself.
- **Fingerprint accuracy on real audio.** The algorithm is tested on synthetic
  spectrograms including a deliberately degraded "microphone" case, and correctly
  refuses to match a different episode. Real rooms, real speakers and real compression
  are a different test. The contribution flow now has a UI, but no reference has been
  built from a real recording.

---

## 5. The research gap that remains

Reddit access succeeded via Arctic Shift after the direct routes failed, and it changed
the plan substantially (doc 3). But the mining was targeted at r/tvtime, r/Letterboxd,
r/Serializd, r/Simkl and r/trakt around the shutdown window. A broader or more recent
sweep would likely surface more, particularly from the eleven successor apps that have
launched since — several of which now have their own communities and complaint patterns
worth reading.

---

## 6. Honest assessment of position

Phase 3 concluded the "TV Time replacement" race was lost to Bingers, built by TV Time's
own co-founder with the brand and the comment archive. Nothing since changes that.

What has changed is that the differentiator is now real rather than planned. Watching
Mode works: shared reactions, replayed from history, spoiler-safe by construction, with
exact sync when the extension is present and self-correcting sync when it is not. No
competitor has anything comparable, and none of the eleven successors is building toward
it.

The two things most likely to matter next are unglamorous: the comment archive
integration (doc 3 §2.6, with its unresolved legal questions understood), which solves
cold-start for the social layer; and a browser check against real credentials, which is
the last unverified layer in the stack.
