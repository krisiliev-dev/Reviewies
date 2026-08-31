# What a match knows, and what it does not

A calibration of Watching Mode's confidence against the thing a reader takes it to mean.

## The question, and why it was worth asking

Watching Mode says **"Following along, 73% sure"** and **"Synced, 73% sure"**.

`docs/design/seams.md` §7 argued that number is the wrong shape. Chalmers & Galani's
prescription for a sensed position is an **extent rather than a point**, and an extent is the
form with downstream agency: nobody behaves differently at 73% than at 62%, but *"within about
two seconds"* tells you whether to reach for the nudge control.

That document filed the repair rather than making it, on the grounds that turning a share into
a tolerance needs a measurement nobody had run. This is that measurement. The finding is not the
one it expected, and it is larger.

## What was measured

`design/calibrate.mjs`. 300 probes of 6.0 seconds — the product's real `CAPTURE_MS` — placed at
known offsets in a 22-minute reference and run through the **real matcher**, `matchSample` from
`core/src/fingerprint/fingerprint.ts`, at its shipping bars. Two conditions swept independently:

- **Noise**, a floor added to the spectrum at 0.5 to 3.0 against peaks of 1–2. This is the test
  suite's own degradation model with the level swept.
- **Self-similarity**, a stretch of the episode copied verbatim over a later one at 0%, 10% and
  25% — the case a reprise, a theme played twice, or a reused sting actually creates.

Error is `|reported offset − true offset|`, in milliseconds. One frame is **23.22ms**
(`HOP_SIZE / SAMPLE_RATE` = 512 / 22,050), which is the finest answer the matcher can give.

## The result

| confidence band | n | exact | median error | p95 | worst |
| --- | --- | --- | --- | --- | --- |
| 0.00–0.30 | 60 | 54 | 0.0ms | 725,995ms | 725,995ms |
| 0.30–0.50 | 88 | 79 | 0.0ms | 725,995ms | 725,995ms |
| 0.50–0.70 | 52 | 45 | 0.0ms | 725,995ms | 725,995ms |
| 0.70–0.85 | 35 | 32 | 0.0ms | 725,995ms | 725,995ms |
| 0.85–1.00 | 65 | 57 | 0.0ms | 725,995ms | 725,995ms |

**Every band carries the same worst error.** The most confident matches in the run are exactly
as wrong, when they are wrong, as the least confident. Pearson r between confidence and error is
**0.030** over n = 300.

And the two conditions separate cleanly, which is the mechanism:

| noise | n | median confidence | exact |
| --- | --- | --- | --- |
| 0.50 | 50 | 0.899 | 45 |
| 1.00 | 50 | 0.834 | 44 |
| 1.50 | 50 | 0.629 | 44 |
| 2.00 | 50 | 0.447 | 44 |
| 2.50 | 50 | 0.321 | 46 |
| 3.00 | 50 | 0.242 | 44 |

Noise drives confidence from 0.90 down to 0.24 — the full range the product would ever show —
and **does not touch the position**. The exact count is flat across the whole sweep.

| repeated audio | n | exact | wrong | worst error | most sure while wrong |
| --- | --- | --- | --- | --- | --- |
| 0% | 102 | 102 | 0 | — | — |
| 10% | 102 | 91 | 11 | 725,995ms | **93%** |
| 25% | 96 | 74 | 22 | 725,995ms | **92%** |

Of the 33 probes that landed inside a copied stretch, **33 were placed wrong.** Every one. The
error is always 725,995ms — **twelve minutes and six seconds**, the distance between the two
copies — and the matcher reported up to **93% sure** while doing it.

**Zero refusals in 300 probes.** The matcher never declined.

## What this means

**Confidence and positional error are orthogonal.** They are driven by different things:

- **noise** moves confidence and leaves the position alone;
- **self-similarity** destroys the position and leaves confidence alone.

The number the product shows is a measurement of *how clearly it heard*, presented in a sentence
a reader will take as *how likely it is to be right*. Those are two different quantities, and in
the one case where the answer is badly wrong the number is at its highest.

### The repair `seams.md` proposed would have been actively dangerous

Deriving a tolerance would have produced *"93% sure — within about 0.2 seconds"* over a placement
twelve minutes off. The percentage is not merely the wrong shape: mapping it to a bound is
**anti-correlated with the truth in exactly the case that matters.** Filing it rather than
shipping it was right, and the reason recorded at the time — that the extent was not derivable —
turns out to have understated the problem.

### And there is a live defect underneath the copy question

`shouldCorrect` in `core/src/fingerprint/continuous.ts` accepts a correction when the drift is
between 1.5 seconds and **15 minutes**. The measured wrong placement is **12.1 minutes**, which
is inside that window, so the guard that exists to reject bad matches would **accept** this one
and jump the viewer twelve minutes.

