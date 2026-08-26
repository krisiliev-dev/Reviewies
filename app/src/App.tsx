import { useCallback, useEffect } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { requestSync, startSyncDriver } from '@reviewies/core/sync/driver';
import { startCalendarRefresh } from '@reviewies/core/calendar/refresh';
import { startScrobbleListener } from '@reviewies/core/watching/scrobble';
import { TabIcon } from './ui/TabIcon';
import { More } from './screens/More';
import { NotFound } from './screens/NotFound';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { breakInEffect, breakOnRender } from './ui/breakScreen';
import { FailureBanner } from './ui/FailureBanner';
import { UpNext } from './screens/UpNext';
import { Search } from './screens/Search';
import { TitleDetail } from './screens/TitleDetail';
import { Settings } from './screens/Settings';
import { WatchingMode } from './screens/WatchingMode';
import { Watchlist } from './screens/Watchlist';
import { EpisodeComments } from './screens/EpisodeComments';
import { Stats } from './screens/Stats';
import { Discover } from './screens/Discover';
import { Calendar } from './screens/Calendar';
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
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-surface-2 focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm"
        >
          Skip to navigation
        </a>
      )}
      <FailureBanner />
      <main className={immersive ? 'flex-1 overflow-hidden' : 'safe-top flex-1 overflow-y-auto pb-[calc(var(--tabbar,5rem)+1rem)]'}>
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
      </main>
      {!immersive && <TabBar />}
      <RemoteDrawer />
    </div>
  );
}

/**
 * Five, the same five the phone has, with everything else behind More.
 *
 * It was eight, which only fitted a phone-width bar because the labels were ten pixels —
 * and once §6.30 let them respond to the reader's text setting, the bar wrapped to two
 * rows and took 183 of 844 pixels at 200%. Eight was always too many; the phone knew it
 * and the web never followed. Nothing moved URL, only what this bar offers.
 */
const TABS = [
  { to: '/', label: 'Up Next', icon: 'upnext' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/discover', label: 'Discover', icon: 'discover' },
  { to: '/watchlist', label: 'Watchlist', icon: 'watchlist' },
  { to: '/more', label: 'More', icon: 'more' },
];

/**
 * The routes, as data.
 *
 * A list rather than thirteen JSX lines so that anything which needs to apply to every
 * screen — the break harness below, and whatever comes after it — applies to every
 * screen rather than to the ones somebody edited.
 */
const ROUTES: Array<{ path: string; screen: () => React.JSX.Element }> = [
  { path: '/', screen: UpNext },
  { path: '/search', screen: Search },
  { path: '/watchlist', screen: Watchlist },
  { path: '/title/:id', screen: TitleDetail },
  { path: '/watching/:targetId', screen: WatchingMode },
  { path: '/comments/:targetId', screen: EpisodeComments },
  { path: '/discover', screen: Discover },
  { path: '/calendar', screen: Calendar },
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
      className="safe-bottom fixed inset-x-0 bottom-0 border-t border-edge bg-ink"
    >
      {/* Wraps rather than truncating or scrolling. Eight tabs fit a phone at the
          default text size and cannot at twice it. A label cut short is content lost,
          and scrolling — which this was, briefly — is worse: it satisfies the letter of
          1.4.4 and puts half the navigation somewhere nobody knows to look. The smoke
          suite's own 200% check said so, by finding four tabs off the right-hand edge.
          Wrapping keeps every one of them on screen and visible. */}
      <ul className="mx-auto flex max-w-lg flex-wrap justify-center">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                // Sized in rem. These labels were given a pixel size for a long time,
                // which made them the one piece of text in the app that ignored the
                // reader's setting entirely — while the icons beside them, sized in em,
                // doubled. Exactly inverted.
                `flex flex-col items-center gap-0.5 px-1 py-2.5 text-center text-[0.625rem] leading-tight break-words ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <TabIcon name={tab.icon} />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
