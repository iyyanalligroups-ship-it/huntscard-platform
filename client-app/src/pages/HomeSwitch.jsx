import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Home from './Home.jsx';
import HomeD1 from './HomeD1.jsx';

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
  return theme === 'orange' ? <HomeD1 /> : <Home />;
}
