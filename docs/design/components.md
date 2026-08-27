# The component layer

What sits on the tokens. Read `docs/design/tokens.md` first.

I read all three directions in full, the fourteen screenshots, `OBSERVED.md`, `theme.ts`, the palette guard that then existed, `copy.ts`, every route file under `/home/user/Reviewies/mobile/app/`, every component under `/home/user/Reviewies/mobile/src/`, and the web counterparts under `/home/user/Reviewies/app/src/`.

---

# Reviewies — the component layer for Late Edition

## What the inventory actually says

The brief's numbers are directionally right and understated. Verified against the source:

| Claim | Verified |
|---|---|
| `cta` defined twice | Confirmed exactly. `/home/user/Reviewies/mobile/app/(tabs)/index.tsx:335` is `accent` / 20×12 / 999 / label 16-600-ink; `/home/user/Reviewies/mobile/app/calendar.tsx:227` is `surface2` / 20×12 / 999 / label 15-600-text. **A third exists**: `/home/user/Reviewies/mobile/app/(tabs)/watchlist.tsx:163`, accent / label 16. |
| "four button geometries on five screens" | **45 distinct button container styles** across 22 files. 97 `<Pressable>`, 9 `<Link>`, 0 named button components. |
| "seven pushed screens render their own title" | **Ten** files, 14 `<Stack.Screen options={{ title }} />` call sites, all rendering expo-router's native header (~26pt system regular) against five tabs at 30/700. |
| — | 21 places set `color: theme.accent` on *text* to mean failure — the same token as every primary button fill. |
| — | 12 `<ActivityIndicator>`, 8 `opacity: 0.3–0.5` disabled styles (the web already bans this via `appearance.test.ts`; the phone is unguarded). |
| — | 11 `<TextInput>` in 6 geometries; 16 underlined text-links at `minHeight: 24`; 8 files hand-rolling the same uppercase section label. |
| — | `COPY.calendar.findSomething` holds `'Find something to watch'`, and **four call sites write it as a literal** (`index.tsx:150`, `index.tsx:175`, `app/src/screens/UpNext.tsx:120,158`). Copy has one owner and currently does not. |

Two things the component layer cannot fix alone, stated up front:

1. **`Poster` cannot tell "no artwork" from "could not fetch it"** because `getTitleCached` throws rather than returning `{ value, failed }` like `getProvidersCached`/`fetchLists`/`fetchComments` already do. The four-state plate needs that core change or it will guess, and guessing is the bug.
2. **The 44pt floor is a real change.** `theme.ts` sets `tap = { minHeight: 24 }` citing WCAG 2.5.8. The house standard here says 44. `hitSlop` cannot close the gap — the file's own comment records why ("real on a device and invisible to layout; two hitSlop targets next to each other overlap, and nothing can measure them"). Every quiet control gets a 44pt box with a text-sized visible mark. Late Edition pays for that vertical space by deleting card fills and gaps, which is the trade the direction already argues for.

---

## The roster, in coverage order

| # | Component | Routes | Shared? |
|---|---|---|---|
| 1 | `Button` | 15 of 16 + 9 components | Shared — **built** |
| 2 | `Section` | 8 today, all after | Shared |
| 3 | `Masthead` | 16 | **Phone-only expression**, shared contract |
| 4 | `Poster` | 6 (7 call sites) | Shared |
| 5 | `Row` | 9 (10 implementations) | Shared — **built, 2 of 10 migrated** |
| 6 | `Data` | every screen with a number | Shared |
| 7 | `Note` | 21 + 12 spinners | Shared |
| 8 | `Field` | 9 (11 inputs) | Shared |
| 9 | `Choice` | 5 | Shared — **built** |
| 10 | `CrossOff` | 3, the app's most-repeated action | Shared — **built** |
| 11 | `Progress` | 4 | Shared |
| 12 | `Sheet` | 2 | Contract shared, mechanics diverge |
| 13 | `ChannelStrip` | 1 file / 5 tabs | **Phone-only**; icon paths shared |
| 14 | `Key` | 2 hosts | Shared — **built** |
| 15 | `PadCell` | 1 (flagship) | Shared |
| 16 | `ReactionStrip` | 1 (flagship) | Contract shared, motion diverges |

---

## 1. `Button` — 15 of 16 routes

```ts
type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'destructive';
type ButtonSize = 'page' | 'row' | 'inline';
type ButtonWidth = 'hug' | 'fill';

interface ButtonProps {
  label: string;          // printed. From COPY when the sentence exists on both platforms.
  name: string;           // REQUIRED, always. What is announced.
  as?: 'button' | 'link';
  tone?: ButtonTone;      // default 'secondary'
  size?: ButtonSize;      // default 'row'
  width?: ButtonWidth;    // default 'hug'
  onPress(): void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;     // toggles only: Hold/Held, Notifications on
}
```

