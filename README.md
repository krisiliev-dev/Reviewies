# Reviewies

A TV series and movie companion app — a tracker, diary, and discovery tool built as a
Progressive Web App, with a path to a native iOS app later.

It exists because [TV Time shut down on 15 July 2026](https://techcrunch.com/2026/07/02/popular-tv-tracking-app-tv-time-is-shutting-down-as-company-focuses-on-ai/),
taking ~26 million people's watch histories with it. The goal is to combine what TV Time did
well (episode-level tracking, community, stats, breadth of catalogue) with what Letterboxd does
well (diary, reviews, lists, taste), while making the data genuinely yours — local-first,
exportable at any time, never hostage to someone else's business model.

## Status

**Research phase.** No application code yet.

1. [`docs/research/01-landscape-and-requirements.md`](docs/research/01-landscape-and-requirements.md)
   — competitive landscape, user demand, data-source licensing, iOS PWA constraints
2. [`docs/research/02-decisions-and-revised-architecture.md`](docs/research/02-decisions-and-revised-architecture.md)
   — decisions taken and the resulting architecture (supersedes §7 of the above)
3. [`docs/research/03-reddit-findings-and-new-features.md`](docs/research/03-reddit-findings-and-new-features.md)
   — Reddit community research, plus feasibility of the remote control and Watching Mode
   features. **Contains findings that materially revise 1 and 2** — read this one.
4. [`docs/research/04-remote-architecture-and-feature-gaps.md`](docs/research/04-remote-architecture-and-feature-gaps.md)
   — a PWA-compatible remote control architecture (revises §3 of the above), and feature
   gaps mined from the Letterboxd, Serializd, Simkl and Trakt communities
5. [`docs/research/05-universal-remote-and-timestamp-sync.md`](docs/research/05-universal-remote-and-timestamp-sync.md)
   — whether universal device control is achievable, and every route to knowing the
   current playback timestamp

## Repository layout

```
docs/research/    Research notes, competitive analysis, technical constraints
```