The bound is not the mistake, and the file's own comment says why it is generous: *"Skipping a
recap or scrubbing back to rewatch a scene is a real, large, legitimate jump, and refusing to
follow one would make the feature useless exactly when it is most wanted."* That reasoning is
sound. The problem is that the only other signal available — confidence — is **high** in this
case, so there is nothing left to discriminate on. A recap skip and a repeated-audio mismatch are
the same event to every check this product has.

Filed, not fixed, and deliberately: the honest repair is a second signal (a match's *runner-up*
offset and how close its vote was, which `matchSample` computes and discards), and that is a
change to the matcher rather than to a sentence. It belongs in its own sprint with its own plants.

**Since fixed** — *The repair, and what the runner-up turned out to know*, below, where the
runner-up is measured rather than assumed.

## What this is not

Synthetic spectrograms through the real matcher. **No microphone, no room, no codec, no clock
drift.** The degradation is a noise floor and a verbatim copy; a real reprise is re-recorded and
would not be hash-identical, while a real theme tune across two episodes genuinely is. So the
self-similar result is a statement about *verbatim* repetition, which within one episode means a
reused sting, a title sequence played twice, or a long quiet passage — not every reprise.

What that caveat does **not** touch is the orthogonality, which the noise sweep establishes on
its own: 300 probes, confidence from 0.24 to 0.90, exact count flat throughout.

## The instrument's own defect, which is the fifth of its kind here

The first version of this file reported **"0 wrong at 25% repeat"** — and had never once tested
the case.

Probe positions were drawn from `lcg(seed * 7 + 3)()`, the **first** output of a linear
congruential generator seeded with sequential integers. That is very nearly a linear function of
the seed: trials 0, 1 and 2 returned 0.9501, 0.9528 and 0.9555. Every probe landed at about 95%
through the episode, drifting a quarter of a percent per trial. The copied stretch sits at
60–85%. **Zero of sixty probes reached it.**

Two of the file's own claims were false: that the probe position was swept, and that the
self-similar case had been measured. The result it printed was a confident statement about a
condition it had not produced — which is the shape this record has now met five times, after a
census that dropped every run it was sent to measure, a press reading that never pressed a
Button, a sync probe that answered "configured" on every build there has ever been, and a scroll
figure with no bound beside it.

Two repairs, and the second is the one worth keeping. The generator is warmed up sixteen draws.
And the instrument now **counts how many probes landed inside a copied stretch and refuses to
print the self-similar table when that count is zero**, saying `NOT TESTED` instead. A tool that
cannot tell "no failures" from "no trials" will eventually report the second as the first, and
this one already did.

## The repair, and what the runner-up turned out to know

The section above named the second signal and left it. This is it, measured — same 300 probes,
same seeds, same fixture, re-read for the offset the matcher was throwing away.

### The runner-up separates the two cases completely

Every probe proposes an offset for every landmark it shares with the reference. Only the winner
was ever reported. Reading the **best-supported offset somewhere else** as well — "somewhere
else" meaning at least 1.5 seconds away, which is `shouldCorrect`'s own floor and therefore this
product's existing definition of a different place — and classifying each probe by whether its
own six seconds were duplicated audio:

| the probe's window | n | placed wrong | worst runner-up / winner |
| --- | --- | --- | --- |
| in unique audio | 228 | 0 | **0.0149** |
| wholly inside a copied stretch | 65 | 33 | **1.0000** — every one |
| straddling the edge of one | 7 | 0 | 0.8864 |

**Sixty-seven times apart, with nothing in between.** A real offset is carried by scores of
independent landmarks and nothing else in the episode comes near it. Two verbatim copies draw the
same landmarks and split the vote dead even — 1.0000 on every one of the 65, which is what makes
which copy wins a coin toss rather than a judgement.

Note the second row's arithmetic against the first table's: 65 probes sat inside duplicated audio,
33 of them in the later copy and 32 in the earlier one. Only the 33 were *placed* wrong. The other
32 were equally undecidable and happened to win at the right offset — which is the clearest
statement of the problem available. **Half the affected probes got the right answer by luck**, and
nothing in the old matcher could tell those two groups apart, because there was nothing to tell
them apart *with*.

### The threshold is a half, and the measurement does not pick it

Any value from 0.02 to 1.0 flags all 33 wrong placements and none of the 228 unique ones, so the
number is not delicate and the data alone does not choose it. What chooses it is the cost at each
edge, and both edges are real:

- **Low, near the measured 0.0149.** That figure is not a floor. It is a rising function of how
  bad the input is, and this sweep stops where its own noise model does — across the 228
  unique-audio probes, by noise level:

  | noise | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 |
  | --- | --- | --- | --- | --- | --- | --- |
  | median rival | 0.0012 | 0.0014 | 0.0024 | 0.0045 | 0.0063 | 0.0093 |
  | worst rival | 0.0018 | 0.0022 | 0.0047 | 0.0088 | 0.0102 | **0.0149** |

  Eightfold, monotonic, and still climbing at the last point. Noise scatters spurious landmarks
  and some of them coincide on some other offset — so the clean runner-up is the first quantity a
  real room inflates, and a real room is also a microphone and a codec, none of which is modelled
  here. 0.0149 is the worst *modelled* input; nothing in this file bounds the worst real one. Note
  also that this is the same sweep that leaves the *position* untouched — the rival climbs
  eightfold while the exact count stays flat, which is one more way of saying these two quantities
  are not the same quantity.
- **High, near 1.0.** It catches everything in the table because this fixture copies audio
  *verbatim*, which the caveat above already says is the unrealistic part. Real repetition mostly
  is not verbatim — a reprise is re-recorded, a theme sits at a different mix — and splits the
  vote unevenly. The third row shows what that looks like by accident: genuinely two-place windows
  landing at 0.51, 0.74, 0.89. A threshold up there would be fitted to the fixture.

Half sits 33× above the worst measured clean margin and keeps the whole 0.5–1.0 band on the
ambiguous side. It is also the only value in the range that means something without the table:
below it the winner has more than twice the evidence of any rival, which is a decision.

### Flagged, not refused — and the clock is what breaks the tie

Refusing an ambiguous match was the obvious repair and is the wrong one. Repeated audio is title
sequences, recaps and reprises, which is when people are watching; a matcher that goes quiet there
fails exactly when it is wanted. So `matchSample` still places the sample, reports the runner-up
beside it, and says whether the two were separated by anything.

What acts differently is `shouldCorrect`, and not by tightening its bound. The fifteen-minute
ceiling is not the mistake and the file's comment on it stands. Instead an ambiguous match is put
to a **third opinion from outside the audio**: the clock has been running continuously and cannot
have been in two places, so it is asked which of the two candidates it has been watching.

- Twelve-minute mismatch: the runner-up is exactly where the clock already is, so the clock
  contradicts the winner and the jump is refused.
- A real recap skip taken during a title sequence: the winner is ninety seconds from the clock and
  the runner-up twelve minutes, so the clock corroborates the winner and the jump is followed.

### What it costs, run through the real `shouldCorrect`

The instrument now asks not only where a probe was placed but what Watching Mode would *do* with
it, against two clocks — following steadily, and just after a 90-second recap skip. `before` is
the old two-clause guard; `after` is the same shipped function told what the matcher now reports.

| clock | placement | n | corrected before | corrected after |
| --- | --- | --- | --- | --- |
| following steadily | correct | 267 | 0 | 0 |
| following steadily | **wrong** | 33 | **33** | **0** |
| after a recap skip | correct | 267 | **267** | **267** |
| after a recap skip | **wrong** | 33 | 33 | 0 |

**Every one of the 33 twelve-minute jumps is refused, and not one of the 267 legitimate jumps is.**
The clean case is untouched: at 0% repeat all 102 probes still place exactly, none is flagged, and
none is refused. Of the 36 correct placements that *are* flagged ambiguous, every one either sat
inside a copy (32) or straddled the edge of one (4) — no probe in unique audio was flagged at all
— and every one of the 36 still follows the skip. The flag costs them nothing, because the clock
settles them.

The residual cost is the case that is genuinely undecidable: a viewer who skips *into* the second
copy of a repeated stretch is refused, and stays behind until the audio stops repeating and an
unambiguous match arrives. Nothing in the audio can decide that one, and being briefly behind is a
smaller harm than being confidently twelve minutes out.

### And a second defect, found while pinning the first

`matchSample` picked its winner with `score > bestScore` alone. Two offsets with equal votes —
exactly what duplicated audio produces — were separated by whichever the `Map` yielded first,
which is insertion order, which is hashing order, which depends on the noise. The determinism test
shows it plainly: building the same reference from the same hashes in reverse order moved the
reported placement from frame 410 to frame 110. **The same episode and the same audio could be
placed differently on two runs with nothing anywhere to say why.** Ties now break on the earlier
offset. That does not make the answer right — it makes it reproducible, which is what allows the
ambiguity to be tested at all.

### What this still is not

The caveat above is unchanged and now matters more, because a threshold has been derived under it.
The self-similar fixture is *verbatim* repetition, and real reprises are re-recorded. The
straddling row is the only evidence here about uneven rivals, and it is seven probes. A fixture
with temporally correlated frames would also, for the first time, be able to say something about
the 1.5-second neighbourhood — swept from 1 frame to 258 across all 300 probes, it changed nothing
at all, because independently drawn frames give a vote peak no shoulders. That constant rests on
the mechanism and on the product's own definition of the same place, and this measurement is
silent on it. Said here rather than left for a reader to assume otherwise.
