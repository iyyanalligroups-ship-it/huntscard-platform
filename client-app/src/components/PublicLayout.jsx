import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, clearSession, isLoggedIn } from '../api.js';
import AuthModal from './AuthModal.jsx';
import NotificationBell from './NotificationBell.jsx';
import Footer from './Footer.jsx';

export default function PublicLayout() {
  const loggedIn = isLoggedIn();
  const navigate = useNavigate();
  const location = useLocation();
  const [authMode, setAuthMode] = useState(null); // 'login' | 'register' | null
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
  const circuitSvgRef = useRef(null);

  useEffect(() => {
    api
      .getSiteSettings()
      .then((s) => setHomeTheme(s.homeTheme || 'default'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-cyber', homeTheme === 'cyber');
    return () => document.body.classList.remove('theme-cyber');
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
    { to: '/magic-art', label: 'Magic Art' },
    { to: '/shop', label: 'Shop' },
    { to: '/catalog', label: 'Catalog' },
    { to: '/contact', label: 'Contact Us' },
    ...(loggedIn ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
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

  // Circuit traces radiating out from the logo, with real light pulses
  // traveling along them -- the nav bar reads as an active circuit
  // powered from the logo, rather than lit by generic ambient blobs.
  // Rebuilt on resize since the bar's width is responsive.
  useEffect(() => {
    const svg = circuitSvgRef.current;
    const nav = navRef.current;
    if (!svg || !nav) return;

    function build() {
      const rect = nav.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.innerHTML = '';

      const colors = ['var(--holo-cyan)', 'var(--holo-violet)', 'var(--holo-magenta)'];
      const rows = 5;
      const startX = 76; // originates from the logo's power glow

      for (let i = 0; i < rows; i++) {
        const y = 14 + (i / (rows - 1)) * (h - 28);
        const color = colors[i % 3];
        const midX1 = startX + 120 + Math.random() * 60;
        const midY1 = y + (Math.random() * 16 - 8);
        const endX = w + 20;
        const d = `M ${startX} ${y} L ${midX1} ${y} L ${midX1} ${midY1} L ${endX} ${midY1}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-opacity', '0.22');
        svg.appendChild(path);

        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pulse.setAttribute('r', '2.2');
        pulse.setAttribute('fill', color);
        pulse.style.filter = 'drop-shadow(0 0 3px currentColor)';
        pulse.style.color = color;
        svg.appendChild(pulse);

        const animMotion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        animMotion.setAttribute('dur', `${3 + Math.random() * 2.5}s`);
        animMotion.setAttribute('repeatCount', 'indefinite');
        animMotion.setAttribute('path', d);
        animMotion.setAttribute('begin', `${Math.random() * 3}s`);
        pulse.appendChild(animMotion);
      }
    }

    build();
    window.addEventListener('resize', build);
    return () => window.removeEventListener('resize', build);
  }, []);

  return (
    <div className="app-shell">
      <header
        className={`top-nav${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}
        ref={navRef}
        onMouseMove={handleNavMouseMove}
      >
        <div className="top-nav-grid" aria-hidden="true" />
        <div className="top-nav-power-glow" aria-hidden="true" />
        <svg className="top-nav-circuit-svg" ref={circuitSvgRef} aria-hidden="true" preserveAspectRatio="none" />
        <div className="top-nav-scan-beam" aria-hidden="true" />
        <div className="top-nav-spotlight" ref={spotlightRef} aria-hidden="true" />
        <div className="top-nav-scan-particle" aria-hidden="true" />
        <div className="top-nav-corner tl" aria-hidden="true" />
        <div className="top-nav-corner br" aria-hidden="true" />
        <div className="top-nav-row">
          <div className="brand">
            <div className="brand-mark" />
            <span className="brand-name">HUNTSTAG</span>
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
              {loggedIn && <NotificationBell />}
              <span className="status-indicator">
                <span className="status-dot" />
                ONLINE
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                {loggedIn ? (
                  <button className="pill-outline" onClick={handleLogout}>
                    Log out
                  </button>
                ) : (
                  <>
                    <button className="pill-outline" onClick={() => setAuthMode('login')}>
                      Log in
                    </button>
                    <button
                      className="pill-outline"
                      style={{
                        background: homeTheme === 'orange' ? 'linear-gradient(120deg, #ffcf5c, #ff8a3d, #ff5e1a)' : 'var(--holo-gradient)',
                        color: homeTheme === 'orange' ? '#1a0e04' : '#06120f',
                        border: 'none',
                      }}
                      onClick={() => setAuthMode('register')}
                    >
                      Register
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
            {menuOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>
      </header>

      <main className="public-page-shell">
        <Outlet />
      </main>

      <Footer homeTheme={homeTheme} />

      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} />}
    </div>
  );
}