`name` is required and not defaulted to `label`. Every mis-named control in this codebase — "Watchlist", "Follow", "Remove", "Yes", "No", "React", "Talk", "−5s", "Close" — was one where label ≠ name, and each was found by reading rather than by a check. Requiring it moves that class of defect to compile time.

**Tones, in Late Edition.** `primary`: amber `#F0A93B` fill, `#131114` label (9.34:1). `secondary`: **no fill, 1pt rule border, primary text** — this is the fix for OBSERVED.md's "a grey 'Watchlist' button that reads as disabled" (screen 05). `quiet`: no box, secondary text, 1pt underline rule. `destructive`: 1pt Transmission Red border and red label, **never a fill**, so red only ever means trouble and never competes with amber for "press this".

**Sizes** are absolute device-independent pixels for the *box*; the *label* scales with Dynamic Type. `page` 48pt min, label at the 17/20 row step; `row` 44pt min, label 15; `inline` 44pt target with a text-sized visible mark, label 13.

**States.** `default` · `pressed` (1pt→2pt rule thickening plus a ground step, applied instantly — press feedback is not animation, so the app feels identical with motion reduced) · `focused` (DOM only: 2px amber `:focus-visible` outline, replacing the pink one at `/home/user/Reviewies/app/src/index.css:46`) · `disabled` · `busy` · `selected`. There is no `failed` state — a failed action returns the button to `default` and puts a `Note` beside it, which is what `people.tsx` and `lists.tsx` already do correctly.

`disabled` on `primary` **drops the amber fill to `rule` with tertiary label** — it never fades. `appearance.test.ts` already bans `bg-accent … disabled:opacity` on the web because "it gave a maroon block with dark red lettering: it read as broken rather than as waiting". The phone has eight of these and no guard.

`busy` keeps the label and adds a 2pt amber underline rule, and sets `accessibilityState={{ busy: true }}`. It never swaps the label for a spinner — `account.tsx:170` does that today and needed an `accessibilityLabel` workaround explicitly because "while busy the label is a spinner, which has no text to read".

**Accessibility contract.** Role `button` or `link` (`as`). Name = `name`, always non-empty. Target ≥44×44 in every size including `quiet`. `accessibilityState` carries `{ disabled, busy, selected }` and never invents `checked` — `title/[id].tsx:293` sets `checked` on a `button` role today; that control becomes `CrossOff`.

**Replaces:** `index.tsx` `cta`/`ctaQuiet`/`undo`; `watchlist.tsx` `cta`; `calendar.tsx` `cta`/`enable`; `search.tsx` `primary`/`secondary`/`retry`; `discover.tsx` `primary`/`secondary`; `title/[id].tsx` `mark`/`react`/`retry`/`posterSave`/`posterToggle`/`posterCancel`; `stats.tsx` `allTime`; `lists.tsx` `primary`/`remove`; `people.tsx` `primary`/`small`/`link`; `account.tsx` `primary`/`secondary`/`toggle`; `data.tsx` `primary`/`secondary`; `comments/[targetId].tsx` `primary`/`secondary`/`deleteComment`/`removeAttached`; `+not-found.tsx` `cta`/`ctaQuiet`; `_layout.tsx` `retry`/`retryQuiet`; `MatchImports` `primary`/`skip`; `ImportFiles` `button`/`buttonPrimary`/`restore`; `AddToList` `add`/`toggle`; `ContentWarnings` `toggle`/`vote`/`link`; `WhereToWatch` `link`/`region`; `ListenSync` `button`/`quiet`; `CatchUp` `done`/`link`; `FailureBanner` `dismiss`. **45 styles → 4 tones × 3 sizes.**

---

## 2. `Section` — the rule label

```ts
interface SectionProps {
  label: string;                  // given in sentence case; the component sets it in caps
  count?: number;                 // rendered through Data, right of the rule
  action?: { label: string; name: string; onPress(): void };
  status?: NoteProps;             // see #7 — renders instead of children
  children?: ReactNode;
}
```

No variants. One section head everywhere: 11/12 Archivo Narrow 700 caps at +0.12em in tertiary, and a 1pt rule running from the last word to the right edge. The direction is right that this device alone does most of the work of making the app look printed, and it is already latent in the build — `calendar.tsx` "TELL ME ABOUT", `data.tsx` "EXPORT", `RemotePanel` "DEVICE" — just written out eight times with two different letter-spacings.

`status` is the important prop and the reason `Section` is not dumb. Six screens have shipped a bug of the shape *a failed fetch rendering as "nothing here"* (`lists.tsx` §6.57, `people.tsx` §6.59, `WhereToWatch` §6.58, `comments` sealed-vs-empty, `ContentWarnings`, `Search`). Putting the three-way status on the container that owns the content makes the distinction structural instead of remembered.

**States:** `ready` (children) · `empty` · `working` · `failed` — the last three delegate to `Note`.
**A11y:** the label is `accessibilityRole="header"`; the rule is decorative and must not enter the reading order. `count` is announced as part of the header string, not as a separate node — `people.tsx:334` concatenates it correctly today and that behaviour is preserved. `action` is a `Button tone="quiet" size="inline"`.

