# The seams

Where this product joins to something else, and what it says about that.

## Why this document exists

This app is unusually full of joins. A watch is written to a local database, queued in an
outbox, and copied to a server. A remote command leaves the web app for a relay we host, for
a bridge on somebody's own machine, for a television — or, on the phone, straight across the
Wi-Fi with none of those. An episode's position comes from a microphone, matched against a
reference somebody else contributed. Metadata comes from TMDB through a cache. A person's
history arrives from a service that shut down.

Every one of those is a place where the illusion of one system can break, and the record here
is full of sprints that were really about a single one of them: §6.57 on telling *nothing*
apart from *I could not look*; §6.71 on a stuck queue that looked exactly like an empty one;
§6.67 on a device whose clock is wrong; §6.84 on a Wi-Fi scan that blamed a television it had
never contacted; §6.171 on a relay that refused a connection and was told it would reconnect
on its own.

Those were all found the same way — by using the thing until it lied — and each was fixed on
its own terms. What was missing is the rule they are all instances of. There is one, it is
forty years old this decade, and it has a literature.

## What a seam is, from the source

Mark Weiser's ubiquitous computing is usually remembered as *invisible* technology. Chalmers
and Galani go back to what he actually wrote, and the phrase is more careful than the memory
of it: the seams — "the obvious differences and boundaries… between the parts of a system" —
should be **"literally visible, effectively invisible."**

> The seams are perceivable — the technology is 'seamful' — but we can call the whole system a
> single, hybrid object because coupled use of the parts is so unproblematic in users'
> interaction.
>
> — Chalmers & Galani, *Seamful Interweaving*, DIS 2004

That is not "hide the machinery" and it is not "expose the machinery". It is: the join is there
to be seen by anyone who looks for it, and ordinary use never has to. Their design prescription
is one sentence and it is the useful one:

> Designers may consider **selectively and carefully revealing** differences and limitations of
> systems… We are particularly interested in seamful systems whose underlying infrastructural
> mechanisms are "literally visible, effectively invisible", in that everyday interaction does
> not require attention to these mechanisms' representations — but one can selectively focus on
> and reveal them when the task is to understand or even change the infrastructure.

And one line that reads like it was written about this repository:

> We should not always rely on the traditional categorisation of error and uncertainty as
> features of the system to be hidden and reduced.

Their worked example is positional: **show a sensed position as a spatial extent rather than as
a point.** Hold onto that; it comes back below and it is where this product fails.

## The criterion, which is the part that decides anything

"Reveal selectively" is not yet a rule. The rule comes from the CHI 2019 re-reading of the
whole seamful/seamless argument, which is that they are not rivals:

> Rather than rival approaches, seamful and seamless design are complements, each emphasising
> different aspects of **downstream user agency**.
>
> — Inman & Ribes, *"Beautiful Seams": Strategic Revelations and Concealments*, CHI 2019

So:

> **Reveal a seam when the person can act on the revelation. Conceal it when they cannot.**
> Where they can act, the revelation must name the action.

That is testable against every sentence in this product, which is what the rest of this document
does. It also explains, after the fact, why every seam sprint listed above came out the way it
did — each one ended by replacing a sentence the reader could do nothing with by one they could.

## The census

Ten joins. The verdict column is against the criterion above, not against taste.

### 1. A local write, and the copy of it on the server — **correct**

`COPY.sync.rejected` says *"One change could not be saved to your account. It is safe on this
device and nothing is lost."* and `retryRejected` offers *"Try those again."*

Textbook. It reveals the seam (there are two stores and they disagree), it says which side holds
the truth, and it names the action. §6.71's entry is explicit that the second half of the
sentence "is the part somebody needs" — agency, arrived at without the word.

### 2. A watch that has not reached the server, under a comment thread — **correct, and it took three sprints**

`COPY.comments.sealed`: *"Your watch has not synced yet, so comments are still sealed. Try again
in a moment."* Distinct from the not-watched sentence, which is a different seam.

This is the one that shows the criterion doing work the old method could not. The sentence existed
and was unreachable for three sprints, because `gated` was computed from `comments.length === 0 &&
!hasWatched` and both screens rendered it inside their `watched ?` branch. Someone whose watch was
still in the outbox got *"Nothing here yet. Be the first."* — the exact spoiler the sentence was
written to prevent. §6.177 added `watchPending` as a third fact and both screens read it.

Worth noting how the defect reads in this vocabulary: it was a **concealed seam whose concealment
produced a false claim about the other side of it.** That is strictly worse than either revealing
or concealing, and it is a category the "hide or show" framing does not contain.

### 3. A device whose clock is wrong — **exemplary, and it is one seam shown as two**

`COPY.app.clockWrong`: *"This device's clock is about 2 hours out. Your history is safe and syncs
correctly, but dates and what is airing will look wrong until it is fixed."*

The reason to single this out: sync corrects for clock skew silently and needs no help, while
everything else the app says about time cannot be corrected from inside the app. So the sentence
**splits one infrastructural fact into the half that is concealed because you cannot act on it
and the half that is revealed because you can** — and names where the action is (the device's
settings, not this app). That is the criterion applied at a finer grain than any other sentence
in the product, and it was written before anyone here had read the literature.

