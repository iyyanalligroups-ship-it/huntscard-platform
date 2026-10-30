import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../api.js';
// The two alternate designs are only needed when the admin picks them (Home pulls in three.js).
const Home = lazy(() => import('./Home.jsx'));
const HomeD1 = lazy(() => import('./HomeD1.jsx'));
import HomeV3 from './HomeV3.jsx';

// Which homepage design is live is now an admin-toggled setting (see
// Layout.jsx's topbar switch in the admin app), not a hardcoded import --
// this replaces the D1 trial's earlier "swap the import in App.jsx to
// revert" approach with a real runtime switch. Renders nothing (not even
// a spinner) while the setting loads, since both homepages already
// render fast and a flash of one theme then the other would look worse
// than a brief blank frame.
export default function HomeSwitch() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    api
      .getSiteSettings()
      .then((s) => setTheme(s.homeTheme || 'default'))
      .catch(() => setTheme('default'));
  }, []);

  if (theme === null) return null;
  // 'default' is the engagement-focused homepage; the previous design stays
  // available as the 'cyber' option, and 'orange' keeps its own hero.
  if (theme === 'orange') return <Suspense fallback={null}><HomeD1 /></Suspense>;
  if (theme === 'cyber') return <Suspense fallback={null}><Home /></Suspense>;
  return <HomeV3 />;
}
