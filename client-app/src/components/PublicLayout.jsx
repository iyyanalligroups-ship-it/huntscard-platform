import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogIn, LogOut, Menu, ShoppingCart, UserPlus, X } from 'lucide-react';
import { api, clearSession, isLoggedIn } from '../api.js';
import { useCart } from '../cart.jsx';
import AuthModal from './AuthModal.jsx';
import NotificationBell from './NotificationBell.jsx';
import Footer from './Footer.jsx';

export default function PublicLayout() {
  const loggedIn = isLoggedIn();
  const cart = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [authMode, setAuthMode] = useState(null); // 'login' | 'register' | null
  // Where to send the visitor back to after a successful login/register
  // triggered from a child page (e.g. MagicPosterCart's login gate) --
  // null keeps the default '/'/'/dashboard' AuthModal already used.
  const [authRedirect, setAuthRedirect] = useState(null);
  function openAuth(mode, redirectTo = null) {
    setAuthMode(mode);
    setAuthRedirect(redirectTo);
  }
  const [menuOpen, setMenuOpen] = useState(false);
  // Same admin-toggled setting HomeSwitch reads for which hero to render
  // -- here it adds/removes .theme-orange on the header and (via a prop)
  // the footer. Deliberately NOT toggled on <body> for orange -- its
  // `body.theme-orange` rule flips the page to a light cream layout,
  // meant only for the logged-in dashboard; doing that here would repaint
  // the whole public site's dark background, not just swap accent colors.
  // Cyber's own body.theme-cyber rule stays dark-on-dark (just a
  // different near-black + neon accents, see styles.css), so it's safe
  // to toggle site-wide here -- without it, cyber's only visible
  // difference on public pages was nav-link hover/active states, which
  // read as "looks the same as default" at a glance.
  const [homeTheme, setHomeTheme] = useState('default');
  const navRef = useRef(null);
  const spotlightRef = useRef(null);

  useEffect(() => {
    api
      .getSiteSettings()
      .then((s) => setHomeTheme(s.homeTheme || 'default'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.classList.add('public-site-active');
    document.body.classList.toggle('theme-cyber', homeTheme === 'cyber');
    return () => document.body.classList.remove('public-site-active', 'theme-cyber');
  }, [homeTheme]);

  // Close the mobile dropdown on navigation (link clicks already do this
  // directly, but this also covers back/forward browser navigation) and on
  // any click outside the header itself.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const navItems = [
    { to: '/magic-art', label: 'Magic Poster' },
    { to: '/shop', label: 'Shop' },
    { to: '/catalog', label: 'Catalog' },
    { to: '/contact', label: 'Contact Us' },
    // Dashboard moved out of this list -- shown in nav-actions instead,
    // right next to Log out (see below), not grouped with the marketing
    // pages.
  ];

  function handleLogout() {
    clearSession();
    navigate('/');
  }

  function handleNavMouseMove(e) {
    const el = spotlightRef.current;
    const nav = navRef.current;
    if (!el || !nav) return;
    const rect = nav.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mx', x + '%');
    el.style.setProperty('--my', y + '%');
  }

  return (
    <div className="app-shell">
      <header
        className={`top-nav${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}
        ref={navRef}
        onMouseMove={handleNavMouseMove}
      >
        <div className="top-nav-power-glow" aria-hidden="true" />
        <div className="top-nav-scan-beam" aria-hidden="true" />
        <div className="top-nav-spotlight" ref={spotlightRef} aria-hidden="true" />
        <div className="top-nav-scan-particle" aria-hidden="true" />
        <div className="top-nav-corner tl" aria-hidden="true" />
        <div className="top-nav-corner br" aria-hidden="true" />
        <div className="top-nav-row">
          <div className="brand">
            <div className="brand-mark" />
            <span className="brand-name">HuntsTAG</span>
          </div>

          <div className={`nav-menu${menuOpen ? ' open' : ''}`}>
            <nav className="nav-links">
              <NavLink to="/" end onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                Home
              </NavLink>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="nav-actions">
              <NavLink
                to="/magic-poster-cart"
                onClick={() => setMenuOpen(false)}
                className="pill-outline public-nav-icon-button"
                aria-label={`Shopping cart${cart.totalCount ? `, ${cart.totalCount} item${cart.totalCount === 1 ? '' : 's'}` : ''}`}
              >
                <ShoppingCart size={18} strokeWidth={1.9} aria-hidden="true" />
                {cart.totalCount > 0 && (
                  <span className="public-cart-count">
                    {cart.totalCount}
                  </span>
                )}
              </NavLink>
              {loggedIn && <NotificationBell />}
              <span className="status-indicator public-online-status" title="Online">
                <span className="status-dot" />
                <span>Online</span>
              </span>
              <div className="public-account-actions">
                {loggedIn ? (
                  <>
                    <NavLink to="/dashboard" onClick={() => setMenuOpen(false)} className="pill-outline public-account-action public-dashboard-action">
                      <LayoutDashboard size={17} strokeWidth={1.9} aria-hidden="true" />
                      <span>Dashboard</span>
                    </NavLink>
                    <button className="pill-outline public-account-action public-logout-action" onClick={handleLogout}>
                      <LogOut size={17} strokeWidth={1.9} aria-hidden="true" />
                      <span>Log out</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="pill-outline public-account-action" onClick={() => openAuth('login')}>
                      <LogIn size={17} strokeWidth={1.9} aria-hidden="true" />
                      <span>Log in</span>
                    </button>
                    <button
                      className="pill-outline public-account-action"
                      style={{
                        background: homeTheme === 'orange' ? 'linear-gradient(120deg, #ffcf5c, #ff8a3d, #ff5e1a)' : 'var(--holo-gradient)',
                        color: homeTheme === 'orange' ? '#1a0e04' : '#06120f',
                        border: 'none',
                      }}
                      onClick={() => openAuth('register')}
                    >
                      <UserPlus size={17} strokeWidth={1.9} aria-hidden="true" />
                      <span>Register</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="nav-menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen
              ? <X size={20} strokeWidth={2} aria-hidden="true" />
              : <Menu size={20} strokeWidth={2} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="public-page-shell">
        <Outlet context={{ openLogin: (redirectTo) => openAuth('login', redirectTo) }} />
      </main>

      <Footer homeTheme={homeTheme} />

      {authMode && (
        <AuthModal
          mode={authMode}
          redirectTo={authRedirect}
          onClose={() => {
            setAuthMode(null);
            setAuthRedirect(null);
          }}
        />
      )}
    </div>
  );
}