**Replaces:** `sectionHeading` in `stats.tsx`, `people.tsx`, `title/[id].tsx` (`seasonHeading`), `data.tsx`, `calendar.tsx`, `WhereToWatch`, `CatchUp` (`gridLabel`), `RemotePanel`; plus `calendar.tsx` `dayHeading` and `more.tsx`'s ungrouped link list.

---

## 3. `Masthead` — 16 routes. Phone-only expression.

```ts
interface MastheadProps {
  title: string;
  back?: { name: string };        // omitted on the five tabs
  line?: ReactNode;               // the mono transmission line: 264 WATCHES · 12 TRACKED · 5.5 DAYS
  action?: { label: string; name: string; onPress(): void };
}
```

30/32 Archivo Expanded 700 caps at +0.02em, wrapping to three lines at 200% with no fixed height.

**This requires `headerShown: false` on the Stack in `/home/user/Reviewies/mobile/app/_layout.tsx:129`, and that is a real cost.** `headerTitleStyle` will take a `fontFamily`, but the header height, the back-chevron, and large-title behaviour belong to UIKit and will not honour a three-line wrap at 200%. So the app draws its own. What is lost: the native back *label*. What is kept: the swipe-back gesture, which is `react-native-screens` and survives `headerShown: false`. What is gained: the nine pushed screens get `accessibilityRole="header"` for the first time — on the web export today their titles are not headers at all.

**States:** one, plus `back` present/absent. **A11y:** title is `accessibilityRole="header"`; `back` is a 44×44 `Button as="button"` with a required name (never bare "Back" — `watching/[targetId].tsx:155` already learned this and named its close control "Leave Watching Mode" because two things on that screen said "Close").

**Replaces:** the five tab `styles.heading` declarations and all 14 `<Stack.Screen options={{ title }} />` call sites across ten files.

**Why phone-only:** the web's chrome is `react-router` + a persistent nav, not a push stack. The shared half is the type step and the caps/tracking rule, which live in the shared scale table (below).

---

## 4. `Poster` — 6 routes, 7 call sites

```ts
type PosterShape = 'plate' | 'spine';
type PosterSize  = 'row' | 'grid' | 'page' | 'shelf' | 'ask';  // 44×66 · 64×96 · 96×144 · 34×150 · 40×56
type PosterState = 'artwork' | 'none' | 'loading' | 'failed';

interface PosterProps {
  url?: string;
  name: string;
  kind: 'show' | 'film';
  year?: number;
  label?: LabelColour;            // one of the 8 test-card colours; derived in core from the title id
  size: PosterSize;
  shape?: PosterShape;            // default 'plate'; size 'shelf' forces 'spine'
  state: PosterState;             // GIVEN, never inferred from url === undefined
  onRetry?: { name: string; run(): void };   // required when state === 'failed'
}
```

`state` is passed, not derived. Today `/home/user/Reviewies/mobile/src/ui/Poster.tsx:23` branches on `if (!url)` and therefore renders a title that has no artwork and a title whose fetch failed identically — which is precisely the distinction the house standard says must be kept. That is why this component forces the core change named at the top.

The four states are the direction's, unchanged: **the tipped-in plate** (2pt corners, 1pt rule border so a dark poster does not dissolve into the page, 4pt label band at the foot); **the spine** (6pt band, title in Archivo Narrow 700 caps in *primary* text — a title is content, not chrome — a mono `SERIES · 2019` pinned to the bottom, 1pt inner rule inset 4pt); **the test card at rest** (a still 1pt circle-and-crosshair, no shimmer); **no signal** (45° 1pt hatch, mono `NO SIGNAL` chip, retry where one is offered).

The spine's 15→10pt auto-fit is computed by `spineStep(boxWidth, name)` in core and returns a step from the shared scale. Not `adjustsFontSizeToFit` — that is iOS-only, has no web equivalent, and fights `allowFontScaling`, which `phoneTextScaling.test.ts` guards.

**Accessibility contract.** `Poster` sets **no role** — it is an image, and in six of seven call sites it sits inside a Pressable that already carries `role=link` and the name. It contributes one label in four shapes, owned by `COPY.poster`:
`Poster for {name}` / `…, no artwork` / `…, loading` / `…, could not load`.
Today the web's fallback at `/home/user/Reviewies/app/src/ui/Poster.tsx:16` is `aria-hidden="true"`, so a missing poster announces nothing at all on either platform — a screen reader gets none of the three-way distinction the eye is about to get.

**Replaces:** all 7 `<Poster>` call sites (`index.tsx:252`, `search.tsx:188`, `discover.tsx:107`, `watchlist.tsx:91`, `calendar.tsx:182`, `title/[id].tsx:97`, `MatchImports.tsx:138`) and the web's `Poster.tsx`.

---

## 5. `Row` — 9 routes, 10 implementations

