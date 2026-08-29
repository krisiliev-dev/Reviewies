# What only a device can answer

Every claim in this project that a browser, a simulator or a static export cannot settle,
with what to do and what would count as an answer.

It exists because the design track has run for twenty-six sprints entirely inside a
headless Chromium against `expo export --platform web`, and that surface is honest about
some things and silently wrong about others. §6.130 closed the last unphotographed route;
what remains unknown is not a screen, it is a set of behaviours that only real hardware
produces. This is the handover.

**Read the third column strictly.** "It looked fine" is not an answer to any of these. An
answer is a photograph, a measurement, or a recording, and it goes back into
`docs/research/09-app-first-pivot.md` §7 as a resolution with the evidence attached.

---

## 1. The fonts arrive, or the first paint is wrong

**Claim.** `mobile/app/_layout.tsx` gates the first paint on `useFonts`, so nothing is
drawn in a fallback face and then reflowed.

**Why the harness cannot say.** `react-native-web` does not use `useFonts` at all — the
export serves `@font-face` from the same origin, where a font cannot really fail. The gate
is **dead code in every run the design track has ever made**. §6.112 named this and it is
still true.

**On a device.** Cold-launch the app on a physical iPhone with the app freshly installed,
and record the screen from the moment the icon is tapped. Repeat with the device in
Airplane Mode (the faces are bundled, so this must make no difference at all — if it does,
something is fetching).

**An answer.** A frame-by-frame pass over the recording showing either (a) no text drawn
before the correct faces, or (b) the exact frame where a fallback face appears, and for how
many frames.

---

## 2. iOS synthesising a weight the design must never ask for

**Claim.** The phone never states a `fontWeight`. Every weight is a separate loaded family
(`ArchivoNarrow_600SemiBold`, not Archivo Narrow at 600), because iOS will synthesise a
bold by smearing the glyphs when asked for a weight a family does not have.

**Why the harness cannot say.** The browser has real weight axes and synthesises nothing
visible. A `fontWeight` that would be a smear on iOS renders correctly on the web export,
so a regression here is invisible to `type.test.ts`'s rendered half.

**On a device.** Screenshot Up Next, Stats and Watching Mode on a physical iPhone.
Then *deliberately* add `fontWeight: '700'` to one heading, rebuild, and screenshot the
same screen.

**An answer.** The two screenshots side by side at 3× zoom. If they are identical, the
concern is not real on this iOS version and the rule is a precaution rather than a fix,
which is worth saying. If the second is smeared, the rule is load-bearing and
`type.test.ts`'s source clause is the thing keeping it.

---

## 3. Two hundred per cent text

**Claim.** The phone's type scale is consumed as numbers with `allowFontScaling` on, and
every layout that would break at 200% has been made to reflow by construction — equal-width
transport cells that go 2×2, no fixed-height headers, tabular mono so codes cannot wrap.

**Why the harness cannot say.** `react-native-web` does not implement OS Dynamic Type. The
export renders at a fixed size whatever is asked, so the phone **cannot be measured at
200% at all**; the web's 200% check in `app/smoke.mjs` covers a different renderer.
`phoneTextScaling.test.ts` asserts the source, not the result.

**On a device.** Settings → Accessibility → Display & Text Size → Larger Text, at maximum
with "Larger Accessibility Sizes" on. Then walk every route: Up Next, Search, Discover,
Watchlist, More, Stats, Calendar, Lists, People, Account, Data, Remote, a title, the
comments screen and Watching Mode with the drawer open.

**An answer.** Fifteen screenshots, and for each one an explicit judgement: nothing is
clipped, nothing has scrolled sideways, and every control is still reachable. §6.121's
finding — the drawer parked at `translateX(300)` making the page 690pt wide in a 390pt
viewport — was found exactly this way on the web and there is no reason to think the phone
has none of its own.

---

## 4. Japanese, and the face that is not Archivo

**Claim.** A Japanese title falls to the platform face by decision rather than by accident,
because none of the four bundled families carries CJK.

**Why the harness cannot say.** Chromium on the harness machine falls back to whatever that
machine has installed, which is not what an iPhone has. The mixed-script line the design
actually has to look right — a Latin UI label beside a Japanese show title on one row — has
never been rendered by anything that resembles a phone.

**On a device.** Import or search an anime with a Japanese title (`進撃の巨人`), and
screenshot Up Next, the title screen and the watchlist row.

**An answer.** A judgement on the mixed line: does the Japanese sit on the same baseline,
at a size that reads as the same size, or does it look like a different design? If it looks
wrong, the decision to fall back is the thing to revisit — not the rendering.

---

## 5. `hitSlop` is a real target, and the harness cannot see it

**Claim.** Several phone controls are smaller than 44pt drawn and reach the floor through
`hitSlop`.

**Why the harness cannot say.** `hitSlop` is invisible to layout. §6.126 measured
`AddToList`'s trigger at 47×16 in the export **because the box is all a browser can
measure**, and gave it a drawn size rather than trusting the slop. Every other `hitSlop` in
the app is in the same position: asserted in source, never touched.

**On a device.** Enumerate every `hitSlop` in `mobile/` (there were nine at the time of
writing) and press each one, once at its visual edge and once at the outer edge of the
claimed slop, with a thumb rather than a fingertip.

