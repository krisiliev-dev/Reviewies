# Turning an agent into a design professional

What actually changed the quality of design work in this repository, measured rather than asserted.

## Why this document exists

Almost every design decision in this product was made by a Claude agent. Some of that work was
good and some of it was confidently wrong, and the record is long enough to tell which practices
moved the line and which were decoration: 239 tasks, 194 numbered entries in
`docs/research/09-app-first-pivot.md`, and three findings retracted in writing after the shot or
the fixture turned out to be the defect rather than the design.

So this is not advice about prompting. It is a reading of one long experiment, with the failures
named and located, plus the two published studies that tested the same thing and found the same
failure mode.

The one-sentence version: **an agent becomes a design professional when you give it something to
see with and a method that makes its own blind spots measurable — not when you give it better
taste, more frameworks, or a longer style guide.**

## What the literature found, and what it did not test

Two studies have put a model in a designer's chair and scored it.

Guerino, Rodrigues, Capeleti, Ferreira Mello, Freire and Zaina (*Can GPT-4o Evaluate Usability
Like Human Experts?*, INTERACT 2025, arXiv:2506.16345) gave GPT-4o **screenshots of a web system
and Nielsen's ten**, and compared its issue list against human experts'. **Only 21.2% of the
experts' issues were also found by the model.** It did find 27 issues the experts had not — and it
also produced false positives from hallucination and from predicting issues rather than observing
them. It was better on *aesthetic and minimalist design* and *match between system and the real
world*; it was worse on *flexibility*, *user control* and *efficiency of use*. Their conclusion is
that an LLM belongs in pre-analysis with a human filtering afterwards, not as the evaluator.

Duan, Kim, Hughes and Hartmann (*Generating Automatic Feedback on UI Mockups with Large Language
Models*, CHI 2024, arXiv:2403.13139) built a Figma plugin: a UI plus written heuristics in,
constructive suggestions out, assessed over 51 UIs against three guideline sets and with 12 expert
designers. Their finding, verbatim from the abstract: GPT-4 feedback is *"useful for catching
subtle errors, improving text, and considering UI semantics, but feedback also decreased in utility
over iterations."*

Read the setups rather than the scores, because the setups are the same setup, and it is the one
this project spent a year escaping. In both, the model is handed **a static picture and a list of
principles**. It cannot press anything. It cannot time anything. It cannot ask what the code
underneath the picture actually renders. Neither study tests the configuration that matters here —
an agent that can *run* the interface — so neither is evidence against it, and nothing found below
contradicts them. What they establish is the baseline: picture-plus-principles yields roughly a
fifth of an expert's findings, padded with invented ones, and it goes stale as the design converges.

That last clause is the sharper one. Feedback decaying over iterations is exactly what a design
track that runs every sprint would produce if nothing new were ever *measured* — the model has
already said everything a picture can prompt it to say.

## The same failure, in this repository, in my own hand

Three instances, because the argument is worthless without them.

**Five control names I believed instead of read.** `design/response.mjs` measures how long the app
takes to answer a press. Version 2 carried seven hand-written needles — `/^Mark .* watched/i`,
`Last 30 days`, and five more. **Two of the seven matched.** The real strings are `/^Mark .*
watched$/` and `30 days`. The other five were plausible, idiomatic, well-formed names for controls
that do not exist under those names. Nothing in the writing of them felt like guessing. Version 3
does not name controls at all; it discovers them from the accessibility tree, and found 70.

**A premise from `grep -l`.** A sprint brief of mine opened by claiming HCI grounding was
*"scattered across nine files — Fitts, an affordance, a heuristic"*. Checked properly (§6.189):
across `core/src`, `app/src` and `mobile/src`, the terms `Fitts`, `Nielsen`, `Norman`, `Weiser`,
`Kahneman`, `signifier` and `gulf of` occurred **zero** times — all seven. `heuristic` occurred
four times, every one meaning *a guess made by a script*. `affordance` occurred in sixteen files,
and in all sixteen it meant what Norman calls a *signifier*. There was nothing scattered to gather;
there was a vocabulary to correct. A matched file is not a matched idea, and `grep -l` answers a
question about files.

Re-running that count while writing this paragraph returns `Weiser` 1 and `Kahneman` 1: the design
work since §6.189 put them there. The number was right when it was taken and is stale now, which is
the ordinary fate of every measurement in this document and the reason each one is dated to the
sprint that took it.