```ts
type RowDensity = 'listing' | 'index';   // full-bleed listing row · the More contents line with leader dots

interface RowProps {
  lead?: ReactNode;                       // <Poster size="row"/>, a <Data/> time, or nothing
  title: string;
  code?: string;                          // 'S02·E07' — set through Data
  meta?: string;                          // episode name, or 'Series · 2021'
  tag?: string;                           // 'AIRS FRI' — mono chip
  note?: string;                          // Newsreader italic: the watchlist 'why you saved it'
  open?: { name: string; run(): void };   // at most one navigation target
  trailing?: ReactNode;                   // <CrossOff/> | <Button size="row"/> | chevron
  struck?: boolean;
  disabled?: boolean;
  density?: RowDensity;
}
```

Full bleed, no card fill, no radius, 1pt bottom rule, ≥66pt with a poster and ≥44pt without. This is where the direction's refusal ("every card in the current build is a rounded fill doing a rule's job") gets cashed: 39 `backgroundColor: theme.surface` card declarations become one rule.

`struck` is the *result* of the cross-off (title steps primary→secondary, the stroke, the 2pt settle); `CrossOff` owns the *control*. They are separate because the title page shows struck rows for episodes marked elsewhere, with no animation and no undo window.

**States:** `ready` · `struck` · `pressed` · `disabled` (an unaired episode: tertiary text, `accessibilityState.disabled`, an `AIRS FRI` tag instead of a ring — never a fade) · `busy` (a write in flight; the row must not look failed). Empty/loading/failed belong to the enclosing `Section`, not to a row.

**Accessibility contract — the load-bearing part.** A row is not one control. It exposes **at most one navigation target and one action**, and every name includes the title, because a screen of rows is the same two words repeated down the page. The codebase has learned this three separate times in comments (`search.tsx:201`, `title/[id].tsx:272`, `people.tsx:285`) and `calendar.tsx:169` still gets it wrong — the whole entry is a single Pressable labelled `Open {name}`, so the episode code and name are announced twice or not at all. Encoding it: `open.name` and every `trailing` name are required strings.

**Replaces:** `index.tsx` `Row`, `search.tsx` `ResultRow`, `discover.tsx` `Row`, `watchlist.tsx` `Row`, `calendar.tsx` entry, `title/[id].tsx` `EpisodeRow`, `MatchImports` candidate, `lists.tsx` item, `more.tsx` link (as `density="index"`), `people.tsx` person.

**Built, with two departures and two of ten migrated (§6.97).** `RowOpen` is `{ name }` only: the *name* of a target is the shared rule, and *how* it navigates is not — React Native pushes a route, the DOM wants a real `<a href>` so middle-click and copy-link keep working, so each renderer extends it with its own. And "at most one action" reads as a *naming* rule rather than a counting one, because three screens genuinely offer three and each already names its row; the component has one target, one `trailing`, and an `under` slot for a group, with the rule on the block so the group shares the row's ruled band. Calendar and watchlist are migrated on both platforms — calendar being the row this section named as still getting the naming wrong. The other eight are sprint 13.

---

## 6. `Data` — every screen that has a number

```ts
type DataSize = 'inline' | 'figure' | 'timecode';   // 13/16 · 34/36 · 34/36

interface DataProps {
  children: string;
  size?: DataSize;          // default 'inline'
  name?: string;            // the spoken form, when the printed form is not sayable
}
```

IBM Plex Mono 500 with `tabular-nums`, in one place, so no call site writes `fontVariant` or `font-variant-numeric` again. Today exactly two places set it — `watching/[targetId].tsx:352` and `CatchUp.tsx:196` — so every other number in a data-dense tracker jitters as it updates.

This is the personality carrier and it is also the thing that makes a dense list survive 200% text: tabular mono gives predictable column widths, so `S02E07` cannot wrap to two lines.

`name` exists because `S02·E07` read aloud is "S zero two dot E zero seven". The spoken form comes from `COPY.episode.spoken(season, number)` in core — copy has one owner, and this is copy.

**States:** none. It is text. **A11y:** no role. `timecode` is not a live region — it changes every second and announcing it would be intolerable; it stays reachable by swipe.

**Replaces:** `more.tsx` `statValue`, `stats.tsx` `figureValue`/`tallyTime`/`tallyCount`, `watching` `clock`, `CatchUp` `cellText`, and roughly forty inline template strings that concatenate `S{n}E{n}`, runtimes, counts, years and dates into the body face.

---

## 7. `Note` — the house standard, made into a type

```ts
type Act = { label: string; name: string; run(): void };

type NoteProps =
  | { kind: 'nothing'; children: string; action?: Act }
  | { kind: 'working'; children: string; progress?: { done: number; total: number } }
  | { kind: 'failed';  children: string; action: Act };          // action REQUIRED
```

Exactly three kinds, closed, and deliberately without `info` or `success` — those are ordinary body text. `children` comes from `COPY`, never a literal.

