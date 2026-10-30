import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../api.js';
// The two alternate designs are only needed when the admin picks them (Home pulls in three.js).
const Home = lazy(() => import('./Home.jsx'));
const HomeD1 = lazy(() => import('./HomeD1.jsx'));
import HomeV3 from './HomeV3.jsx';

// The last theme the API told us about. Visitors see it immediately; the API answer then confirms or
// changes it. First-time visitors start on 'default' (the live design), so the page paints without
// waiting for a network round trip, and the footer is no longer pushed down when the page appears.
const THEME_KEY = 'huntstag-home-theme';
function cachedTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY) || 'default';
  } catch {
    return 'default';
  }
}
// Keeps the footer below the fold while an alternate design's code loads.
const Holder = () => <div style={{ minHeight: '100vh' }} />;

// Which homepage design is live is now an admin-toggled setting (see
// Layout.jsx's topbar switch in the admin app), not a hardcoded import --
// this replaces the D1 trial's earlier "swap the import in App.jsx to
// revert" approach with a real runtime switch. Renders nothing (not even
// a spinner) while the setting loads, since both homepages already
// render fast and a flash of one theme then the other would look worse
// than a brief blank frame.
export default function HomeSwitch() {
  const [theme, setTheme] = useState(cachedTheme);

  useEffect(() => {
    api
      .getSiteSettings()
      .then((s) => {
        const next = s.homeTheme || 'default';
        try {
          window.localStorage.setItem(THEME_KEY, next);
        } catch { /* private mode: just skip the cache */ }
        setTheme(next);
      })
      .catch(() => {});
  }, []);

  // 'default' is the engagement-focused homepage; the previous design stays
  // available as the 'cyber' option, and 'orange' keeps its own hero.
  if (theme === 'orange') return <Suspense fallback={<Holder />}><HomeD1 /></Suspense>;
  if (theme === 'cyber') return <Suspense fallback={<Holder />}><Home /></Suspense>;
  return <HomeV3 />;
}
