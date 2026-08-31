import { useCallback, useEffect } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { SCREEN, WIDE } from '@reviewies/core/ui/screen';
import { requestSync, startSyncDriver } from '@reviewies/core/sync/driver';
import { startCalendarRefresh } from '@reviewies/core/calendar/refresh';
import { startScrobbleListener } from '@reviewies/core/watching/scrobble';
import { TabIcon } from './ui/TabIcon';
import { TAB_BAR } from '@reviewies/core/ui/tabIcon';
import { More } from './screens/More';
import { NotFound } from './screens/NotFound';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { breakInEffect, breakOnRender } from './ui/breakScreen';
import { FailureBanner } from './ui/FailureBanner';
import { UpNext } from './screens/UpNext';
import { TitleDetail } from './screens/TitleDetail';
import { Settings } from './screens/Settings';
import { WatchingMode } from './screens/WatchingMode';
import { Watchlist } from './screens/Watchlist';
import { EpisodeComments } from './screens/EpisodeComments';
import { Stats } from './screens/Stats';
import { Discover } from './screens/Discover';
import { Lists } from './screens/Lists';
import { People } from './screens/People';
import { RemoteDrawer } from './remote/RemoteDrawer';

export default function App() {
  /**
   * Sync runs for the app, not for a screen.
   *
   * It used to live in the hook the account panel and the people screen happened to
   * call, so the queue drained only while one of those was on screen — and every write
   * in the app happens somewhere else. Started here it runs wherever somebody is.
   */
  useEffect(() => {
    const stop = startSyncDriver();
    // The calendar reads a cache that only screens ever filled, so a show you were
    // simply watching never learned about its next season. This keeps it current for
    // the app rather than for whoever happens to open a title.
    const stopRefresh = startCalendarRefresh();
    // The browser extension marks an episode watched when it sees you finish it, and
    // delivers that to whichever Reviewies tab is open. Started here for the same reason
    // as the sync driver: finishing an episode in a streaming tab has nothing to do with
    // which screen of this app happens to be showing. §6.42.
    const stopScrobbles = startScrobbleListener();
    // Coming back online, and coming back to the tab, are the two moments a queued
    // change is most likely to succeed.
    const wake = () => void requestSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      stopRefresh();
      stopScrobbles();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const { pathname } = useLocation();
  // Watching Mode is full-bleed: it gets used in the dark, and chrome is a distraction.
  const immersive = pathname.startsWith('/watching/');

  return (
    <div className="flex h-full flex-col">
      {/* The navigation is at the end of the document, which is right for a phone and
          wrong for a keyboard: a season of eighteen episodes puts fifty-four controls
          between the top of the page and the tab bar. Visible only when focused. */}
      {!immersive && (
        <a
          href="#tabs"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-[var(--z-skip-link)] focus-visible:rounded-pill focus-visible:border border-stroke-signal focus-visible:px-3 focus-visible:py-2 focus-visible:text-s14"
        >
          Skip to navigation
        </a>
      )}
      <FailureBanner />
      {/*
        The column is capped and centred here, once, rather than by each screen. §6.157.

        Every screen was full-bleed at every width, which is right on a phone and is what
        the web app had been reviewed as — no design pass had ever photographed it above
        420pt. At 1280 it made a row's two ends about 1,100 points apart: One Piece's title
        at the far left of Up Next and its own checkbox at the far right. `SCREEN.measure`
        carries the number and the reasoning.

        On `<main>` rather than inside it, because the scroll belongs to `<main>` and a cap
        applied further in would centre the content and leave the scrollbar at the window's
        edge — and because a per-screen cap is fifteen chances to pick a different one.

        Not on the immersive route: Watching Mode is the frame given over to the stream, and
        `EDGE_EXEMPT` already says so about the other measurement it does not take.
      */}
      <main
        className={
          immersive
            ? 'flex-1 overflow-hidden'
            : 'safe-top flex-1 overflow-y-auto pb-[calc(var(--tabbar,5rem)+1rem)]'
        }
      >
        <div
          className={immersive ? 'contents' : 'mx-auto w-full'}
          style={immersive ? undefined : { maxWidth: SCREEN.measure }}
        >
        <ErrorBoundary>
          <Routes>
            {ROUTES.map(({ path, screen: Screen }) => (
              <Route
                key={path}
                path={path}
                // Every route, not the handful somebody remembered to wrap. The
                // boundaries of §6.35 were each checked on one screen, and doing that to
                // a phone screen is what found it stranding people — so the harness
                // reaches all of them rather than whichever two get tried.
                element={
                  <Breakable name={path}>
                    <Screen />
                  </Breakable>
                }
              />
            ))}
          </Routes>
        </ErrorBoundary>
        </div>
      </main>
      {!immersive && <TabBar />}
      <RemoteDrawer />
    </div>
  );
}

/**
 * Four, the same four the phone has — literally the same since §6.140, from
 * `core/src/ui/tabIcon.ts`, because "the same five" had been two lists agreeing by hand.
 *
 * It was eight, which only fitted a phone-width bar because the labels were ten pixels —
 * and once §6.30 let them respond to the reader's text setting, the bar wrapped to two
 * rows and took 183 of 844 pixels at 200%. Eight was always too many; the phone knew it
 * and the web never followed.
 *
 * Five became four this sprint. `docs/design/architecture.md` section 2: Search and Discover
 * answered one question split by *how* you were going to answer it, and are one surface
 * now. Nothing was promoted to take the slot — five was a cap rather than a target, and the
 * bar's items are `flex-1`, so four widen rather than leaving a hole.
 */
const TABS = TAB_BAR;

/**
 * The routes, as data.
 *
 * A list rather than thirteen JSX lines so that anything which needs to apply to every
 * screen — the break harness below, and whatever comes after it — applies to every
 * screen rather than to the ones somebody edited.
 */
/*
 * `| null` because a screen is allowed to draw nothing.
 *
 * `core/src/ui/waiting.ts` gave every loading branch in the app 200ms of silence before it
 * says it is waiting — `design/between.mjs` measured nine of twenty-four interactions
 * flashing a word for 13–44ms, which is too brief to fixate and therefore not a message —
 * and a screen whose whole body is that branch has nothing else to return meanwhile.
 */
const ROUTES: Array<{ path: string; screen: () => React.JSX.Element | null }> = [
  { path: '/', screen: UpNext },
  { path: '/watchlist', screen: Watchlist },
  { path: '/title/:id', screen: TitleDetail },
  { path: '/watching/:targetId', screen: WatchingMode },
  { path: '/comments/:targetId', screen: EpisodeComments },
  { path: '/discover', screen: Discover },
  { path: '/lists', screen: Lists },
  { path: '/people', screen: People },
  { path: '/stats', screen: Stats },
  { path: '/settings', screen: Settings },
  { path: '/more', screen: More },
  // Last, and a catch-all: every address that is not one of the above. Without it
  // `<Routes>` matched nothing and rendered an empty `<main>` — see NotFound.tsx.
  { path: '*', screen: NotFound },
];

/** Breaks this screen when asked to, and does nothing at all otherwise. */
function Breakable({ name, children }: { name: string; children: React.ReactNode }) {
  breakOnRender(name);
  useEffect(() => breakInEffect(name), [name]);
  return children;
}

function TabBar() {
  /**
   * Tell the layout how tall this is.
   *
   * The bar wraps to two or three rows at large text sizes, and a fixed bottom padding
   * on the content cannot know that — so the last thing on every screen would sit under
   * it. Measured rather than guessed, because the height depends on the reader's setting
   * and on how the labels happen to wrap.
   */
  const measure = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const apply = () =>
      document.documentElement.style.setProperty('--tabbar', `${node.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
  }, []);

  return (
    <nav
      ref={measure}
      id="tabs"
      // Focusable only as a jump target, so the skip link lands here rather than
      // merely scrolling and leaving focus where it was.
      tabIndex={-1}
      aria-label="Sections"
      // Opaque. At 95% the content behind showed through, which is a subtle grubbiness at
      // the default text size and unreadable at twice it, where this bar wraps to four
      // rows and covers nearly half the screen with two layers of text at once.
      className="safe-bottom fixed inset-x-0 bottom-0 border-t border-stroke-hairline bg-ground"
    >
      {/* Wraps rather than truncating or scrolling. Eight tabs fit a phone at the
          default text size and cannot at twice it. A label cut short is content lost,
          and scrolling — which this was, briefly — is worse: it satisfies the letter of
          1.4.4 and puts half the navigation somewhere nobody knows to look. The smoke
          suite's own 200% check said so, by finding four tabs off the right-hand edge.
          Wrapping keeps every one of them on screen and visible. */}
      {/* `WIDE.navMeasure`, not `max-w-lg`. §6.159.

          The items sat in 32rem — about 460 points measured off `wide-title-the-bear.png`
          — while the content column is 720 and this bar's rule spans the whole window.
          Three widths on one screen, and the navigation was the narrowest of them, which is
          the one relationship that had no reason at all. The rule stays full-bleed: the
          direction's first named property is a rule that runs to the paper's edge. */}
      <ul
        className="mx-auto flex w-full flex-wrap justify-center"
        style={{ maxWidth: WIDE.navMeasure }}
      >
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                // Sized in pixels, like every other piece of type on the web:
                // `tokens-to-css.mjs` emits `--text-s12: 12px` and `text-s12` is that
                // custom property. This said "sized in rem" and had not been true since
                // the generated token layer landed — `poster.test.ts` states the same
                // fact from the other side, that *"the web's type is in `px` and never
                // answered the browser's font-size setting"*. The claim travelled: the
                // 200% simulation in `app/smoke.mjs` was making it too. §6.187.
                // `active:bg-ground-well` is the press, and it was missing for the life of
                // the product. §6.191 measured the interval between press and settle and
                // found 7 of 24 sampled presses never changed colour at all — every one of
                // them one of these eight. `surface.ts` says a press sinks *"one direction,
                // for every control on both platforms"*, and the controls the app is
                // navigated with, the most-pressed things in it, were not in that set.
                // The nav's ground is `bg-ground`, so the sink is `ground.well` — the same
                // 1.046 step every other web press was measured making.
                //
                // Not caught by `surface.test.ts`, which sweeps presses well and asks *does
                // every press go the right way* rather than *does every control have one*.
                // Absence is invisible to a sweep over the things that already have the
                // property. `tabPress.test.ts` asks the other question.
                `flex flex-col items-center gap-0.5 px-1 pt-2 pb-3 text-center text-s12 leading-l120 break-words active:bg-ground-well ${
                  isActive ? 'text-ink' : 'text-ink-secondary'
                }`
              }
            >
              {/*
                Children as a function, because the rule below needs `isActive` and the
                static form does not have it.

                The active tab is marked by a rule, not only by being brighter. §6.90
                replaced a pink active tint with `ink` on `ink.secondary` — a brightness
                step where there was a hue — and recorded that as a regression rather
                than shipping it quietly. This is the replacement: `TAB_MARKER`, in
                `core/src/ui/tabIcon.ts`, which the phone's tab bar reads too. Two
                channels, so the wayfinding survives being read by somebody who cannot
                separate those two greys.

                A top border rather than a filled box: `TAB_MARKER.thickness` is
                `border.tally` and has a token, where a 3px height would be an off-scale
                arbitrary value that `space.test.ts` correctly refuses.

                The three utilities below are the table, in Tailwind's units — `w-6` is
                its 24, `border-t-tally` its `border.tally`, `gap-0.5` its 2. The web
                writes generated utilities rather than inline values by decision, so
                `tabIcon.test.ts` derives these class names from `TAB_MARKER` and
                compares, rather than letting them agree with the phone by hand: the gap
                is the one that had already drifted, 2 here against 4 there.
              */}
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={`w-s24 border-t-tally ${isActive ? 'border-ink' : 'border-transparent'}`}
                  />
                  <TabIcon name={tab.icon} />
                  {tab.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