- **`nothing`** — secondary text. No colour, no icon. A void said plainly.
- **`working`** — secondary text plus a determinate 2pt amber rule and `Data` showing `3/12` when `progress` is given. Where the total genuinely is not known, a 1pt travelling line that **stops dead under reduced motion** while the sentence stays — because the animation alone cannot distinguish working from stuck. `accessibilityLiveRegion="polite"`, `accessibilityState={{ busy: true }}`.
- **`failed`** — Transmission Red text (`#F2585C` dark / `#B3282C` light), a 1pt red left rule, never a fill. `accessibilityLiveRegion="polite"`.

`action` being **required on `failed` at the type level** is the point of the union. "A message with no action is only a nicer way of being stuck" is written in a comment at `search.tsx:100` and is honoured in about half the failure sites; the type makes it unforgeable.

This is also where Late Edition's colour split lands. Today `theme.accent` (`#ff5c7a`) is simultaneously every primary button and every failure message — 21 text sites. Amber becomes primary; red becomes failure-only.

**Replaces:** all 21 accent-coloured failure texts; all 12 `<ActivityIndicator>` (every one either has a known count → determinate `working`, or is a fetch with a deadline → `working`, or is a local SQLite read that completes in a frame → nothing at all; **a spinner is not a state**); every bare `Loading…` string in `CatchUp`, `AddToList`, `ContentWarnings`, `people.tsx`, `title/[id].tsx`.

---

## 8. `Field`

```ts
type FieldSize = 'line' | 'block';      // single line · multiline, ≥80pt

interface FieldProps {
  value: string;
  onChange(v: string): void;
  name: string;                          // REQUIRED
  placeholder?: string;                  // from COPY where the sentence is shared
  size?: FieldSize;
  trailing?: ReactNode;                  // the Save / Add button
  status?: NoteProps;                    // the failure sits with the field, not three lines below
  autoFocus?: boolean;
  secure?: boolean;
  keyboard?: 'text' | 'email';
}
```

Sunken well ground, 1pt rule, 2pt corner, ≥44pt. This is the fix for screen 04, where the highest-contrast element on an otherwise empty screen is an empty input wearing a 2pt near-white outline.

**States:** `empty` (placeholder in tertiary) · `filled` · `focused` (the rule thickens 1pt→2pt in amber — a rule thickening, not a glow) · `disabled` · `failed` (rule goes red, `status` renders beneath).

**A11y:** `name` is required — five of the eleven current inputs have no `accessibilityLabel` at all (`search.tsx:84`, `lists.tsx:108`, `account.tsx:142,152`, `comments:157`), which on the phone leaves them announced as an unlabelled edit box. Failure is announced by the adjacent live-region `Note` on both platforms, and additionally by `aria-invalid` + `aria-describedby` on the DOM — React Native's `accessibilityState` has no `invalid`, which is a divergence, not a choice.

**Replaces:** 11 `TextInput`s across `search`, `watchlist`, `lists`, `people` (×2), `account` (×2), `title/[id]`, `comments`, `watching`, `AddToList`.

---

## 9. `Choice` — the radiogroup

```ts
type ChoiceDensity = 'chips' | 'rows';
interface Choice<T extends string | number> { key: T; label: string; hint?: string }

interface ChoiceProps<T extends string | number> {
  name: string;                          // the group's accessible name — REQUIRED
  options: readonly Choice<T>[];
  value: T;
  onChange(next: T): void;
  density?: ChoiceDensity;               // default 'chips'
}
```

`chips` — mono label in a 1pt rule box, ≥44pt, **selected = a 3pt amber underline rule plus the label stepping tertiary→primary**. Not a fill: a filled chip on a ruled page is the last card left in the app, and a rule-plus-weight selection has two channels instead of colour alone.
`rows` — full-bleed ruled rows carrying the hint line, with a right-aligned mono `✓` and a 3pt amber left rule when selected. This is `calendar.tsx`'s notification picker, which is the best-behaved control in the build.

**A11y:** container `accessibilityRole="radiogroup"` + name; each option `accessibilityRole="radio"` with `accessibilityState={{ checked, selected }}` and `accessibilityLabel = "{label} — {hint}"`, which is exactly the pattern `calendar.tsx:88` already uses. **This fixes the Watching Mode density chips**, which are `accessibilityRole="button"` carrying `accessibilityState={{ selected }}` at `minWidth: 26, minHeight: 24` — a radio wearing a button's role at half the target size, on the flagship screen.

**Replaces:** `stats.tsx` `Chip` (windows + years), `comments` `EFFORT_LEVELS`, `watching` `REACTION_DENSITY_CHOICES`, `WhereToWatch` `REGIONS`, `calendar` `NOTIFY_OPTIONS`. The option data already lives in core for four of the five — this consumes it rather than duplicating it.

---

## 10. `CrossOff` — the signature move

```ts
interface CrossOffProps {
  watched: boolean;
  disabled?: boolean;                    // unaired
  name: string;                          // REQUIRED: 'Mark Andor S02E07 watched' / 'Unmark …'
  onChange(next: boolean): void;
  undoWindowMs?: number;                 // default 6000
  onUndo?: () => void;
}
```