**A completion I signed off on somebody else's report.** An agent reported the 38 stale screenshots
re-shot. I marked the task complete. The images were gitignored and lived only in that agent's
worktree; this checkout still reported 55 stale. The report was true where it was written and false
where I read it — which is the same defect class this project had spent three sprints cataloguing,
committed by the person cataloguing it.

None of these are taste failures. All three are an agent asserting the state of something it had
not looked at. That is the actual disease, and every practice below is a treatment for it.

## Nine practices, with what each one cost

### 1. Give it an instrument before you give it an opinion

`design/` is 23 programs and 9,794 lines that exist only so an agent can perceive something. They
photograph every route in both themes at two widths, on the web and on a phone; they measure
contrast, target size, text scaling, layout and colour; they seed a real library from a CSV so the
screens are not empty; they run the matcher 300 times and correlate its confidence against its
error.

The clearest case for this is what happened when one was missing. For a year every claim in this
repository about responsiveness was an inference from reading code — no one had ever timed a press.
`design/response.mjs` timed 18 interactions across 7 screens, discovering 70 controls. **The app
answers a press in 16–24ms and reaches a settled screen in 154–240ms.** The lower settle readings
sit at the instrument's own 120ms sampling floor and are reported as bounds, not values.

That single measurement retired a whole category of speculative work. Latency is not this app's
smoothness problem, so "make it feel smoother" is a question about steps, states and clarity — and
we know that instead of assuming it. An agent given the screenshots and the ten heuristics would
have generated confident advice about perceived performance forever.

### 2. Read the renderer before you name the control

Cheap, and it is the fix for the 2-of-7. Before writing a finding about a screen, open the file
that draws it. Before asserting a string, `grep` for the string. Before claiming a shot shows a
state, hash the file. The house rule is one line: **read the renderer, and hash the file, before
writing the finding.**

### 3. Plant the defect first, and watch the old check pass

This is the practice that changed the most, and it is not "write a test".

When you add a check that claims to catch something, first *plant that exact violation* and run the
check as it existed **before** your change. If it passes, you have measured the gap rather than
imagined it. Then repair with the defect still planted, watch it fail, and restore.

The reason is that a check which cannot fail looks exactly like a check which passes. Planting is
the only way to tell those apart, and it turns "is this test vacuous?" from a worry into a
measurement. Sprints 107, 120, 121 and 122 exist entirely because of what it found — and the
harshest find was against my own work: `wrongWay` compared each measured press colour against
`rgbOf(color.dark[PRESS])`, read from **the same token the components render from**. Change `PRESS`
and the app and the check move together and agree, however wrong they both are. Planting
`PRESS = elevation.raised` produced *presses measured: 32*, exit 0. The check was not useless — it
catches a component that hardcodes a colour instead of asking the token — but its **name** claimed
more than its body could deliver. What can be checked without reference to itself is the
*direction*: a press sinks, so `PRESS` must be darker than both grounds it can sit on.

There is one hard prerequisite: **a plant that does not compile is not a plant.** An early attempt
gated on `shelf === 'library'`, which makes tsc narrow the union and reject the later
`shelf === 'watchlist'` comparisons; the suite went red for a type error and I nearly recorded that
as the check working. It was re-planted as `String(title.id).length > 9999` — semantically dead,
type-clean, and therefore an actual test of the guard.

### 4. A check that fails on a correct change is also wrong

The mirror of the above, and it has fired at least eight times. When a guard goes red on a change
that is right, the reflex is to make the file satisfy the guard. That is backwards: fix the rule.
Sprint 190 alone corrected three clauses that were failing on correct screens. A rule that
overfires costs more than a missing one, because a team learns to route around it.

Two shapes recur. A needle too loose: `/\[0\]\?\.trending/` matched `shelf[0]?.trending` — a real
defect, so the *finding* was right and the *needle* was wrong; tightened to
`/shownShelf\[0\]\?\.trending/`. And a check that accepts any shape rather than the shape the
provider produces: `snapshotPass.test.ts` was happy with any populated array until the key was
derived from the provider itself.

### 5. Name the denominator

Almost every unfalsifiable design claim is missing one number: out of how many.

Compare *"the app feels responsive"* with *"18 interactions across 7 screens, of 70 controls
offered; answered in 16–24ms; settled in 154–240ms; readings near 155ms are at the instrument's own
120ms floor and are bounds."* Only the second can be wrong, which is the only reason it is worth
saying.

