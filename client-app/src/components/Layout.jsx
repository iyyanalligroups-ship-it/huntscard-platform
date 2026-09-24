import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, clearSession, getImpersonatedBy } from '../api.js';

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
  posterOrders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/><path d="M16.5 14.5c0 1.1-.9 2-2 2H13a1.5 1.5 0 0 0 0 3h.5"/></svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
  ),
};

const DASHBOARD_ITEM = { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true };

const NAV_GROUPS = [
  {
    id: 'account',
    label: 'Account & connections',
    icon: 'profile',
    items: [
      { to: '/dashboard/appointments', label: 'Appointment Requests', icon: 'appointments' },
      { to: '/dashboard/profile', label: 'Profile', icon: 'profile' },
      { to: '/dashboard/settings', label: 'Profile Settings', icon: 'profileSettings' },
      { to: '/dashboard/contacts', label: 'Contacts', icon: 'contacts' },
    ],
  },
  {
    id: 'studio',
    label: 'Studio & AR',
    icon: 'arLayout',
    items: [
      { to: '/dashboard/ar-layout', label: 'AR Layout', icon: 'arLayout' },
      { to: '/magic-camera', label: 'Magic Camera', icon: 'magicArt' },
      { to: '/dashboard/magic-business-card', label: 'Magic Business Card', icon: 'magicArt' },
    ],
  },
  {
    id: 'orders',
    label: 'Shop & orders',
    icon: 'shop',
    items: [
      { to: '/dashboard/upgrade', label: 'Shop', icon: 'shop' },
      { to: '/dashboard/track', label: 'Track Orders', icon: 'track' },
      { to: '/dashboard/magic-poster-orders', label: 'Magic Poster Orders', icon: 'posterOrders' },
    ],
  },
  {
    id: 'support',
    label: 'Help & settings',
    icon: 'chat',
    items: [
      { to: '/chat', label: 'Chat Support', icon: 'chat' },
      { to: '/dashboard/account-settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const ALL_NAV_ITEMS = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((group) => group.items)];

const ACCENT_THEMES = [
  { id: 'teal', label: 'HuntsTAG Teal', color: '#0d9394' },
  { id: 'violet', label: 'Royal Violet', color: '#7367f0' },
  { id: 'amber', label: 'Warm Amber', color: '#e58a16' },
];

function matchesPath(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const topbarToolsRef = useRef(null);
  const searchInputRef = useRef(null);
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(NAV_GROUPS.map((group) => [group.id, true])));
  const [accentTheme, setAccentTheme] = useState(() => {
    if (typeof window === 'undefined') return 'teal';
    return window.localStorage.getItem('huntstag-dashboard-accent') || 'teal';
  });
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
    document.body.classList.add('client-dashboard-active');
    document.body.classList.toggle('theme-orange', homeTheme === 'orange');
    document.body.classList.toggle('theme-cyber', homeTheme === 'cyber');
    return () => document.body.classList.remove('client-dashboard-active', 'theme-orange', 'theme-cyber');
  }, [homeTheme]);

  useEffect(() => {
    window.localStorage.setItem('huntstag-dashboard-accent', accentTheme);
    document.documentElement.dataset.huntstagAccent = accentTheme;
  }, [accentTheme]);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    const activeGroup = NAV_GROUPS.find((group) => group.items.some((item) => matchesPath(item, location.pathname)));
    if (activeGroup) setOpenGroups((current) => ({ ...current, [activeGroup.id]: true }));
  }, [location.pathname]);

  useEffect(() => {
    function closeFloatingPanels(event) {
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setThemeOpen(false);
        setMenuOpen(false);
        return;
      }
      if (event.type === 'mousedown' && topbarToolsRef.current && !topbarToolsRef.current.contains(event.target)) {
        setSearchOpen(false);
        setThemeOpen(false);
      }
    }
    document.addEventListener('mousedown', closeFloatingPanels);
    document.addEventListener('keydown', closeFloatingPanels);
    return () => {
      document.removeEventListener('mousedown', closeFloatingPanels);
      document.removeEventListener('keydown', closeFloatingPanels);
    };
  }, []);

  function handleLogout() {
    clearSession();
    navigate('/');
  }

  // Never impersonate silently -- see api.js's getImpersonatedBy and the
  // backend's POST /admin/clients/:clientId/impersonate. Purely cosmetic
  // (nothing here gates access), but the admin viewing this dashboard
  // should always be able to tell they're in someone else's account, not
  // their own.
  const impersonatedBy = getImpersonatedBy();

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

  const currentPage = [...ALL_NAV_ITEMS].reverse().find((item) => matchesPath(item, location.pathname)) || DASHBOARD_ITEM;
  const routeClass = `dash-route-${location.pathname.replace(/^\/dashboard\/?/, '').replace(/[^a-z0-9]+/gi, '-') || 'overview'}`;
  const searchResults = navSearch.trim()
    ? ALL_NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(navSearch.trim().toLowerCase())).slice(0, 7)
    : [];

  function toggleGroup(groupId) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  function submitSearch(event) {
    event.preventDefault();
    if (!searchResults.length) return;
    navigate(searchResults[0].to);
    setNavSearch('');
    setSearchOpen(false);
  }

  return (
    <div data-accent={accentTheme} className={`dash-shell${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}>
      {menuOpen && <div className="side-overlay" onClick={() => setMenuOpen(false)} />}

      <aside className={`side-nav${menuOpen ? ' open' : ''}`}>
        <div className="side-brand-row">
          <Link to="/" className="side-brand" onClick={() => setMenuOpen(false)}>
            <div className="brand-mark" />
            <span><span className="brand-name">HuntsTAG</span><small>CLIENT PORTAL</small></span>
          </Link>
          <button type="button" className="side-close-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">{ICONS.close}</button>
        </div>

        <nav className="side-links">
          <div className="side-section-label">Workspace</div>
          <NavLink to={DASHBOARD_ITEM.to} end onClick={() => setMenuOpen(false)} className={({ isActive }) => `side-link side-dashboard-link${isActive ? ' active' : ''}`}>
            <span className="side-icon">{ICONS[DASHBOARD_ITEM.icon]}</span>
            {DASHBOARD_ITEM.label}
          </NavLink>

          <div className="side-section-label side-section-label-spaced">Management</div>
          {NAV_GROUPS.map((group) => {
            const groupActive = group.items.some((item) => matchesPath(item, location.pathname));
            const expanded = openGroups[group.id];
            return (
              <div className={`side-group${groupActive ? ' active' : ''}${expanded ? ' open' : ''}`} key={group.id}>
                <button type="button" className="side-parent" onClick={() => toggleGroup(group.id)} aria-expanded={expanded}>
                  <span className="side-icon">{ICONS[group.icon]}</span>
                  <span className="side-parent-label">{group.label}</span>
                  <span className="side-chevron">{ICONS.chevron}</span>
                </button>
                <div className="side-children" aria-hidden={!expanded}>
                  <div className="side-children-inner">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setMenuOpen(false)}
                        className={({ isActive }) => `side-link side-child-link${isActive ? ' active' : ''}`}
                      >
                        <span className="side-child-dot" />
                        <span className="side-icon">{ICONS[item.icon]}</span>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
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
        <header className="dash-topbar">
          <div className="dash-topbar-leading">
            <button className="dash-menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={menuOpen}>
              {ICONS.menu}
            </button>
            <div className="dash-page-context">
              <span>Client portal</span>
              <strong>{currentPage.label}</strong>
            </div>
          </div>

          <div className="dash-topbar-tools" ref={topbarToolsRef}>
            <form className={`dash-nav-search${searchOpen ? ' open' : ''}`} onSubmit={submitSearch}>
              <span className="dash-search-icon">{ICONS.search}</span>
              <input
                ref={searchInputRef}
                type="search"
                value={navSearch}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => { setNavSearch(event.target.value); setSearchOpen(true); }}
                placeholder="Search pages..."
                aria-label="Search dashboard pages"
              />
              <kbd>⌘K</kbd>
              {searchOpen && navSearch.trim() && (
                <div className="dash-search-results">
                  {searchResults.length ? searchResults.map((item) => (
                    <button type="button" key={item.to} onClick={() => { navigate(item.to); setNavSearch(''); setSearchOpen(false); }}>
                      <span className="side-icon">{ICONS[item.icon]}</span>
                      <span>{item.label}</span>
                      <small>Open</small>
                    </button>
                  )) : <div className="dash-search-empty">No matching page</div>}
                </div>
              )}
            </form>

            <div className="dash-theme-control">
              <button type="button" className="dash-theme-btn" onClick={() => setThemeOpen((open) => !open)} aria-label="Choose dashboard color" aria-expanded={themeOpen}>
                {ICONS.palette}
                <span className="dash-current-swatch" />
              </button>
              {themeOpen && (
                <div className="dash-theme-menu">
                  <strong>Theme color</strong>
                  <span>Choose your dashboard accent.</span>
                  {ACCENT_THEMES.map((theme) => (
                    <button type="button" key={theme.id} className={accentTheme === theme.id ? 'selected' : ''} onClick={() => { setAccentTheme(theme.id); setThemeOpen(false); }}>
                      <i style={{ background: theme.color }} />
                      {theme.label}
                      {accentTheme === theme.id && <b>✓</b>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-user-chip"><span>H</span><div><strong>HuntsTAG</strong><small>Client account</small></div></div>
          </div>
        </header>

        {impersonatedBy && (
          <div
            style={{
              background: '#7c2d12',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>Viewing as this client — signed in by admin ({impersonatedBy})</span>
            <button
              type="button"
              onClick={handleLogout}
              style={{ width: 'auto', padding: '4px 12px', background: '#fff', color: '#7c2d12', fontSize: 12 }}
            >
              End session
            </button>
          </div>
        )}
        <div className={`${isWideColumn ? 'dash-content' : isEdgeToEdge ? 'dash-content-full' : 'page-shell'} dash-route-view ${routeClass}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