### 4. A tab open across a deployment — **correct**

`COPY.app.updated` and a Reload button. The seam is between the build the page is running and the
files on the server, and the failure it prevents is the "expected a JavaScript module" error that
§6.65 notes "everybody has met and nobody can act on". Replaced by one they can.

### 5. The web's bridge and relay — **right sentences, wrong owner**

Three states, three sentences, in `app/src/remote/RemoteDrawer.tsx`:

- connecting — *"Connecting to your bridge…"*
- refused — *"The relay would not accept this connection. Check the address and token in your
  settings, then reload."*
- disconnected — *"Bridge offline. It will reconnect on its own."*

The refused/disconnected split is the criterion exactly: a relay that closes with **1008** will
refuse the next attempt for the same reason, so *"it will reconnect on its own"* is a promise the
app cannot keep — and §6.171 found the app making it every five seconds. One of these states has an
action and the other does not, and they now say so differently.

**What is wrong is that these three sentences are typed in a web screen and are not in
`core/src/copy.ts`.** They are the most carefully reasoned seam sentences in the product and they
have no owner, in a repository whose entire copy layer exists because two platforms wrote the same
words separately for a year. Filed.

### 6. The phone's Wi-Fi scan — **correct, and it was a device that found it**

`scanFailure(address, hosts)` in `mobile/src/devices/`. The old message was *"Nothing found. The
TV has to be on the same Wi-Fi, and awake"* — said for a scan that had never contacted a
television at all, because `subnetHosts` had refused the phone's own address (a loopback, or a
`169.254` self-assigned one) and there was nothing to probe. §6.84.

The repair is Chalmers' prescription almost verbatim: **name the address the phone thinks it
has**, because that is the whole diagnosis. An infrastructural detail, revealed at the one moment
the person can act on it, and invisible the rest of the time. Its test file holds two clauses that
are worth having: that no refused address blames the television, and that the message contains the
address.

### 7. The audio match's confidence — **the wrong shape, on both platforms, in two vocabularies**

This is the finding.

The web says *"Synced, 73% confident."* The phone says *"Following along, 73% sure."* Neither is
in `COPY`. They are about different events — one-shot placement versus continuous following — so
they are not simply duplicates, but the noun for the same quantity is different on each platform
and nothing owns it.

The deeper problem is the shape. Chalmers' own example is that a sensed position should be shown
as **an extent, not a point** — and a percentage is neither. It is an abstract quality of the
match, and there is nothing a person does differently at 73% than at 62%. It fails the criterion:
a revelation with no action.

The extent would pass. *"Following along, within about two seconds"* tells you whether to nudge.

> **MEASURED, and the answer is worse than this section supposed.** `design/calibrate.mjs` ran
> 300 probes through the real matcher; `docs/research/12-what-a-match-knows.md` has it. Confidence
> and positional error are **orthogonal** — noise moves the number and leaves the position alone,
> self-similar audio destroys the position and leaves the number alone. Every confidence band
> carries the same worst error (725,995ms), r = 0.030, and a match reported **93% sure while
> twelve minutes wrong**. So the extent is not merely underivable: mapping this number to a bound
> would be *anti-correlated with the truth in the case that matters*. The paragraphs below reasoned
> to the right decision from an incomplete argument, and are kept as written.

**And this repository cannot currently produce that number, which is the honest finding.**
`confidence` is the share of landmark votes the winning offset took (`core/src/fingerprint/`), not
a positional error. The only positional bound derivable today is the frame resolution —
`HOP_SIZE / SAMPLE_RATE` = 512 / 22,050, so **23.22 ms** — which is far below what anyone can
perceive and therefore useless as a revelation. Turning vote-share into a tolerance in seconds
needs a measurement nobody has made: matches at known offsets, across confidences, with the error
recorded. Filed rather than guessed.

**There is direct evidence in the repository that vote-share is not a positional error.**
`agreement.ts` records that two recordings *of the same audio* measure 0.46 one way and 0.17 the
other, "for no reason except which microphone was worse" — the noisier side's spurious landmarks
inflate the denominator without touching the numerator. A number that halves because of the
microphone while the position is identical is not describing the position. The score, which is
symmetric, is closer to a positional quantity and is not what either screen shows.

There is a `toleranceMs` in the same file and it is a trap: five seconds, for how far apart two
*contributors' clocks* may be when each hand-synced by pressing a button. It is a bound on human
reaction time, not on this match, and reusing it as the extent would be exactly the fabrication
this section refuses. **Shipping a plausible-looking "± 2s" derived from a
confidence nobody has calibrated would be a fabricated seam, which is worse than the percentage.**

### 8. The metadata provider, and its cache — **correct**

