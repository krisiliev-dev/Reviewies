# 08 — Second Reddit sweep: five weeks after the shutdown

Doc 7 §5 named the remaining research gap: the first sweep was aimed at r/tvtime,
r/Letterboxd, r/Serializd, r/Simkl and r/trakt **around the shutdown window**, before
anyone had lived with a replacement. This is the follow-up, run on 24 August 2026 —
five weeks after TV Time went dark on 15 July — via Arctic Shift, which still works.

The difference matters. The first sweep captured what people *said they wanted*. This
one captures what they found when they tried fifteen alternatives, which is a much
harsher and more useful signal.

**This document revises doc 4's MVP item 7 (import the TV Time comment archive). See
§5. The recommendation is now the opposite of what doc 4 proposed.**

---

## 1. There is no successor subreddit — the graveyard is the town square

r/bingers, r/Bingers and r/bingersapp are all empty. Every successor is discussed
*inside r/tvtime*, which is still active five weeks on, and where the developers of at
least six trackers now post feature breakdowns directly. The subreddit did not
disperse with the app.

Apps named repeatedly in this window: **Bingers** (by TV Time's co-founder),
**Suite TV**, **Movie Paradise**, **Refract**, **Showly**, **Sofa Time**, **Cinopsys**,
**Bingebase**, **Bingeboxd**, **seenr**, **NextEp**, **Peaklist**, **WeTrakr**,
**Flowt**, **bobin**. That is fifteen, up from the eleven doc 3 counted.

One commenter's estimate of the market, unchallenged in its thread (`1vjuvc3`):

> Of the 25M+ users of TVTime, those who still haven't noticed it's gone are probably
> an immense majority […] Old competitors have absorbed a great amount of the ~500k
> actually-active users, while newer vibecoded alternatives are fighting for the
> remaining scraps (<100k probably).

Doc 7 §6 concluded the "TV Time replacement" race was already lost to Bingers. Nothing
here reverses that. What *has* changed is that the field is now visibly crowded with
near-identical trackers, and the things people complain about are consistent across
all of them — which is where the openings are.

---

## 2. Comment density is the metric people actually use

The single most useful post in this window (`1vn8u81`, 88 pts, 192 comments) is a
methodical comparison by someone who imported into seven apps and then scored each one
on **the number of comments on the latest Ted Lasso episode**:

> Refract (36 comments) […] Showly (18) […] Bingeboxd (3) […] Movie paradise (10)

That is the whole evaluation, and it confirms doc 3's central finding harder than
doc 3 did. Comment density is not a nice-to-have people mention when asked; it is the
number they rank competitors by, unprompted.

The corollary is uncomfortable and worth stating plainly: **a new tracker's social
layer is empty on day one, and users measure exactly that.** Watching Mode's replay
from history is our answer — a reaction stream that is dense from the first watch
because it accumulates across everyone who ever watched that episode, rather than
requiring a live audience. That design decision now looks more load-bearing than it did
when it was made.

---

## 3. The GDPR zip is the recovery path, and everyone imports it badly

This is the loudest practical complaint in the window, and the biggest gap in our own
implementation.

> The GDPR zip file was the method most people used for extracting their TV Time data.
> Up until just very recently, they didn't even have an option to import GDPR zip file
> data.

> importing tv time data into refract from the typical gdpr zip file does not work
> well.

> when I did this, Refract failed to import a lot of my TV Time data, which is the
> exact same thing that has happened with every other app besides Bingers.

Every app in the field is judged on this one file, and most of them fail. We ship a
CSV sniffer and a rescue-tool importer; **we cannot open a zip at all.** That is item 4
on doc 4's MVP list and it is not done.

### 3.1 The WAL detail nobody else has noticed

One comment (`1vqhcwb` thread) contains a precise technical finding worth more than
the rest of the sweep combined:

> check whether the TAR also has `DioCache.db-wal` sitting next to `DioCache.db`. TV
> Time ran SQLite in WAL mode, so the most recent months often live in that `-wal`
> file rather than the `.db` itself. Pull only the `.db` and you can end up with a
> partial history without realising it.

Verified against `Marak123/tvtime-rescue-data`, whose `extract/parse.py` opens
`DioCache.db` with `sqlite3.connect(f"file:{...}?mode=ro", uri=True)` and reads
`select key, subKey, max_age_date, content from cache_dio` — **and never mentions the
`-wal` file.** The tool most people are being pointed at can silently drop the most
recent months of someone's history.

`DioCache.db` is a Dio (Dart/Flutter HTTP client) response cache: one table,
`cache_dio`, whose `content` column holds raw TV Time API responses as JSON. That is
why recovery works at all — the app cached its own API traffic.

**This is the highest-value unbuilt feature we have found.** Accepting `DioCache.db`
*plus* its `-wal` sidecar, in the browser, with a loud warning when the `-wal` is
missing, is something no competitor does correctly and it addresses the most desperate
threads in the subreddit. It is now a task.

---

## 4. Small, concrete UX findings

| Finding | Evidence | Our position |
|---|---|---|
| After marking an episode watched, the comment thread should open by itself | Named as a con for *two separate apps*: "after checking a episode the episode dialogue is not automatically opened" (Showly), "Episode comments is not opened automatically when clicking as [watched]" (Movie Paradise) | **Gap.** We navigate nowhere. |
| A finished show must leave "Currently Watching" on its own | r/serializd: "Even after I finish a show and mark all of its episodes as watched, it still stays in Currently Watching […] I have over 100 shows stuck" | **Gap.** Our library status never changes. Up Next drops it, but the status is stale. |
| Screenshots in comments are what people miss | "The comments section doesn't have the ability to add screen grabs of interesting scenes that TV Time commenters loved doing"; "half of my photos was screenshots of TVST comments" | **Half-built.** `comments.image_url` is stored, rendered, and exempted from the effort filter — but nothing can *post* one. |
| Stats are a source of anxiety, not delight | "stats stresses me out […] I don't need a reminder that I spent literal months doing this every time I check an episode"; "watch time nag when you try to mark something as watched" | **Aligned by accident.** Marking watched shows no stats. Worth making explicit rather than incidental. |
| A browser version is a real differentiator | "The moment Bingers gets a browser version, I delete Serializd and Trakt" | **Aligned.** We are a PWA first. |
| Follower counts get gamed | r/serializd: a documented ring of fake accounts inflating one user's followers and review likes | **Aligned by design.** `follows_select` exposes no public follower count (see the profiles commit). |
| Ads over the UI, paywalled stats, VIP log limits | Recurring across r/serializd and r/tvtime: "an incredibly annoying bar permanently present over the interface"; "Advanced stats are a premium feature"; "with vip you can log more shows" | **Aligned.** Nothing is gated; export is free and complete. |

---

## 5. The comment archive: doc 4 item 7 is withdrawn

Doc 4 listed "imported TV Time comment archive" as MVP item 7, with legal caveats
deferred. This sweep resolves the question, and the answer is no.

**What exists.** `tvtime-archive.com` holds roughly 30 million comments. Its
`/api/cache/explorer` endpoint is public and unauthenticated — a query for the most
recently updated roots returns `"total": 26956` archived shows, each keyed by TVDB ID
and TV Time UUID, with per-layer archive status. Its maintainer is actively
collaborating:

> I'm collaborating directly with devs to integrate it, MP was first cos dev is a
> goated bro […] Also movie paradise and seenr. Soon many more! (If the devs want to
> ofc)

So the door is open and the data is reachable. Two reasons not to walk through it.

**The consent problem is real and already biting.** From the thread on Suite TV, which
imported the archive:

> I have SO MANY questions about this. Like SO MANY. The main one starts with: I don't
> have a Suite TV account, no one asked me, why are my comments there?

The defence offered in the thread — "Your comment is here but is anonymous, so there is
no GDPR breach" — is not a defence anyone should rely on. These are identifiable
authors' words, written for one service, republished by another to bootstrap an
engagement metric. Pseudonymisation is not anonymisation under GDPR when the original
account names travel with the text, and the people whose words they are are visibly
unhappy.

**It also solves the wrong problem for us.** Importing someone else's archive buys a
one-off density number on old episodes. Watching Mode's replay produces density from
our own users' reactions, on any episode, forever, with consent by construction. Buying
the metric undermines the mechanism.

**Recommendation.** Do not import the archive. If it is ever revisited, the only
defensible shape is opt-in *claiming* — a person proves the account was theirs and
imports **their own** comments — which is a different feature from bulk ingestion and
should be built as one. Note also that the archive is keyed by **TVDB** ID while we key
by TMDB, so even the permitted version needs an ID mapping that does not exist yet.

---

## 6. What this changes

**New work, in order of evidenced value:**

1. **Import `DioCache.db` (+ `-wal`) and the GDPR zip in the browser.** §3. The loudest
   unmet need in the subreddit, and the `-wal` handling is a correctness advantage over
   every tool currently being recommended.
2. **Open the episode's comments after marking it watched.** §4. Two competitors are
   criticised by name for not doing it; it is a routing change.
3. **Complete a finished show automatically.** §4. Needs an `ended`/`continuing` flag on
   `CachedTitle`, which TMDB supplies and we currently discard.
4. **Let a comment carry an image.** §4. The schema, the renderer and the effort filter
   all already assume this works.

**Reversed:** doc 4 MVP item 7. See §5.

**Reinforced:** Watching Mode's history replay (§2), free and complete export (§4), no
public follower counts (§4), no paywalls (§4).

---

## Sources

Arctic Shift (`arctic-shift.photon-reddit.com`), 24 August 2026. r/tvtime and r/TVTime
posts after 2026-07-20; r/serializd and r/Simkl after 2026-06-15; comment-body search
across r/tvtime for `gdpr`.

Threads cited by ID: `1vn8u81` (successor comparison, 192 comments), `1vjuvc3` (can
anyone unify the comments, 46), `1vhawhh` ("TvTime wasn't that good", 151), `1vqhcwb`
(rooted-phone recovery, and the WAL comment), `1vo9phz` (Suite TV breakdown, 77),
`1vu8lv3` (iOS recovery guide), `1vtq953` ("Im grieving", 241).

Code read directly: `Marak123/tvtime-rescue-data` `tvtime_rescue/extract/parse.py`;
`tvtime-archive.com/app.js?v=28`.
