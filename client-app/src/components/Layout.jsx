import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, clearSession } from '../api.js';

/* Inline SVG icons -- no icon library dependency, keeps the bundle lean. */
const ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
  ),
  profileSettings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
  ),
  arLayout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>
  ),
  huntsEngine: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 18v3"/><circle cx="12" cy="11" r="3"/><path d="M7 7.5h.01M17 7.5h.01"/></svg>
  ),
  magicArt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 13 7"/></svg>
  ),
  shop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
  ),
  track: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8h13v9H1z"/><path d="M14 11h4l3 3v3h-7"/><circle cx="6" cy="19" r="1.8"/><circle cx="17.5" cy="19" r="1.8"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10.05 3V3a2 2 0 1 1 4 0v.09c0 .68.4 1.29 1.02 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01c.27.61.88 1.02 1.56 1.02H21a2 2 0 1 1 0 4h-.09c-.68 0-1.29.4-1.56 1.02Z"/></svg>
  ),
  contacts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c0-1.8 1.8-3 4-3s4 1.2 4 3"/></svg>
  ),
  appointments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/><circle cx="15.5" cy="15.5" r="3"/><path d="M15.5 14v1.5l1 1"/></svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  ),
};

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true },
  // HuntsEngine Test intentionally hidden from the nav (2026-08-09) --
  // internal testing tool, not something a client should stumble into.
  // The route itself is untouched (App.jsx) -- still reachable directly
  // at /dashboard/huntsengine-test if needed for further testing.
  { to: '/dashboard/appointments', label: 'Appointment Requests', icon: 'appointments' },
  { to: '/dashboard/profile', label: 'Profile', icon: 'profile' },
  { to: '/dashboard/settings', label: 'Profile Settings', icon: 'profileSettings' },
  { to: '/dashboard/ar-layout', label: 'AR Layout', icon: 'arLayout' },
  // Scans the admin-uploaded Magic Art image + video (see
  // MagicCamera.jsx's own file comment) -- clients can scan here but
  // cannot upload; only the admin app's Magic Art page can. Points OUTSIDE
  // /dashboard on purpose -- this page is now public (no login required),
  // same URL a logged-out visitor would reach directly.
  { to: '/magic-camera', label: 'Magic Camera', icon: 'magicArt' },
  // Read-only preview of THIS client's own personal AR image+video,
  // admin-uploaded per client (see MagicBusinessCard.jsx's file comment) --
  // distinct from the shared gallery Magic Camera above scans.
  { to: '/dashboard/magic-business-card', label: 'Magic Business Card', icon: 'magicArt' },
  { to: '/dashboard/upgrade', label: 'Shop', icon: 'shop' },
  { to: '/dashboard/track', label: 'Track', icon: 'track' },
  // Same "points outside /dashboard" precedent as Magic Camera above --
  // ChatSupport.jsx lives on the public site (App.jsx's PublicLayout
  // routes) since it needs that layout's header/footer, not the
  // dashboard chrome.
  { to: '/chat', label: 'Chat Support', icon: 'chat' },
  { to: '/dashboard/account-settings', label: 'Settings', icon: 'settings' },
  { to: '/dashboard/contacts', label: 'Contacts', icon: 'contacts' },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Same admin-toggled setting PublicLayout.jsx reads -- adds .theme-orange
  // to the whole dashboard shell (sidebar + every page rendered through
  // Outlet below) when set, so the logged-in area matches the public
  // site's theme instead of always staying on the default holo colors.
  const [homeTheme, setHomeTheme] = useState('default');

  useEffect(() => {
    api
      .getSiteSettings()
      .then((s) => setHomeTheme(s.homeTheme || 'default'))
      .catch(() => {});
  }, []);

  // Also toggled on <body> itself, not just .dash-shell -- the sidebar is
  // position:sticky with a fixed 100vh height, which should always cover
  // the full viewport regardless of scroll, but in practice the page
  // background (body's own dark --space) was showing through as a black
  // strip under the Log out row on some scroll positions/viewport sizes.
  // Pinning body's own background removes that gap outright instead of
  // chasing the exact sticky/scroll interaction that caused it.
  useEffect(() => {
    document.body.classList.toggle('theme-orange', homeTheme === 'orange');
    document.body.classList.toggle('theme-cyber', homeTheme === 'cyber');
    return () => document.body.classList.remove('theme-orange', 'theme-cyber');
  }, [homeTheme]);

  function handleLogout() {
    clearSession();
    navigate('/');
  }

  // The overview page uses a wide (1100px, centered) grid; every other
  // page keeps the original narrow 640px centered column so existing
  // forms don't stretch. Two exceptions need more room than that:
  // - AR Layout / Appointments need the width next to the sidebar
  //   completely uncapped (a landscape drag-and-drop canvas, and a
  //   month+week calendar grid that horizontal-scrolls if squeezed).
  // - Shop's plan detail panel (photo + form side by side, up to 900px)
  //   was getting boxed into the 640px column with big empty gutters on
  //   either side, so it shares the overview page's wider 1100px cap
  //   instead -- wide enough to breathe, still capped so it doesn't run
  //   edge-to-edge on an ultrawide monitor.
  const isOverview = location.pathname === '/dashboard';
  const isWideColumn = isOverview || location.pathname === '/dashboard/upgrade';
  const isEdgeToEdge =
    location.pathname === '/dashboard/ar-layout' ||
    location.pathname === '/dashboard/huntsengine-test' ||
    location.pathname === '/dashboard/appointments';

  return (
    <div className={`dash-shell${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}>
      <button
        className="dash-menu-btn"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        {ICONS.menu}
      </button>

      {menuOpen && <div className="side-overlay" onClick={() => setMenuOpen(false)} />}

      <aside className={`side-nav${menuOpen ? ' open' : ''}`}>
        <Link to="/" className="side-brand" onClick={() => setMenuOpen(false)}>
          <div className="brand-mark" />
          <span className="brand-name">HUNTSTAG</span>
        </Link>

        <nav className="side-links">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
            >
              <span className="side-icon">{ICONS[item.icon]}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="side-footer">
          <Link to="/" className="side-link" onClick={() => setMenuOpen(false)}>
            <span className="side-icon">{ICONS.home}</span>
            Home
          </Link>
          <button className="side-link side-logout" onClick={handleLogout}>
            <span className="side-icon">{ICONS.logout}</span>
            Log out
          </button>
        </div>
      </aside>

      <main className={isWideColumn || isEdgeToEdge ? 'dash-main' : 'dash-main page-shell-wrap'}>
        <div className={isWideColumn ? 'dash-content' : isEdgeToEdge ? 'dash-content-full' : 'page-shell'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