A 44pt open ring at the row's right edge. Tap: the stroke draws left-to-right across the episode title over 220ms in pencil `#8A8079` (dark) or biro blue `#2F3F86` (light), the ring fills amber and takes a tick, the row's text steps primary→secondary, the row settles 2pt. The existing light haptic fires.

**States:** `open` (empty ring, 1.5pt `rule` stroke) · `pressed` · `drawing` · `struck` · `undoable` (the ring's slot holds a mono `UNDO` chip for 6s) · `disabled` (unaired: ring at `rule` 40%, `accessibilityState.disabled`, a mono `AIRS FRI` tag in the row).

**There is no loading state, deliberately.** `markWatched` writes to SQLite and the change listener re-runs the query; the comment at `index.tsx:218` says so — "optimistic by construction; nothing waits on a network round-trip". Inventing a spinner here would misrepresent the local-first premise. Say it in the component's doc comment so nobody adds one.

**Undo lives here, not on the screen.** `unwatchLatest` exists in the repo and is surfaced at `index.tsx:82` as a banner ~200pt from the tap, and nowhere at all on the title page. The chip in the ring's own slot is the fix; it is a second named control (`Undo marking Andor S02E07 watched`) and must not steal focus.

**A11y:** `accessibilityRole="checkbox"` with `accessibilityState={{ checked: watched, disabled }}`. The ring *is* a checkbox — an open circle you fill — which is what `title/[id].tsx:292` was reaching for when it put `checked` on a `button`. 44×44. The stroke is never the only signal: the filled ring, the tick, and the text-colour step each carry it.

**Reduced motion:** stroke, fill and tick appear in one frame; haptic intact; no settle. Nothing here moves for more than five seconds, so WCAG 2.2.2 asks nothing of it.

**Replaces:** `index.tsx` `watched`/`undoRow`/`undo`, `title/[id].tsx` `mark`/`marked`, and the web's equivalents in `UpNext.tsx`/`TitleDetail.tsx`.

**Built, with two departures from the above (§6.96).** The undo chip is a *sibling* of the ring, not the occupant of its slot: replacing the ring hides the filled state somebody just earned, and on the web unmounting the button that was just activated drops focus to the body. And the `drawing` state is not built — neither renderer draws a travelling stroke, so `duration.crossOff` stays in `tokens.ts` and is not in the contract; a number in a table that nothing reads is a decision that looks made and is not. The ink step is owned by the component (`crossedOffText` / `crossedOff`) rather than spelled at each row, and `crossOff.test.ts` checks that nothing outside it draws a line.

---

## 11. `Progress`

```ts
type ProgressProps =
  | { kind: 'determinate'; done: number; total: number; name: string }
  | { kind: 'unknown'; name: string };
```

2pt amber rule on a well track. `unknown` is a 1pt travelling line that **stops under reduced motion**, and it may never be used where a count exists — the import knows it is on 3 of 12.

**A11y:** `accessibilityRole="progressbar"` + `accessibilityValue={{ min: 0, max: total, now: done }}`; `<progress>` on the DOM.

**Replaces:** the geometry-free status text in `MatchImports.tsx:104` ("the one number the person cares about has no shape"), `ImportFiles`, `RemotePanel` `progressTrack`/`progressFill`.

**Explicitly not:** `stats.tsx` `barTrack`/`barFill`. That is a chart bar and it means the opposite thing. It keeps its own component in the eight test-card label colours. Today the two are pixel-identical and that is a real ambiguity.

---

## 12. `Sheet`

```ts
interface SheetProps {
  title: string;
  close: { name: string };
  footnote?: string;
  children: ReactNode;
}
```

States: open only — the parent owns mounting, which `CatchUp` gets right for a documented reason ("a sheet that disappears at the instant it has something to say is worse than no sheet"). Reduced motion → `animationType="none"`, already correct at `CatchUp.tsx:60`.

Hosts `CatchUp` and Watching Mode's new `Adjust` sheet. **Diverges:** React Native's `Modal` gives focus containment and hardware-back for free; the DOM needs `useDialog` (already at `/home/user/Reviewies/app/src/ui/useDialog.ts`) for the focus trap and Escape. The backdrop is a named Pressable on the phone and `aria-hidden` on the DOM.

---

## 13–16. The flagship four

**`ChannelStrip`** — phone-only, one call site, five tabs. Well ground, 1pt top rule, active tab marked by a **3pt full-width amber rule** plus label stepping tertiary→primary and 400→700 — three channels, where today it is pink tint alone. Icons become drawn 24pt line marks at 1.75pt stroke: a listing row with a tick, a magnifier over a page, the test-card crosshair, three tape spines, a contents mark. `☰` for Watchlist and `⋯` for More are semantically wrong today and this is a comprehension fix, not a restyle. Up Next gains a mono count badge with a full name (`Up Next, 7 episodes waiting`) — the app's central question currently gets no answer on the bar.
**Cost to name:** the phone has no `react-native-svg`. Three of the five marks are rules and rectangles and can be Views; the crosshair and magnifier need arcs. Add `react-native-svg` (Expo-supported) and share the path table with the web's existing `/home/user/Reviewies/app/src/ui/TabIcon.tsx`, which already holds nine drawn paths for exactly the reasons this direction gives. Roles come from expo-router's `Tabs` (`tab` inside `tablist`) unchanged.

**`Key`** — the printed remote fascia, shared by `/home/user/Reviewies/mobile/app/remote.tsx` and `RemoteDrawer`, and by the web's `/home/user/Reviewies/app/src/remote/RemoteDrawer.tsx` over the relay. `KeySize = 'pad' | 'wide' | 'centre'`. Mono legends replace the emoji: screen 14 shows orange `⏪`/`⏩` colour emoji sitting beside flat vector triangles, at whatever size the emoji font decides. States must include **`disabled` until a device is found** — today every key renders pressable with nothing attached, which is a defect this component closes (`accessibilityState.disabled` + `rule` strokes). Names are already right in `RemotePanel` and are kept verbatim.
**Built (§6.96).** One table in `core/src/ui/key.ts`; the three surfaces had three of their own, disagreeing about the mark, the name and how far one press of skip moves. Legends carry `U+FE0E` where a triangle is still right, because a bare `▶` is emoji-presentation by default on several platforms. Disabled is per key rather than a `fieldset` at 40% opacity, and it is a hairline rule with tertiary ink — the fade the doc bans was doing the work of telling somebody there is no television yet. The web's duplicate `RemoteCommand` union now re-exports the core's `Command`.

**`PadCell`** — Watching Mode. 3 columns, 108pt tall, cells sharing 1pt rules with no gaps, emoji 40pt, label Archivo Narrow 700 caps 11 in **primary** text. Today it is 4-across at 23% width with a 9pt muted label — unreadable in a dark room at arm's length, which is the only room this screen is used in. `accessibilityLabel = 'React with {label}'` is already correct and is kept.

**`ReactionStrip`** — `{ reactions, positionMs, density, held }`. A 96pt band bounded top and bottom by 1pt rules with a hairline timeline and a 6pt tick per reaction. Four states, and the third is the one that matters: `running` · `held` · `resting` (`COPY.watching.streamResting`) · **`never`** — mono `NO REACTIONS RECORDED — YOURS WILL BE THE FIRST`, because a band empty for a new episode must not look like a band empty because something failed. Reduced motion keeps the existing `still` branch at `ReactionStream.tsx:171` exactly as written; it is the best reduced-motion work in the build and the redesign is built around it, not over it. The burst summariser at `ReactionStream.tsx:82` is untouched. `Hold` stays a real control that stops the only thing moving for more than five seconds while the clock runs — WCAG 2.2.2, non-negotiable.

---

## Shared with the web, and how

**There is no shared React component, and there cannot be.** `app` is React DOM with Tailwind v4 class strings compiled from the `@theme` block in `/home/user/Reviewies/app/src/index.css`; `mobile` is React Native with `StyleSheet` objects. `core` is pure TypeScript with one headless React hook (`watching/usePlaybackClock.ts`) and a stated rule: "no DOM, no React Native, no assumptions about where it runs."

**What is shared is the contract, in `core/src/ui/`, with two renderers.** This is not a new pattern — it is exactly how `NOTIFY_OPTIONS`, `EFFORT_LEVELS`, `REACTION_DENSITY_CHOICES`, `CONTENT_WARNINGS`, `REGIONS`, `KIND_LABEL` and all of `COPY` already work, and `copy.test.ts` / `numbers.test.ts` / `offers.test.ts` already enforce that shape.

Each shared component ships as three files:

```
core/src/ui/button.ts            tones, sizes, the state machine, the name rules — no JSX
app/src/ui/Button.tsx            DOM renderer, Tailwind
mobile/src/ui/Button.tsx         RN renderer, StyleSheet
```

Shared: `Button`, `Section`, `Poster`, `Row`, `Data`, `Note`, `Field`, `Choice`, `CrossOff`, `Progress`, `Key`, `PadCell`, plus the contracts under `Sheet` and `ReactionStrip`.
Phone-only: `Masthead` (the web has no push stack), `ChannelStrip` (the web's nav carries eight destinations, not five).

### Where React Native and the DOM disagree, and how each is expressed

| Disagreement | Resolution |
|---|---|
| **Hairline rules.** Late Edition is built on 1pt rules. RN gives `StyleSheet.hairlineWidth` (0.5 on @2x/@3x); CSS gives 1 device-independent px. | The token `RULE` is shared; the *resolution* is per platform. A "1pt rule" is never written as a number at a call site. |
| **Fonts.** RN has no synthetic weight or width axes — every weight and width is a separate loaded family. | The shared token is a **role**: `face.masthead`, `face.row`, `face.data`, `face.review`. Phone resolves to `'Archivo_700Expanded'`, `'ArchivoNarrow_600SemiBold'`, `'IBMPlexMono_500Medium'`, `'Newsreader_400Regular'` via `expo-font`; web resolves to `Archivo` + real `font-weight`/`font-stretch` via self-hosted `@font-face`. **Self-hosted on both — never Google's CDN.** Fully offline is a house standard, and a font over the network is a font that fails on a plane. |
| **Text scaling.** The web is checked at 200% by `app/smoke.mjs`; `react-native-web` does not implement OS Dynamic Type, so the phone export renders at a fixed size whatever is asked. | The type scale is a shared table of `{ size, lineHeight, weight, tracking, face }`. The phone consumes it as numbers with `allowFontScaling` on (guarded by `phoneTextScaling.test.ts`); the web emits it as rem custom properties. Because the phone cannot be *measured* at 200%, it must be correct **by construction**: equal-width cells that reflow (the Watching Mode transport becomes 4 cells that go 2×2), no fixed-height headers, and tabular mono so codes cannot wrap. |
| **Target floors.** 24 and 44 are CSS-pixel counts and must not scale with text. | Absolute numbers on both. The precedent and its scar are already recorded: `MIN_HALF = 24` on the phone, `min-w-[48px]` on the web, and `phoneTextScaling.test.ts` exists because the web's floor was once written in rem and doubled. |
| **Focus vs press.** `:focus-visible` exists only on the DOM; a touch device has only press. | Both live in the API. Each renderer draws the one it has; neither is optional in the type. |
| **Roles.** `<button>`/`<a>`/`aria-checked` vs `accessibilityRole` + `accessibilityState`. | One prop set (`as`, `disabled`, `busy`, `selected`, `checked`, `expanded`); each renderer maps it. Both platforms already do this pairing by hand today. |
| **Hidden-but-present.** RN has no `inert`. | `RemoteDrawer.tsx:73` records the whole finding: `aria-hidden` maps to both native props and to `aria-hidden` on the web, but the closed drawer's keys stay in the Tab order under `react-native-web`. The web app uses `inert`. **Documented divergence, not shared code.** |
| **Motion.** `Animated` + `useNativeDriver` vs CSS transitions + `prefers-reduced-motion`. | Shared: the duration/easing table and the reduced-motion **substitution** rule (never removal). Both platforms already have a `useReducedMotion` hook. |
| **Invalid fields.** `accessibilityState` has no `invalid`. | Failure is announced by an adjacent live-region `Note` on both; the DOM adds `aria-invalid` + `aria-describedby` on top. |
| **Auto-fitting text.** `adjustsFontSizeToFit` is iOS-only and fights font scaling; the DOM has no equivalent. | `spineStep(width, name)` in core returns a step from the shared scale. Neither platform auto-fits. |

---

## Guards to extend, so this does not drift back

1. **The palette guard** — when this was written it was one file under `app/src/ui/` asserting seven token names byte-identical across `index.css` and `theme.ts`, plus AA for three foregrounds on three grounds. It was replaced by `/home/user/Reviewies/app/src/ui/contrast.test.ts` and `/home/user/Reviewies/app/src/ui/labelSet.test.ts` and then deleted in §6.90 when the seven colours it held went. What it should assert, and now does: every text token ≥4.5:1 on every ground it can land on; every one of the eight label colours ≥3:1 on its theme's ground (WCAG 1.4.11); and **amber is never a text token in light mode** — the direction names this as the rule people get wrong, and a rule you cannot check is a rule you do not have.
2. **`appearance.test.ts`** — today it only globs `app/src/**/*.tsx`. Add `mobile/{app,src}/**/*.tsx` and the "never fade a filled button" check, which the phone violates eight times and has never been asked about.
3. **New: one geometry guard.** No `borderRadius`, `paddingHorizontal`/`paddingVertical`, or `backgroundColor: theme.accent` outside `mobile/src/ui/` and `app/src/ui/`. This is the mechanical form of the thing this whole layer exists to stop, and it is the same shape as `oneClient.test.ts` and `dials.test.ts` — a rule with an exemption list you have to be uncomfortable to write in.
4. **`copy.test.ts`** — it did not catch that `COPY.calendar.findSomething` is written as a literal at four call sites on both platforms. Add: no string literal in a component may equal a `COPY` value.

---

## What this layer does not cover, said plainly

- It does not make the phone's 200% pass *measurable*. `react-native-web` will still render the export at a fixed size, so the phone's large-text correctness rests on construction and on reading. That gap is pre-existing, is written down in `phoneTextScaling.test.ts`, and is not closed here.
- Four of the shared components' failed and empty states are in `screenStates.ts` as `never` — nothing in this checkout has ever produced them, because they need a signed-in session and there is no service key here. `Note` and `Section` give them a shape; they do not give them a test.
- The `Poster` four-state contract is blocked on `getTitleCached` returning `{ value, failed }`. Until that lands, the fourth state is unreachable and the component should render `none`, not guess.