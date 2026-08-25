import { useEffect } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { requestSync, startSyncDriver } from '@reviewies/core/sync/driver';
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
      <main className={immersive ? 'flex-1 overflow-hidden' : 'safe-top flex-1 overflow-y-auto pb-20'}>
        <Routes>
          <Route path="/" element={<UpNext />} />
          <Route path="/search" element={<Search />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/title/:id" element={<TitleDetail />} />
          <Route path="/watching/:targetId" element={<WatchingMode />} />
          <Route path="/comments/:targetId" element={<EpisodeComments />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/lists" element={<Lists />} />
          <Route path="/people" element={<People />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {!immersive && <TabBar />}
      <RemoteDrawer />
    </div>
  );
}

const TABS = [
  { to: '/', label: 'Up Next', icon: '▶' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/discover', label: 'Discover', icon: '✦' },
  { to: '/calendar', label: 'Upcoming', icon: '▦' },
  { to: '/watchlist', label: 'Watchlist', icon: '☰' },
  { to: '/lists', label: 'Lists', icon: '❏' },
  { to: '/stats', label: 'Stats', icon: '◔' },
  { to: '/settings', label: 'Data', icon: '⚙' },
];

function TabBar() {
  return (
    <nav
      id="tabs"
      // Focusable only as a jump target, so the skip link lands here rather than
      // merely scrolling and leaving focus where it was.
      tabIndex={-1}
      aria-label="Sections"
      className="safe-bottom fixed inset-x-0 bottom-0 border-t border-edge bg-ink/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