**An answer.** A pass/fail per control. A `hitSlop` that does not respond at its claimed
edge is a lie in the source, and the fix is a drawn size, as §6.126 did.

---

## 6. Haptics

**Claim.** The press confirmation on the phone is carried by the haptic, and the ground
step is corroboration. §6.122 accepted a *quieter* visible press (1.046 against 1.080) on
that basis.

**Why the harness cannot say.** `expo-haptics` is a no-op on web. The argument that made
the press direction acceptable has never been experienced.

**On a device.** Mark an episode watched, tap a pad cell, press a remote key, and toggle a
`Choice`, with the phone in the hand rather than on a desk. Then repeat with System
Haptics off.

**An answer.** A plain statement: with haptics on, is the confirmation adequate? With them
off, is the ground step alone adequate? If the answer to the second is no, §6.122's tradeoff
needs revisiting for people who turn haptics off, and that is a real accessibility finding
rather than a preference.

---

## 7. The mDNS scan, and a television

**Claim.** "Scan Wi-Fi" finds a Roku on the same network, and the remote's keys drive it.

**Why the harness cannot say.** There is no multicast, no Roku, and no network. `bridge/e2e.mjs`
runs the bridge against a *fake* television (§6.91), which proves the protocol and nothing
about discovery. `24-watching-remote` is the only photograph of this screen and it shows the
**no device** state, which is the only state anything has ever produced.

**On a device.** A phone and a Roku on one network. Scan; select; press every key on the
fascia; then walk out of Wi-Fi range mid-session and press one more.

**An answer.** A photograph of the drawer with a device in it — the first one that will ever
exist — plus a per-key result, plus what the screen says when the device goes away.
§6.104's rule applies: "nothing happened" and "I could not reach it" must not look the same.

---

## 8. Background audio, and a whole episode

**Claim.** Watching Mode's clock survives the app being backgrounded (`AppState` →
`clock.resync()`), and `ListenSync` can record a few seconds of audio to match a position.

**Why the harness cannot say.** A browser tab is not an app being suspended by iOS; the
microphone permission flow does not exist; and §6.116 ran a whole episode *in the harness*,
which is a different thing from a phone locking its screen with the app behind it.

**On a device.** Start Watching Mode against a real episode playing on a television. Lock
the phone. Come back after five minutes, then after twenty, then answer a call. Separately:
tap "Sync by listening" with the episode audible, and again in a silent room.

**An answer.** The timecode at each return, against the true position — §6.69's bug (a
restored clock coming back stopped, so every later reaction landed on one frozen timestamp)
was found by reasoning and has never been watched happen or not happen. And for the
listener: a match, a near-miss and a refusal, with what the screen said each time.

---

## 9. Light mode

**Claim.** The light palette meets its contrast floors, and amber is never a text colour in
it.

**Corrected (§6.132), and half of this entry was wrong.** Light mode is not a state the
product can display. Nothing sets `data-theme` — not a control, not a preference, not
`prefers-color-scheme`, and `app/index.html` declares `<meta name="color-scheme"
content="dark">`; the phone resolves `color.dark` at module load and `app.json` pins
`userInterfaceStyle: "dark"`. `color.light` is read by twelve test files and nothing else.
So the amber that fails 3:1 on paper survived *harmlessly*, and the claim that "the design
track has been reviewing half the app" was false.

**Done for the web.** `design/capture-web.mjs` photographs ten routes under
`data-theme="light"` alongside the shipping theme, so the light table that twelve guards
assert about is visible for the first time. It holds up, and `light-06-stats` is the picture
`progress.test.ts` never had.

**Still open, and it is a device question after all.** The phone cannot render light without
`theme` becoming a runtime value, which makes every `StyleSheet.create` in the app a
function of it — a large change to ship a state no user can reach, on a platform whose
dark-only stance is a written decision. If the phone ever gains a light mode, this entry
becomes real again and the thirteen amber spinners `progress.ts` warns about inherit the
problem the web's two already had.

---

## What this list is not

It is not a test plan for the product's behaviour — the suites cover that, and
`npm run verify`, `npm run smoke` and `npm run design` are the things to run first. It is
the set of claims where **the instrument and the subject disagree**, and where a green suite
means only that nothing contradicted itself in an environment the product does not ship to.

## 10. A live query redrawing after a rollback

§6.135 gave `Database` an `onSettled()` that fires after a transaction commits **or** rolls
back, because expo-sqlite fires `addDatabaseChangeListener` per *statement* and every read
goes through the connection holding the open transaction — so a live query draws
uncommitted rows, and a rollback is not a row change, so nothing tells it to look again.

What is proved: the adapter announces on both paths, `useLive` subscribes, and the clauses
plant against both. What is not: any of it running on **wa-sqlite through expo-sqlite**.
The suite's SQLite driver is `sql.js` in Node, which has no change listener at all, so the
per-statement wake — the thing the whole mechanism exists to correct — has never fired in
any test.

**How to settle it.** On a device, start a TV Time import large enough to take a few
seconds and kill it mid-flight (airplane mode mid-fetch will do it, or a malformed row near
the end of the CSV). Watch Up Next while it runs. It should count up as rows land, and then
**go back down** to what actually committed, without a navigation or a pull-to-refresh. If
it counts up and stays there, `onSettled` is not reaching the phone.
