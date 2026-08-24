import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { UpNext } from './screens/UpNext';
import { Search } from './screens/Search';
import { TitleDetail } from './screens/TitleDetail';
import { Settings } from './screens/Settings';
import { WatchingMode } from './screens/WatchingMode';
import { Watchlist } from './screens/Watchlist';
import { EpisodeComments } from './screens/EpisodeComments';
import { Stats } from './screens/Stats';
import { Discover } from './screens/Discover';

export default function App() {
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
      <main className={immersive ? 'flex-1 overflow-hidden' : 'safe-top flex-1 overflow-y-auto pb-20'}>
        <Routes>
          <Route path="/" element={<UpNext />} />
          <Route path="/search" element={<Search />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/title/:id" element={<TitleDetail />} />
          <Route path="/watching/:targetId" element={<WatchingMode />} />
          <Route path="/comments/:targetId" element={<EpisodeComments />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {!immersive && <TabBar />}
    </div>
  );
}

const TABS = [
  { to: '/', label: 'Up Next', icon: '▶' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/discover', label: 'Discover', icon: '✦' },
  { to: '/watchlist', label: 'Watchlist', icon: '☰' },
  { to: '/stats', label: 'Stats', icon: '◔' },
  { to: '/settings', label: 'Data', icon: '⚙' },
];

function TabBar() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 border-t border-edge bg-ink/95 backdrop-blur">
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