The seam census reads as *ten joins examined; seven already right; three convicted; four candidate
frameworks refused with reasons* — the seven acquittals are what make the three convictions
credible. The matcher calibration reads as *Pearson r = 0.030 over n = 300; 33 of 33 probes in
verbatim repeats placed wrong, always 725,995ms out, at up to 93% confidence.* An agent that
reports "the matcher is sometimes overconfident" has said nothing that can be acted on. An agent
that reports *33 of 33, always the same offset* has found a bug with a shape.

The corollary: **say when you found nothing.** A sprint that reads ten screens, files none, and
explains why is an honest sprint. The pressure to manufacture a finding so the work looks
productive is the single largest source of noise in agent design review, and it is the mechanism
behind Guerino's false positives.

### 6. Check the provenance of the number you are about to design to

Design numbers propagate as folklore, and an agent is an extremely efficient folklore propagator.

- **400ms, "the Doherty threshold."** It is not in Doherty & Thadani's paper. They measured 0.3s,
  0.6s and 1.0s, and reported 180 transactions per hour at 3s against 371 at 0.3s — IBM programmers
  and chip designers, on mainframes. The famous round number was attached later by someone else.
- **200ms INP.** Real, but it is Google's *"good"* threshold, calibrated against CrUX for
  ecosystem achievability. It is a statement about what the web can currently manage, not about
  human perception.
- **0.1 CLS.** Same construction, same caveat.
- **100ms.** This one *is* perceptual, and it is the one worth designing to.

Four numbers that a design document would have listed in one row as though they were the same kind
of fact. Three of them are not.

### 7. Let it refuse, and record the refusal

Refusal is the clearest signal that judgement is happening rather than retrieval, and it is the
behaviour that a brief full of framework names most needs.

`docs/design/hci.md` was handed nine frameworks and **turned down four**, in writing:

- **Nielsen's ten, refused as a frame** — on Nielsen's own published grounds. Individual evaluators
  found 20–51% of problems in the CHI '90 data; the method's yield comes from aggregating three to
  five of them. This had one evaluator. Kept as vocabulary, refused as a scoring frame.
- **Fitts, refused** — `MT = a + b·log₂(2A/W)` predicts a movement time nothing here can measure,
  and the repo's real standard is a 44pt floor from the HIG and WCAG 2.5.5. Citing Fitts for that
  would be exactly the unchecked citation the document exists to prevent.
- **Slow technology, refused** — its unit is years of presence; it would yield unfalsifiable
  assertions.
- **Peak–end, accepted as description and refused as prescription.** SDT's three-needs checklist
  refused; its informational/controlling split kept.

And two refused by *going and checking*, in `docs/research/11-what-a-task-costs.md`:

- **Hick's law**, on whether a four-tab bar overloads choice. Liu, Gori, Rioul, Beaudouin-Lafon &
  Guiard (*How Relevant is Hick's Law for HCI?*, CHI 2020) rule it out three ways, and the
  arithmetic settles it: re-analysing two command-selection studies they measure slopes of **4, 8
  and 32 ms/bit** against the 150+ of Hick's own apparatus, so at the worst of those the entire
  difference between a two-tab bar and a four-tab bar is **32ms — one twentieth of a single tap.**
  The framework is real and the application was noise, and only arithmetic could tell them apart.
- **The steering law.** Accot & Zhai's `MT = a + b·(A/W)` needs a constrained path, and this
  product has no steering task: the only drags are `ScrollView` flicks, a flick is ballistic, and
  overshooting costs nothing.

The second is the more useful pattern, because of how it is filed — *"recorded as an absence
because 'no steering task' is an answer and silence is not."* An agent that quietly omits an
inapplicable framework leaves the next reader to wonder whether it was considered. An agent that
writes down what it ruled out, and why, has produced something a colleague can disagree with.

That is the standard: an agent may decline a framework, but it owes a reason of the same rigour it
would owe for adopting one.

### 8. Re-verify everything a subagent hands you, by re-planting it yourself

Parallel agents in git worktrees are how this project goes fast. They are also how it acquires
false beliefs, because a report is written in one filesystem and read in another.

The rule that fixed it: **when merging a finding, re-plant it yourself in the main checkout.** Not
re-read the report — re-run the violation and watch the merged guard fail. This has caught **five
guards across three sprints** whose authoring agent believed them correct, plus the 38-stale-shots
error above.

Two later results are worth adding, because they change what the rule is *for*. On one merge the
re-plant **confirmed a limit the agent had reported against itself** — a deliberate-discard plant
that its guard could not catch, exactly as it said. And on another it caught **my own** repair
twice: a needle loose enough to pass with the press painted the wrong colour, and a renderer writing
a hardcoded token where this repository's own sweep demands the symbol. So the rule is not really
about distrusting subagents. It is that **a claim and its check have to be re-run by somebody who
did not write either**, and that includes re-running your own.

This is also, unexpectedly, Nielsen's own result pointed at agents. One evaluator finds 20–51%; the
yield comes from aggregation. Three agents on the same screens with *different frames* — one on
information scent, one on what happens between press and settle, one on real artwork — find
different things and check each other, which is a better argument for the parallel sweep than
throughput ever was.

### 9. Fear the instrument that changes what it measures

The defect this project finds more than any other, by a wide margin. It deserves a name:
**an instrument that alters or omits its own subject.** Every one of these shipped, passed review,
and was believed:

| The instrument | What it did to its subject |
| --- | --- |
| a `--lines` census | dropped every run it had just measured |
| `pressReadings` | measured presses without ever pressing a Button |
| a sync probe | answered "configured" on every build, including unconfigured ones |
| a scroll finding | cited `scrollTop 450` where `maxScroll` was also 450 — the page was at its end |
| a screenshot clause | asserted a heading was present, not the figure the shot was taken for |
| `design/unread.mjs` | counted screenshots of a build that had been deleted |
| `pressReadings` again | cached a control count against a page that mutated under it |
| `pressReadings` a third time | clicked every control it was measuring, changing the screen |
| `wrongWay` | compared a press against the very token the press renders from |
| `response.mjs` | truncated each control's name to 40 characters, then looked it up with `exact: true` — so every control with a longer name was filed *"was there a moment ago and is not now"*, a line that reads as a finding about the app and is a fact about the file. One whole screen contributed **zero** measured interactions for that reason alone: 18 interactions became 24 when the truncation was removed |
| `capture.mjs`'s import wait | tested for four samples with **no `Matching…` on screen**, then reloaded. The button offered while no match is running reads *"Match imported shows"* — which contains no `Matching…` — so two seconds of an idle screen satisfied it, and the reload restarted an import that lands over minutes. Three runs, three answers: `77 more episodes`, `75`, `72`. A number still moving, photographed as a state |
| `capture-web-real.mjs` | claimed *"nothing here can pass against an empty app"* while four of its seven routes carried `undefined` needles — so four of the 42 shots in the pass whose stated purpose is judging the design against **real content** are of an empty screen |
| `capture.mjs`'s census | printed which shots were taken off the top of their screen **with 8 of the pass's 33 shots still to come**, so it reported 1 where there were 3. Built by the previous sprint to fix exactly this class, and broken within it by a correct change to the other half of the file |

**Twelve instances, five in one file, and the last of them is the one to remember**: it was written
*to catch this defect* and committed it inside a sprint. The pattern is not carelessness; it is that measuring something
usually requires touching it, and the touch is invisible from inside the measurement. The
countermeasures that work are mechanical: release the mouse at the origin (`page.mouse.move(0, 0)`
before `mouse.up()`) so a press is measured without activating; re-count on every iteration instead
of caching; derive the expectation from a *different* source than the thing under test; and refuse
to run at all when the premise is absent — `response.mjs` exits 1 with *"Everything below would be
a measurement of an empty app"* rather than reporting excellent latency for a screen with nothing
on it.

## What to actually put in the brief

A brief is the highest-leverage artefact and the easiest to get wrong, because **a brief built from
the wrong list produces excellent work on the wrong thing** — see the `grep -l` premise above,
which sent an agent to gather citations that did not exist.

What has worked, in order of how much it matters:

1. **State the premise as a measurement, with the command that produced it.** Not "HCI grounding is
   scattered across nine files" but "`grep -c` over `core/ app/ mobile/` returns these counts."
   If you cannot produce the command, the premise is a belief and should be labelled one.
2. **Name the instrument the agent will use, and say what it cannot see.** "`design/capture.mjs`
   photographs routes but cannot reach a signed-in state" is worth more than any amount of
   direction.
3. **State the framework's limits before its name.** A brief that says *"information scent, from
   Pirolli & Card 1999 — it models where a person's next click goes; it says nothing about whether
   the destination is any good"* gets a narrower and truer finding than one that says "apply
   information foraging."
4. **Invite refusal explicitly, and say a null result is a success.** "If this framework does not
   convict anything here, say so and explain why" — otherwise the agent will find something,
   because the brief asked it to.
5. **Require the plant.** Every new guard proved by planting the violation it claims to catch, with
   the pre-change run recorded.
6. **Give the environment's traps by name, and check the ones you are handing on.** Worktrees have
   no `node_modules` (`cp -al`, never a symlink farm, or Metro breaks) — and **not only the root
   one**: `app/`, `core/` and `mobile/` have their own, and `mobile/node_modules` holds an
   un-hoisted `react-native-svg` without which every export dies at one component. Any large
   gitignored fixture directory needs hardlinking too. `/tmp/metro-cache` is shared across
   checkouts and will silently poison an export even with `--clear`, so each agent needs its own
   `TMPDIR` — but **a path inside the worktree pushes Chromium's singleton socket past the 108-byte
   `sockaddr_un` limit**, and it fails as `Socket path too long` surfacing as SIGTRAP and *"Target
   page, context or browser has been closed"*, which reads as a browser problem and is not. A short
   unique path (`/tmp/rv-<agent>`) satisfies both. The scratchpad is shared between agents, not
   per-session. Distinct port pairs per agent — and check whether the scripts actually take them,
   because a hand-rolled `npx serve` **falls back to a random port silently** when its port is held,
   so a pass can appear to run and photograph another checkout's build.

   That `TMPDIR` line is in this document because I wrote the wrong version of it into three briefs
   in one sprint and it cost the first agent an hour. **A trap list is a brief's most copied
   paragraph and therefore the one most worth re-deriving** — mine had been carried forward
   unexamined for four sprints. An agent that loses a day to one of these produces nothing, and none
   of them are discoverable from the code.
7. **Ask for the close-out in the same message**: the record entry with its own *What is not done*,
   floors set to exact measured counts with no margin, and the commit.

## What none of this fixes

- **It does not give an agent taste.** Everything above is machinery for being right about facts.
  Whether the Discover shelf should exist at all is a judgement, and the honest position is that the
  instruments make judgement *cheaper to check*, not unnecessary.
- **An instrument measures what somebody thought to measure.** Nothing timed a press for a year.
  There is no way to know what the current 19 programs are still blind to, except by the same slow
  route: use the thing until it lies.
- **`design/` has 9,794 lines and zero tests.** The instruments are the least-guarded code in the
  repository, which is precisely why **twelve** of them were caught measuring the wrong thing — and
  every one by inspection or by a *different* instrument, never by a suite. That is an open
  weakness, not a solved problem, and it is getting worse rather than better as `design/` grows.
- **The sample is one product and one evaluator.** Guerino's caution applies here too: this is a
  reading of a single long experiment, not a controlled comparison. Where a claim above has a
  denominator, it is measured; where it does not, it is a judgement.

## Sources

- Guerino, Rodrigues, Capeleti, Ferreira Mello, Freire, Zaina. *Can GPT-4o Evaluate Usability Like
  Human Experts? A Comparative Study on Issue Identification in Heuristic Evaluation.* INTERACT
  2025. arXiv:2506.16345
- Duan, Kim, Hughes, Hartmann. *Generating Automatic Feedback on UI Mockups with Large Language
  Models.* CHI 2024. arXiv:2403.13139
- Nielsen & Molich. *Heuristic Evaluation of User Interfaces.* CHI '90 — for the 20–51% single-
  evaluator figure and the aggregation argument.
- Liu, Gori, Rioul, Beaudouin-Lafon & Guiard. *How Relevant is Hick's Law for HCI?* CHI 2020 —
  for the 4/8/32 ms/bit slopes and the three-way argument against applying it here.
- Accot & Zhai. *Beyond Fitts' Law.* CHI 1997 — for the steering law this product has no task for.
- Doherty & Thadani. *The Economic Value of Rapid Response Time.* IBM, November 1982 — for what
  the paper actually measured, and did not.
- The rest is this repository: `docs/research/09-app-first-pivot.md` §§6.107, 6.120–6.123, 6.189,
  6.190; `docs/research/11-what-a-task-costs.md`; `docs/design/hci.md`, `calm.md`, `seams.md`; and
  `design/`.
