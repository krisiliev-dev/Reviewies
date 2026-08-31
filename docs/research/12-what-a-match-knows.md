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
