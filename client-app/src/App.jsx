import { Component, lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { isLoggedIn } from './api.js';
import PublicLayout from './components/PublicLayout.jsx';
import Home from './pages/HomeSwitch.jsx'; // renders Home.jsx or HomeD1.jsx per the admin-toggled theme setting
import Shop from './pages/Shop.jsx';
import Catalog from './pages/Catalog.jsx';
import ContactUs from './pages/ContactUs.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Layout from './components/Layout.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Track from './pages/Track.jsx';
import Settings from './pages/Settings.jsx';
import ArLayout from './pages/ArLayout.jsx';
import Contacts from './pages/Contacts.jsx';
import Appointments from './pages/Appointments.jsx';
import PublicProfile from './pages/PublicProfile.jsx';
import MagicArt from './pages/MagicArt.jsx';
import MagicPosterCart from './pages/MagicPosterCart.jsx';
import MagicBusinessCard from './pages/MagicBusinessCard.jsx';
import Faq from './pages/Faq.jsx';
import AboutUs from './pages/AboutUs.jsx';
import WhatIsHuntsworld from './pages/WhatIsHuntsworld.jsx';
import ChatSupport from './pages/ChatSupport.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsConditions from './pages/TermsConditions.jsx';
import Impersonate from './pages/Impersonate.jsx';

// Lazy-loaded ("Mark 1" experiment) -- pulls in mind-ar/@tensorflow/tfjs,
// a heavy and still-unproven dependency. Loading it eagerly like every
// other page above would put it in the SAME shared bundle everything else
// depends on, so a problem in it could break every route in the app, not
// just this one -- lazy-loading keeps it fully isolated to the moment
// someone actually visits this specific page, matching the "fully
// isolated, delete-able" intent this experiment was built with.
const HuntsEngineTest = lazy(() => import('./pages/HuntsEngineTest.jsx'));

// Same reasoning as HuntsEngineTest above -- Magic Camera pulls in the
// same heavy mind-ar/three.js stack, kept lazy-loaded so it can't affect
// any other route's bundle.
const MagicCamera = lazy(() => import('./pages/MagicCamera.jsx'));
// A SEPARATE page from MagicCamera.jsx above, on purpose -- scans only
// targets with a 3D model set and renders just the model (no video plane
// at all), so this can be built/tuned without touching MagicCamera.jsx's
// own already-working video flow. See MagicCamera3D.jsx's own top comment.
const MagicCamera3D = lazy(() => import('./pages/MagicCamera3D.jsx'));


// Debugging aid for the Mark 1 experiment only -- a crash inside
// HuntsEngineTest (or its mind-ar/tfjs imports) would otherwise unmount
// the whole app with a silent blank page and no way to see why, since
// there's no error boundary anywhere else in this app either. Shows the
// actual error message + stack on screen instead, so it doesn't require
// digging through DevTools (especially awkward when testing over a
// phone). Delete-able along with the rest of Mark 1.
class HuntsEngineTestErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-banner" style={{ whiteSpace: 'pre-wrap' }}>
          HuntsEngine Test crashed:{'\n'}
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

// Same "show the crash instead of a blank page" reasoning as
// HuntsEngineTestErrorBoundary above -- own separate boundary, since
// Magic Camera's mind-ar pipeline is the same still-being-tuned pipeline
// that spike validated.
class MagicCameraErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-banner" style={{ whiteSpace: 'pre-wrap' }}>
          Magic Camera crashed:{'\n'}
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

// Scroll behaviour between pages:
//  - opening a page by a link / navigate() (PUSH or REPLACE) starts it at the top, instead of carrying
//    the previous page's scroll position across;
//  - going Back / Forward (POP) puts the visitor back at the exact spot they left that page, tracked
//    per history entry (location.key). Content that loads late (images, data) is waited for.
// Positions live in memory only, so a full reload still starts at the top.
const savedScroll = new Map();

function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(location.key);
  const lastYRef = useRef(0);
  const prevPathRef = useRef(null);

  // Browsers restore scroll on their own (and on reload); handle it ourselves instead.
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // Layout can still be growing (images, lazy sections) when the browser applies its own
    // restore, so re-assert the top once the page has loaded.
    const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.addEventListener('load', toTop);
    const timer = setTimeout(toTop, 150);
    return () => {
      window.removeEventListener('load', toTop);
      clearTimeout(timer);
    };
  }, []);

  // Keep track of where the visitor is on the current history entry.
  useLayoutEffect(() => {
    let frame = 0;
    function onScroll() {
      // The login/register popup pins <body> with position:fixed, which makes scrollY read 0 -- ignore it.
      if (document.body.style.position === 'fixed') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        lastYRef.current = window.scrollY;
        savedScroll.set(keyRef.current, window.scrollY);
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    // Remember where we were on the entry we are leaving.
    if (keyRef.current !== location.key && document.body.style.position !== 'fixed') {
      savedScroll.set(keyRef.current, lastYRef.current);
    }
    keyRef.current = location.key;

    const pathChanged = prevPathRef.current !== null && prevPathRef.current !== location.pathname;
    prevPathRef.current = location.pathname;

    if (navigationType === 'POP') {
      // Back / Forward: return to the saved spot, retrying while the page is still growing.
      const target = savedScroll.get(location.key) ?? 0;
      lastYRef.current = target;
      window.scrollTo({ top: target, left: 0, behavior: 'instant' });
      if (target <= 0) return undefined;
      let tries = 0;
      let cancelled = false;
      const cancel = () => { cancelled = true; };
      // A deliberate scroll by the visitor wins over the restore.
      window.addEventListener('wheel', cancel, { passive: true, once: true });
      window.addEventListener('touchstart', cancel, { passive: true, once: true });
      window.addEventListener('keydown', cancel, { once: true });
      const timer = setInterval(() => {
        tries += 1;
        if (cancelled || tries > 25) { clearInterval(timer); return; }
        if (Math.abs(window.scrollY - target) < 2) { if (tries > 3) clearInterval(timer); return; }
        window.scrollTo({ top: target, left: 0, behavior: 'instant' });
      }, 80);
      return () => {
        clearInterval(timer);
        window.removeEventListener('wheel', cancel);
        window.removeEventListener('touchstart', cancel);
        window.removeEventListener('keydown', cancel);
      };
    }

    // New page via link: start at the top. Same page with only a query/hash change (tabs, filters): stay put.
    if (pathChanged) {
      lastYRef.current = 0;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    return undefined;
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* Public site -- anyone can browse and buy without an account */}
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="contact" element={<ContactUs />} />
        <Route path="magic-art" element={<MagicArt />} />
        <Route path="magic-poster-cart" element={<MagicPosterCart />} />
        <Route path="faq" element={<Faq />} />
        <Route path="about" element={<AboutUs />} />
        <Route path="huntsworld" element={<WhatIsHuntsworld />} />
        <Route path="chat" element={<ChatSupport />} />
        <Route path="privacy-policy" element={<PrivacyPolicy />} />
        <Route path="terms-condition" element={<TermsConditions />} />
      </Route>

      {/* Public tap page -- what a stranger sees when they tap the physical
          card or scan its QR code. No login, standalone (not wrapped in
          PublicLayout's marketing-site header). */}
      <Route path="/c/:clientId" element={<PublicProfile />} />

      {/* Magic Camera -- moved here from /dashboard/magic-camera so it's
          reachable with NO login at all (its data, GET /api/public/magic-art,
          was already unauthenticated -- only this route was gated). Standalone
          like /c/:clientId above, not wrapped in PublicLayout's marketing
          header, since this is a full camera/AR experience. Logged-in users
          reach the SAME url from the dashboard nav (see Layout.jsx). */}
      <Route
        path="/magic-camera"
        element={
          <MagicCameraErrorBoundary>
            <Suspense fallback={<p className="subtitle">Loading…</p>}>
              <MagicCamera />
            </Suspense>
          </MagicCameraErrorBoundary>
        }
      />
      {/* Same page, scoped to one client -- reached from that client's own
          AR QR via the "choose AR or Magic" screen in PublicProfile.jsx.
          MagicCamera.jsx reads :clientId itself (useParams) to compile/
          track just their one Magic Business Card instead of the full
          gallery the bare /magic-camera route above still scans. */}
      <Route
        path="/magic-camera/:clientId"
        element={
          <MagicCameraErrorBoundary>
            <Suspense fallback={<p className="subtitle">Loading…</p>}>
              <MagicCamera />
            </Suspense>
          </MagicCameraErrorBoundary>
        }
      />
      {/* Separate 3D-model-only camera -- same "reachable with no login"
          and "same url reached from the dashboard" reasoning as
          /magic-camera above, kept on its own route/page entirely so it
          can't affect that one's already-working video flow. See
          MagicCamera3D.jsx's own top comment. */}
      <Route
        path="/magic-camera-3d"
        element={
          <MagicCameraErrorBoundary>
            <Suspense fallback={<p className="subtitle">Loading…</p>}>
              <MagicCamera3D />
            </Suspense>
          </MagicCameraErrorBoundary>
        }
      />
      <Route
        path="/magic-camera-3d/:clientId"
        element={
          <MagicCameraErrorBoundary>
            <Suspense fallback={<p className="subtitle">Loading…</p>}>
              <MagicCamera3D />
            </Suspense>
          </MagicCameraErrorBoundary>
        }
      />

      <Route path="/login" element={<Login />} />
      <Route path="/impersonate" element={<Impersonate />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        }
      />

      {/* Authenticated area -- unchanged from before, just now reached
          via Login rather than being the whole app */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route
          path="huntsengine-test"
          element={
            <HuntsEngineTestErrorBoundary>
              <Suspense fallback={<p className="subtitle">Loading…</p>}>
                <HuntsEngineTest />
              </Suspense>
            </HuntsEngineTestErrorBoundary>
          }
        />
        <Route path="magic-business-card" element={<MagicBusinessCard />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="profile" element={<Dashboard />} />
        <Route path="settings" element={<Profile />} />
        <Route path="ar-layout" element={<ArLayout />} />
        <Route path="upgrade" element={<Shop />} />
        <Route path="track" element={<Track />} />
        <Route path="magic-poster-orders" element={<Navigate to="/dashboard/upgrade?history=poster" replace />} />
        <Route path="account-settings" element={<Settings />} />
        <Route path="contacts" element={<Contacts />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