§6.57's three states — *nothing*, *I could not look*, and the thing that is actually there — are
a copy-layer rule now, with `loadFailed` (*"Could not load this title. It may just be the
network."*) distinct from an empty state. §6.104 swept it across screens.

In this vocabulary §6.57 is the general form of the whole document: **an empty result and an
unreachable service are two sides of a seam, and collapsing them makes the app claim something
about the world that it only knows about itself.** Sprint 100's §7 pass found the same shape a
third time, in a different medium — a screenshot assertion that read a heading instead of a
figure.

### 9. Sync not configured at all — **correct**

`COPY.app.localFirst` at the top of More, and *"Following needs sync configured, as do comments
and shared reactions. Your history, ratings, lists of what to watch, stats and the whole import
work without it."*

The second sentence is a seam drawn as a **list of which features are on which side of it**,
which is the most legible form a boundary can take. Somebody arriving from a shut-down service is
looking for exactly this catch, and it is answered before they ask.

### 10. `bridgeConfigured()` false, on the web — **concealed at the wrong layer**

`RemoteDrawer` returns `null` unless two build-time `VITE_` variables are set. No handle, no tab,
no sentence: the capability is not there.

Concealing the *controls* is right by the criterion — the person cannot act on a build-time
variable, and a dead remote panel is worse than none. But the seam actually being hidden is not
"this connection is down". It is **"this product has a remote at all"**, and that they can act
on: running the bridge is a documented thing a person can choose to do. The concealment is one
layer too high.

This is a new finding, and it is the shape the framework is good at surfacing: not *should this
be visible*, but *which of the several seams stacked here is the one being hidden*. Filed with a
scope — a line in More's list of what the app can do, not a control that does nothing.

## What this does and does not change

**Seven of ten are right already**, and the record shows each one arrived at empirically: a device
found the scan message, a plant found the sealed sentence, a relay's 1008 found the reconnect
promise. So the honest summary of applying this framework is not that it repaired the product. It
is that **the product had been doing seamful design for twenty sprints without the name, and
paying full price each time by discovering the rule again.**

What a named criterion buys is the next case being *decided* rather than *discovered*. And it
found three things twenty sprints of discovery had not: an unowned vocabulary for uncertainty
(#7), an unowned set of the best seam sentences in the product (#5), and a concealment at the
wrong layer (#10).

## What is refused

Four things from this literature do not belong here, and the reasons matter more than the list.

**"Reveal everything."** The popular reading, and not the paper's. Chalmers and Galani are explicit
that the mechanisms must be "effectively invisible" in ordinary use and that revelation is
*selective and careful*; they name overwhelming the user as the failure mode. A product that
narrates its own plumbing has replaced one bad model of the system with another.

**A persistent network or sync indicator.** The most tempting single addition and the one most
clearly wrong here. This product's stance, drawn at the top of More, is that *everything lives on
this device* — the network's state is not the app's state. An always-on indicator makes the seam
the subject of every screen, and there is nothing to do about it on any of them. The seam is
already revealed at the two moments it has consequences: a write the server refused (#1), and a
feature that needs an account (#9). That is where it belongs.

**A live outbox counter.** Same argument one level in. A queue that is draining is not a thing
anybody acts on; a queue that is *stuck* is, and §6.71 already says so with a number and a button.
Revealing the healthy case buys ambient anxiety and no agency.

**The paper's appropriation agenda.** Chalmers and Galani's larger goal — via Dourish's
computational reflection and the Speakeasy project — is systems whose users *discover and
manipulate devices, services and their interconnections*, changing the infrastructure rather than
just seeing it. That is a genuine research programme and it is not this product. There is one
relay, one bridge protocol, one metadata provider; a person who wants to recombine them is
reading the repository, not the app. **The criterion is taken and the agenda is left**, and saying
which half of a framework is being used is the point of writing this down.

## Filed, not fixed

Three, each with what it would take.

1. **The confidence vocabulary has no owner.** Two platforms, two nouns, neither in `COPY`. Small
   and mechanical.
2. ~~**Confidence is not an extent, and the extent is not derivable.**~~ **Run, and closed as a
   refusal with a measurement behind it.** `docs/research/12-what-a-match-knows.md`: the two
   quantities are orthogonal, and a derived tolerance would be confidently wrong exactly when the
   match is. The percentage stays — and what the calibration turned up instead is a live defect in
   the flagship, not a copy question: `shouldCorrect` accepts a drift up to 15 minutes, the
   measured wrong placement is 12.1 minutes, and confidence is *high* in that case, so nothing in
   the product can tell a repeated-audio mismatch from a legitimate recap skip. Filed there with
   the honest repair named (the runner-up offset, which `matchSample` computes and discards).
3. **The bridge's three sentences belong in `COPY`, and the missing tenth seam belongs in More.**
   Both are edits to files three agents are working in as this is written; deferred to after the
   merge rather than raced.

---

**Sources**

- Chalmers, M. and Galani, A. (2004). *Seamful Interweaving: Heterogeneity in the Theory and
  Design of Interactive Systems.* DIS 2004, Cambridge MA.
  <http://eprints.gla.ac.uk/3457/1/Seamful_Interweaving.pdf>
- Inman, S. and Ribes, D. (2019). *"Beautiful Seams": Strategic Revelations and Concealments.*
  CHI 2019. <https://dl.acm.org/doi/10.1145/3290605.3300508>
- Weiser, M., quoted in both, for "literally visible, effectively invisible".
