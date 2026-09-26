import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { ArrowRight, BadgeCheck, Box, ScanLine, Sparkles } from 'lucide-react';
import { api, API_URL } from '../api.js';
import ArView from './ArView.jsx';
import './PublicProfile.css';

// Opt-in alternative tracking engine (mind-ar, whole-card tracking instead of QR-corner POSIT)
const ArViewMindAR = lazy(() => import('./ArViewMindAR.jsx'));

class ArEngineErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          <p style={{ maxWidth: 320 }}>Something went wrong loading AR.</p>
          <a href={`/c/${this.props.clientId}`} style={{ color: 'var(--holo-cyan, #5eead4)' }}>
            View the normal profile instead
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global Accent Themes matching the dashboard topbar
const ACCENT_THEMES = [
  { id: 'teal', label: 'HuntsTAG Teal', color: '#0d9394' },
  { id: 'violet', label: 'Royal Violet', color: '#7367f0' },
  { id: 'amber', label: 'Warm Amber', color: '#e58a16' },
];

// Crisp inline vector SVGs for pixel-perfect holographic theme
const Icons = {
  Palette: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  ),
  Building: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="9" y1="22" x2="9" y2="22.01" />
      <line x1="15" y1="22" x2="15" y2="22.01" />
      <line x1="9" y1="6" x2="9.01" y2="6" />
      <line x1="15" y1="6" x2="15.01" y2="6" />
      <line x1="9" y1="10" x2="9.01" y2="10" />
      <line x1="15" y1="10" x2="15.01" y2="10" />
      <line x1="9" y1="14" x2="9.01" y2="14" />
      <line x1="15" y1="14" x2="15.01" y2="14" />
      <line x1="9" y1="18" x2="9.01" y2="18" />
      <line x1="15" y1="18" x2="15.01" y2="18" />
    </svg>
  ),
  VerifiedBadge: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" stroke="#000" strokeWidth="1.2" />
    </svg>
  ),
  QrCode: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3z" fill="currentColor" />
      <path d="M20 14v3" />
      <path d="M14 20h3" />
      <path d="M20 20v.01" />
    </svg>
  ),
  CubeAR: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  CodeBracket: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  Exchange: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5" />
      <path d="M4 20L21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  ),
  DownloadVcard: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Share: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  Globe: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  WhatsApp: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Instagram: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  Twitter: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  Phone: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  Mail: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  MapPin: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  ArrowUpRight: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Quote: () => (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-8.983z" />
    </svg>
  )
};

function RaiseTicketForm({ clientId, cardNumber }) {
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [issue, setIssue] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !contactNumber.trim() || !issue.trim()) {
      setError('Name, contact number, and the reason/issue are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.submitCardTicket(clientId, { name, contactNumber, issue, email }, cardNumber);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not submit your ticket');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="ht-profile-viewport">
        <p className="pv-state-msg">
          Ticket submitted — our support team will review your issue and contact you within 24–48 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="ht-profile-viewport">
      <div className="ht-card-frame" style={{ padding: '48px 22px' }}>
        <h1 style={{ fontSize: 18, textAlign: 'center', marginBottom: 6 }}>This card has been temporarily deactivated</h1>
        <p className="subtitle" style={{ textAlign: 'center', marginBottom: 24, fontSize: 13, color: '#94a3b8' }}>
          Raise a ticket below and our support team will get back to you.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="ticketName">Name</label>
            <input id="ticketName" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ticketContactNumber">Contact number</label>
            <input
              id="ticketContactNumber"
              type="tel"
              autoComplete="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ticketIssue">Reason / Issue</label>
            <textarea id="ticketIssue" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ticketEmail">Email (optional)</label>
            <input id="ticketEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PublicProfile() {
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  // GET /api/public/profile/:clientId also increments the server's tap
  // counter (see routes/public.js) -- a real side effect, not a pure read.
  // React 18 StrictMode deliberately double-invokes effects in dev (mount
  // -> cleanup -> remount) to surface exactly this kind of non-idempotent
  // effect, which without this guard would count one real page open as
  // two taps while testing locally. Production builds don't double-invoke,
  // so this only changes dev-server behavior -- but it makes the counter
  // trustworthy to test against locally too.
  const fetchedProfileKeyRef = useRef(null);

  // Dynamic Global Theme Color state
  const [accentTheme, setAccentTheme] = useState(() => {
    if (typeof window === 'undefined') return 'teal';
    return (
      document.documentElement.dataset.huntstagAccent ||
      window.localStorage.getItem('huntstag-dashboard-accent') ||
      'teal'
    );
  });
  const [themeOpen, setThemeOpen] = useState(false);
  const themeControlRef = useRef(null);

  // GSAP animation refs
  const cardRef = useRef(null);
  const avatarRef = useRef(null);
  const nameRef = useRef(null);
  const actionsRef = useRef(null);
  const panelRef = useRef(null);

  const toastTimeoutRef = useRef(null);
  const isArMode = searchParams.get('ar') === '1';
  const useMindAR = isArMode && searchParams.get('engine') === 'mindar';
  const cardNumber = searchParams.get('card') || undefined;
  const [arChoice, setArChoice] = useState(null);

  // Exchange contact state
  const [showExchange, setShowExchange] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadOrg, setLeadOrg] = useState('');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState('');

  // Synchronize global theme accent
  useEffect(() => {
    document.documentElement.dataset.huntstagAccent = accentTheme;
    window.localStorage.setItem('huntstag-dashboard-accent', accentTheme);
  }, [accentTheme]);

  // Click outside to close theme popover
  useEffect(() => {
    function handleClickOutside(e) {
      if (themeControlRef.current && !themeControlRef.current.contains(e.target)) {
        setThemeOpen(false);
      }
    }
    if (themeOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  useEffect(() => {
    if (isArMode) return;
    const key = `${clientId}:${cardNumber || ''}`;
    if (fetchedProfileKeyRef.current === key) return;
    fetchedProfileKeyRef.current = key;
    setBannerFailed(false);
    api
      .getPublicProfile(clientId, cardNumber)
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    api
      .getAttributeDefinitions()
      .then(setAttributes)
      .catch(() => {});
  }, [clientId, isArMode, cardNumber]);

  // GSAP entrance animation when profile loads
  useEffect(() => {
    if (!profile || isArMode) return;

    const ctx = gsap.context(() => {
      // Floating ambient vectors
      gsap.to('.ht-ambient-vector-1', {
        y: 22,
        x: 12,
        rotate: 15,
        duration: 6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
      gsap.to('.ht-ambient-vector-2', {
        y: -25,
        x: -16,
        rotate: -12,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });

      // Card frame entrance
      if (cardRef.current) {
        gsap.fromTo(
          cardRef.current,
          { opacity: 0, y: 35, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 0.75, ease: 'power3.out' }
        );
      }

      // Avatar bounce entrance
      if (avatarRef.current) {
        gsap.fromTo(
          avatarRef.current,
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.65, delay: 0.2, ease: 'back.out(1.8)' }
        );
      }

      // Name & title stagger
      if (nameRef.current) {
        gsap.fromTo(
          nameRef.current,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.5, delay: 0.35, ease: 'power2.out' }
        );
      }

      // Social circular buttons stagger
      gsap.fromTo(
        '.ht-social-circle-btn',
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.45, stagger: 0.05, delay: 0.45, ease: 'back.out(2)' }
      );

      // Primary buttons glide in
      if (actionsRef.current) {
        gsap.fromTo(
          actionsRef.current,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.5, delay: 0.55, ease: 'power2.out' }
        );
      }

      // Panel content reveal
      if (panelRef.current) {
        gsap.fromTo(
          panelRef.current,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.45, delay: 0.65, ease: 'power2.out' }
        );
      }
    });

    return () => ctx.revert();
  }, [profile, isArMode]);

  // Animate panel when tab changes
  useEffect(() => {
    if (!panelRef.current) return;
    gsap.fromTo(
      panelRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' }
    );
  }, [activeTab]);

  useEffect(() => {
    if (!isArMode || arChoice) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.ht-experience-panel',
        { opacity: 0, y: 28, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
      );
      gsap.fromTo(
        '.ht-experience-option',
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, delay: 0.22, ease: 'power2.out' }
      );
    });
    return () => ctx.revert();
  }, [isArMode, arChoice]);

  function chooseArExperience(choice, event) {
    const button = event.currentTarget;
    gsap.timeline({ onComplete: () => setArChoice(choice) })
      .to(button, { scale: 0.96, duration: 0.1, ease: 'power2.in' })
      .to(button, { scale: 1, duration: 0.18, ease: 'back.out(2)' });
  }

  function handleArLauncherClick(event) {
    event.preventDefault();
    const link = event.currentTarget;
    const destination = link.href;
    gsap.timeline({ onComplete: () => window.location.assign(destination) })
      .to(link, { scale: 0.94, duration: 0.1, ease: 'power2.in' })
      .to(link, { scale: 1, duration: 0.18, ease: 'back.out(2)' });
  }

  if (isArMode && !arChoice) {
    return (
      <div className="ht-experience-screen" data-accent={accentTheme}>
        <div className="ht-experience-grid" aria-hidden="true" />
        <div className="ht-experience-orb ht-experience-orb-one" aria-hidden="true" />
        <div className="ht-experience-orb ht-experience-orb-two" aria-hidden="true" />

        <main className="ht-experience-panel">
          <div className="ht-experience-brand"><BadgeCheck size={17} />HuntsTAG</div>
          <div className="ht-experience-symbol" aria-hidden="true"><ScanLine size={30} /></div>
          <p className="ht-experience-kicker">Smart card experience</p>
          <h1>Choose how your card <span>comes alive.</span></h1>
          <p className="ht-experience-copy">
            Open the spatial 3D profile or launch the interactive Magic Camera experience.
          </p>

          <div className="ht-experience-options">
            <button type="button" className="ht-experience-option primary" onClick={(event) => chooseArExperience('ar', event)}>
              <span className="ht-experience-option-icon"><Box size={23} /></span>
              <span className="ht-experience-option-copy">
                <strong>3D AR</strong>
                <small>Place the interactive profile in your space</small>
              </span>
              <ArrowRight className="ht-experience-arrow" size={19} />
            </button>
            <button type="button" className="ht-experience-option" onClick={(event) => chooseArExperience('magic', event)}>
              <span className="ht-experience-option-icon"><Sparkles size={23} /></span>
              <span className="ht-experience-option-copy">
                <strong>Magic Camera</strong>
                <small>Scan the card to reveal its live effects</small>
              </span>
              <ArrowRight className="ht-experience-arrow" size={19} />
            </button>
            {/* Separate camera page (MagicCamera3D.jsx) -- shows ONLY a 3D
                model when this card has one set, kept apart from the plain
                Magic Camera above so that flow's video is never affected.
                Hidden for now -- feature isn't ready yet, will come back
                once it's finished. Route/page itself is untouched. */}
          </div>

          <div className="ht-experience-footnote">
            <span className="ht-live-pulse" />Powered by HuntsTAG immersive technology
          </div>
        </main>
      </div>
    );
  }

  if (arChoice === 'magic') {
    return <Navigate to={`/magic-camera/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`} replace />;
  }

  if (arChoice === '3d') {
    return <Navigate to={`/magic-camera-3d/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`} replace />;
  }

  if (useMindAR) {
    return (
      <ArEngineErrorBoundary clientId={clientId}>
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}>
          <ArViewMindAR clientId={clientId} cardNumber={cardNumber} />
        </Suspense>
      </ArEngineErrorBoundary>
    );
  }

  if (isArMode) {
    return <ArView clientId={clientId} cardNumber={cardNumber} />;
  }

  function showToast(msg, duration = 2200) {
    setToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(''), duration);
  }

  async function copyToClipboard(text, key, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showToast(`${label} copied to clipboard`);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      showToast('Could not copy to clipboard');
    }
  }

  async function saveContact() {
    try {
      const res = await fetch(`${API_URL}/api/public/vcard/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`);
      if (!res.ok) throw new Error('vcard fetch failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
      const filename = filenameMatch ? filenameMatch[1] : `${profile.fullName || 'contact'}.vcf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Contact card downloaded! Open to save to your phone', 3400);
    } catch {
      showToast('Could not save contact');
    }
  }

  function handleExchangeClick() {
    saveContact();
    setLeadError('');
    setShowExchange(true);
  }

  async function handleLeadSubmit(e) {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      setLeadError('Name and phone number are required');
      return;
    }
    setLeadSubmitting(true);
    setLeadError('');
    try {
      await api.submitLead(clientId, { name: leadName, phone: leadPhone, email: leadEmail, org: leadOrg }, cardNumber);
      setShowExchange(false);
      setLeadName('');
      setLeadPhone('');
      setLeadEmail('');
      setLeadOrg('');
      showToast(`Thanks! ${profile.fullName || 'They'}'ll be in touch.`, 2600);
    } catch (err) {
      setLeadError(err.message || 'Could not share your contact');
    } finally {
      setLeadSubmitting(false);
    }
  }

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${profile.fullName} — HuntsTAG`, url });
      } catch {
        /* cancelled */
      }
    } else {
      await copyToClipboard(url, 'share', 'Profile Link');
    }
  }

  if (loading) {
    return (
      <div className="ht-profile-viewport" data-accent={accentTheme}>
        <div style={{ textAlign: 'center', marginTop: 100 }}>
          <div className="ht-live-pulse" style={{ width: 14, height: 14, margin: '0 auto 16px' }} />
          <p style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500 }}>Connecting to HuntsTAG NFC card…</p>
        </div>
      </div>
    );
  }

  if (profile?.paused) {
    if (profile.reason === 'deleted') {
      return (
        <div className="ht-profile-viewport" data-accent={accentTheme}>
          <p className="pv-state-msg">This card has been permanently deleted and can no longer be used.</p>
        </div>
      );
    }
    if (profile.reason === 'deactivated') {
      return <RaiseTicketForm clientId={clientId} cardNumber={cardNumber} />;
    }
    return (
      <div className="ht-profile-viewport" data-accent={accentTheme}>
        <p className="pv-state-msg">This card has been deactivated by its owner.</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="ht-profile-viewport" data-accent={accentTheme}>
        <p className="pv-state-msg">Card not found. Check the link and try again.</p>
      </div>
    );
  }

  const initials = (profile.fullName || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  // Extract address or map from customAttributes if present
  const locationAttr = profile.customAttributes?.address || profile.customAttributes?.map || null;

  // Custom attributes helper
  function customRowsFor(section) {
    return attributes
      .filter((a) => a.section === section)
      .map((a) => {
        const value = profile.customAttributes?.[a.key];
        if (!value) return null;
        const href =
          a.fieldType === 'phone' ? `tel:${value}` : a.fieldType === 'email' ? `mailto:${value}` : a.fieldType === 'url' ? value : undefined;
        return { key: a.key, label: a.label, value, href };
      })
      .filter(Boolean);
  }

  // Define tabs: About, Contact, Portfolio, HuntsTAG
  const tabs = [];
  tabs.push({ label: 'About', key: 'bio' });
  tabs.push({ label: 'Contact', key: 'contact' });
  if (profile.portfolioUrl) tabs.push({ label: 'Portfolio', key: 'portfolio' });
  if (profile.huntsworldUrl) tabs.push({ label: 'HuntsTAG', key: 'huntsworld' });

  // Custom admin sections
  const BUILTIN_SECTION_KEYS = new Set(['contact', 'portfolio', 'social', 'huntsworld']);
  const customSectionRows = {};
  for (const section of new Set(attributes.map((a) => a.section))) {
    if (BUILTIN_SECTION_KEYS.has(section)) continue;
    const rows = customRowsFor(section);
    if (!rows.length) continue;
    customSectionRows[section] = rows;
    const label = attributes.find((a) => a.section === section)?.sectionLabel || section;
    tabs.push({ label, key: section });
  }

  const clampedTab = Math.min(activeTab, tabs.length - 1);
  const currentKey = tabs[clampedTab]?.key;

  // Client-edited tags (Profile Settings -> About tab) win when set. Falls
  // back to the old auto-picked-by-role guess only for profiles that
  // predate this field, so they don't suddenly show no tags at all.
  const isDeveloper = /developer|engineer|coder|tech|fullstack|frontend|backend/i.test(`${profile.jobTitle || ''} ${profile.bio || ''}`);
  const specialtyTags = profile.highlights?.length
    ? profile.highlights
    : isDeveloper
    ? ['JavaScript', 'React', 'Node.js', 'TypeScript', 'APIs & Cloud', 'Clean Architecture']
    : ['NFC Smart Card', 'HuntsTAG Hologram', 'Instant Tap', 'Digital Bio', 'Verified Contact'];

  return (
    <div className="ht-profile-viewport" data-accent={accentTheme}>
      {/* Decorative Ambient Background Vectors */}
      <div className="ht-ambient-grid" />
      <div className="ht-ambient-vector ht-ambient-vector-1">
        <svg viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="80" stroke="url(#ht-grad-1)" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="100" cy="100" r="50" stroke="url(#ht-grad-1)" strokeWidth="1" />
          <defs>
            <linearGradient id="ht-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--ht-accent)" />
              <stop offset="100%" stopColor="var(--ht-accent-2)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="ht-ambient-vector ht-ambient-vector-2">
        <svg viewBox="0 0 240 240" fill="none">
          <rect x="20" y="20" width="200" height="200" rx="30" stroke="url(#ht-grad-2)" strokeWidth="1.5" strokeDasharray="8 8" />
          <rect x="50" y="50" width="140" height="140" rx="20" stroke="url(#ht-grad-2)" strokeWidth="1" />
          <defs>
            <linearGradient id="ht-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--ht-accent-2)" />
              <stop offset="100%" stopColor="var(--ht-holo-magenta)" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Main Smartphone Showcase Device Container */}
      <div className="ht-card-frame" ref={cardRef}>
        <div className="ht-card-inner">
          {/* Top Quick Utility Controls (Outside banner-wrap to prevent overflow clipping!) */}
          <div className="ht-top-controls">
            <div className="ht-status-chip">
              <span className="ht-live-pulse" />
              HuntsTAG
            </div>

            <div className="ht-action-chips">
              {profile.arEnabled && (
                <a
                  href={`/c/${clientId}?ar=1`}
                  className="ht-ar-launcher-btn"
                  title="Launch HuntsTAG 3D AR experience"
                  onClick={handleArLauncherClick}
                >
                  <Box size={15} />
                  <span>Explore 3D AR</span>
                  <ArrowRight className="ht-ar-launcher-arrow" size={14} />
                </a>
              )}

              {/* Dynamic Theme Color Switcher - never clipped */}
              <div className="ht-theme-control" ref={themeControlRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="ht-icon-pill-btn"
                  onClick={() => setThemeOpen((open) => !open)}
                  title="Change Theme Accent"
                  aria-label="Theme color"
                  aria-expanded={themeOpen}
                >
                  <Icons.Palette />
                  <span
                    className="ht-current-swatch-dot"
                    style={{ background: ACCENT_THEMES.find((t) => t.id === accentTheme)?.color || '#0d9394' }}
                  />
                </button>

                {themeOpen && (
                  <div className="ht-theme-dropdown">
                    <strong>Theme color</strong>
                    <span>Choose your dynamic card accent.</span>
                    {ACCENT_THEMES.map((theme) => (
                      <button
                        type="button"
                        key={theme.id}
                        className={`ht-theme-option-btn${accentTheme === theme.id ? ' selected' : ''}`}
                        onClick={() => {
                          setAccentTheme(theme.id);
                          setThemeOpen(false);
                          showToast(`Applied ${theme.label} theme`);
                        }}
                      >
                        <i className="ht-theme-swatch-dot" style={{ background: theme.color }} />
                        <span>{theme.label}</span>
                        {accentTheme === theme.id && <span className="ht-theme-check">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* QR Code Modal Button */}
              <button
                className="ht-icon-pill-btn"
                onClick={() => setShowQrModal(true)}
                title="Show Card QR Code"
                aria-label="QR Code"
              >
                <Icons.QrCode />
              </button>
            </div>
          </div>

          {/* Banner Section with Gradient Vignette & Overlay */}
          <div className="ht-banner-wrap">
            {profile.bannerUrl && !bannerFailed ? (
              <img
                src={profile.bannerUrl}
                alt=""
                className="ht-banner-img"
                onError={() => setBannerFailed(true)}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(135deg, #09121d 0%, #1e1b4b 60%, #120e24 100%)',
                }}
              />
            )}
            <div className="ht-banner-mesh" />
            <div className="ht-banner-overlay" />
          </div>

          {/* Profile Avatar & Identity Section */}
          <div className="ht-identity-section">
            <div className="ht-avatar-stage" ref={avatarRef}>
              <div className="ht-avatar-ring" />
              <div className="ht-avatar-core">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt={profile.fullName} className="ht-avatar-img" />
                ) : (
                  <span className="ht-avatar-initials">{initials}</span>
                )}
              </div>
              <div className="ht-verified-badge" title="Verified HuntsTAG Card">
                <Icons.VerifiedBadge />
              </div>
            </div>

            <div className="ht-name-wrap" ref={nameRef}>
              <h1 className="ht-full-name">{profile.fullName}</h1>
              <div className="ht-badges-row">
                {profile.jobTitle && (
                  <span className="ht-role-badge-pill">
                    <Icons.CodeBracket />
                    {profile.jobTitle}
                  </span>
                )}
                <span className="ht-company-badge">
                  <Icons.Building />
                  HuntsTAG
                </span>
              </div>
              {profile.bio && (
                <p className="ht-quick-bio-snippet">{profile.bio}</p>
              )}
            </div>
          </div>

          {/* Floating Quick Social Row (Directly visible!) */}
          <div className="ht-social-strip">
            {profile.portfolioUrl && (
              <a
                href={profile.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ht-social-circle-btn website"
                title="Website Portfolio"
              >
                <Icons.Globe />
              </a>
            )}
            {profile.whatsapp && (
              <a
                href={`https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ht-social-circle-btn whatsapp"
                title="Chat on WhatsApp"
              >
                <Icons.WhatsApp />
              </a>
            )}
            {profile.instagramUrl && (
              <a
                href={profile.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ht-social-circle-btn instagram"
                title="Instagram"
              >
                <Icons.Instagram />
              </a>
            )}
            {profile.twitterUrl && (
              <a
                href={profile.twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ht-social-circle-btn twitter"
                title="X (Twitter)"
              >
                <Icons.Twitter />
              </a>
            )}
            {profile.publicEmail && (
              <a
                href={`mailto:${profile.publicEmail}`}
                className="ht-social-circle-btn email"
                title="Send Email"
              >
                <Icons.Mail />
              </a>
            )}
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="ht-social-circle-btn"
                title="Call Mobile"
              >
                <Icons.Phone />
              </a>
            )}
          </div>

          {/* Primary Action Buttons Bar */}
          <div className="ht-primary-actions" ref={actionsRef}>
            <button className="ht-btn-exchange" onClick={handleExchangeClick}>
              <Icons.Exchange />
              <span>Exchange Contact</span>
            </button>
            <button className="ht-btn-save-vcard" onClick={saveContact} title="Save to Phone Contacts">
              <Icons.DownloadVcard />
              <span>Save</span>
            </button>
            <button className="ht-btn-share-icon" onClick={handleShare} title="Share Profile">
              <Icons.Share />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="ht-tab-nav">
            {tabs.map((t, i) => (
              <button
                key={t.key}
                className={`ht-tab-btn${i === clampedTab ? ' active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content Stage */}
          <div className="ht-tab-content-stage" ref={panelRef}>
            {/* TAB: Bio & About */}
            {currentKey === 'bio' && (
              <div>
                <div className="ht-bio-card">
                  <div className="ht-bio-quote-icon">
                    <Icons.Quote />
                  </div>
                  <div className="ht-bio-headline">
                    <Icons.CodeBracket /> About & Vision
                  </div>
                  <p className="ht-bio-text">{profile.bio || 'Welcome to my digital profile!'}</p>

                  {/* Tech & Skills Vector Badges */}
                  <div className="ht-tags-group">
                    <div className="ht-tags-title">Expertise & Highlights</div>
                    <div className="ht-tags-cloud">
                      {specialtyTags.map((tag, idx) => (
                        <span key={tag} className={`ht-vector-tag ${idx % 2 === 0 ? 'accent' : 'secondary'}`}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Hardware / NFC Chip Specs */}
                <div className="ht-specs-card">
                  <div className="ht-spec-item">
                    <span className="ht-spec-label">Business</span>
                    <span className="ht-spec-val" style={{ color: 'var(--ht-accent)' }}>HuntsTAG</span>
                  </div>
                  <div className="ht-spec-item">
                    <span className="ht-spec-label">Card ID</span>
                    <span className="ht-spec-val">{profile.clientId}</span>
                  </div>
                  <div className="ht-spec-item">
                    <span className="ht-spec-label">AR Hologram</span>
                    <span className="ht-spec-val" style={{ color: profile.arEnabled ? 'var(--ht-accent)' : '#94a3b8' }}>
                      {profile.arEnabled ? 'Active' : 'Standard'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Contact Information Grid (2x2 / Card Style) */}
            {currentKey === 'contact' && (
              <div className="ht-contact-grid">
                {profile.phone && (
                  <div className="ht-contact-card-tile">
                    <div className="ht-tile-badge phone">
                      <Icons.Phone />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">Mobile Phone</div>
                      <div className="ht-tile-val">{profile.phone}</div>
                    </div>
                    <button
                      className="ht-copy-btn"
                      onClick={() => copyToClipboard(profile.phone, 'phone', 'Phone number')}
                      title="Copy phone"
                    >
                      {copiedKey === 'phone' ? <Icons.Check /> : <Icons.Copy />}
                    </button>
                    <a href={`tel:${profile.phone}`} className="ht-tile-action-icon" title="Call">
                      <Icons.ArrowUpRight />
                    </a>
                  </div>
                )}

                {profile.publicEmail && (
                  <div className="ht-contact-card-tile">
                    <div className="ht-tile-badge email">
                      <Icons.Mail />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">Email Address</div>
                      <div className="ht-tile-val">{profile.publicEmail}</div>
                    </div>
                    <button
                      className="ht-copy-btn"
                      onClick={() => copyToClipboard(profile.publicEmail, 'email', 'Email')}
                      title="Copy email"
                    >
                      {copiedKey === 'email' ? <Icons.Check /> : <Icons.Copy />}
                    </button>
                    <a href={`mailto:${profile.publicEmail}`} className="ht-tile-action-icon" title="Send email">
                      <Icons.ArrowUpRight />
                    </a>
                  </div>
                )}

                {profile.whatsapp && (
                  <div className="ht-contact-card-tile">
                    <div className="ht-tile-badge whatsapp">
                      <Icons.WhatsApp />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">WhatsApp</div>
                      <div className="ht-tile-val">+{profile.whatsapp.replace(/\D/g, '')}</div>
                    </div>
                    <a
                      href={`https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ht-tile-action-icon"
                      title="Chat on WhatsApp"
                    >
                      <Icons.ArrowUpRight />
                    </a>
                  </div>
                )}

                {locationAttr && (
                  <div className="ht-contact-card-tile">
                    <div className="ht-tile-badge location">
                      <Icons.MapPin />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">Location & Map</div>
                      <div className="ht-tile-val">Google Maps Location</div>
                    </div>
                    <a
                      href={locationAttr}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ht-tile-action-icon"
                      title="Open in Maps"
                    >
                      <Icons.ArrowUpRight />
                    </a>
                  </div>
                )}

                {/* Extra Custom Attributes */}
                {customRowsFor('contact').map((row) => (
                  <div key={row.key} className="ht-contact-card-tile">
                    <div className="ht-tile-badge custom">
                      <Icons.Globe />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">{row.label}</div>
                      <div className="ht-tile-val">{row.value}</div>
                    </div>
                    {row.href && (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="ht-tile-action-icon">
                        <Icons.ArrowUpRight />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TAB: Portfolio */}
            {currentKey === 'portfolio' && (
              <div className="ht-portfolio-showcase">
                {profile.portfolioUrl ? (
                  <div className="ht-portfolio-hero-card">
                    <div className="ht-portfolio-title">Official Portfolio & Projects</div>
                    <div className="ht-portfolio-url-text">{profile.portfolioUrl}</div>
                    <a
                      href={profile.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ht-portfolio-visit-btn"
                    >
                      <span>Visit Live Website</span>
                      <Icons.ArrowUpRight />
                    </a>
                  </div>
                ) : (
                  <div className="ht-portfolio-hero-card">
                    <div className="ht-portfolio-title">HuntsTAG Smart Profile</div>
                    <div className="ht-portfolio-url-text">{window.location.href}</div>
                    <button onClick={handleShare} className="ht-portfolio-visit-btn">
                      <span>Share This Profile</span>
                      <Icons.Share />
                    </button>
                  </div>
                )}

                {customRowsFor('portfolio').map((row) => (
                  <div key={row.key} className="ht-contact-card-tile">
                    <div className="ht-tile-badge custom">
                      <Icons.Globe />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">{row.label}</div>
                      <div className="ht-tile-val">{row.value}</div>
                    </div>
                    {row.href && (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="ht-tile-action-icon">
                        <Icons.ArrowUpRight />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TAB: HuntsTAG Business Profile */}
            {currentKey === 'huntsworld' && (
              <div>
                {profile.huntsworldUrl && (
                  <div className="ht-huntsworld-card">
                    <div className="ht-hw-header">
                      <div className="ht-hw-emblem">H</div>
                      <div>
                        <div className="ht-hw-name">HuntsTAG Business Profile</div>
                        <div className="ht-hw-desc">Official Verified Enterprise Profile</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 18 }}>
                      Connect with HuntsTAG verified products, professional business services, and smart NFC tap networking solutions.
                    </p>
                    <a
                      href={profile.huntsworldUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ht-hw-cta-btn"
                    >
                      View on HuntsTAG &rarr;
                    </a>
                  </div>
                )}

                {customRowsFor('huntsworld').map((row) => (
                  <div key={row.key} className="ht-contact-card-tile" style={{ marginTop: 12 }}>
                    <div className="ht-tile-badge custom">
                      <Icons.Globe />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">{row.label}</div>
                      <div className="ht-tile-val">{row.value}</div>
                    </div>
                    {row.href && (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="ht-tile-action-icon">
                        <Icons.ArrowUpRight />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Custom Dynamic Sections */}
            {currentKey && customSectionRows[currentKey] && (
              <div className="ht-contact-grid">
                {customSectionRows[currentKey].map((row) => (
                  <div key={row.key} className="ht-contact-card-tile">
                    <div className="ht-tile-badge custom">
                      <Icons.Globe />
                    </div>
                    <div className="ht-tile-info">
                      <div className="ht-tile-type">{row.label}</div>
                      <div className="ht-tile-val">{row.value}</div>
                    </div>
                    {row.href && (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="ht-tile-action-icon">
                        <Icons.ArrowUpRight />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Branded Seal */}
          <div className="ht-footer-seal">
            <div className="ht-footer-brand-row">
              <span className="ht-hunts-mark" />
              <span>HuntsTAG Smart NFC Card</span>
            </div>
            <span className="ht-footer-subtitle">Tap to connect &bull; Built with holographic foil technology</span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <div className={`ht-toast${toast ? ' show' : ''}`}>
        <Icons.Check />
        <span>{toast}</span>
      </div>

      {/* QR Code Modal Popup */}
      {showQrModal && (
        <div className="ht-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowQrModal(false)}>
          <div className="ht-modal-card">
            <button className="ht-modal-close" onClick={() => setShowQrModal(false)} aria-label="Close">
              &times;
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Scan Card QR</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
              Scan with any camera or phone to open this profile
            </p>

            <div className="ht-qr-preview-box">
              <img
                src={`${API_URL}/api/public/qr/${clientId}`}
                alt="QR Code"
                className="ht-qr-img"
              />
            </div>

            <div className="ht-qr-actions-row">
              <button
                className="ht-btn-exchange"
                onClick={() => {
                  copyToClipboard(window.location.href, 'qr-link', 'Card URL');
                  setShowQrModal(false);
                }}
              >
                <Icons.Copy /> Copy Link
              </button>
              <a
                href={`${API_URL}/api/public/qr/${clientId}`}
                download={`huntstag-${clientId}-qr.png`}
                className="ht-btn-save-vcard"
              >
                <Icons.DownloadVcard /> Download QR
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Exchange Contact Modal */}
      {showExchange && (
        <div className="ht-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowExchange(false)}>
          <div className="ht-modal-card" style={{ textAlign: 'left', maxWidth: 400 }}>
            <button className="ht-modal-close" onClick={() => setShowExchange(false)} aria-label="Close">
              &times;
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Leave Your Contact</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>
              {profile.fullName || 'They'}'ll receive your contact info directly.
            </p>
            {leadError && <div className="error-banner" style={{ marginBottom: 16 }}>{leadError}</div>}
            <form onSubmit={handleLeadSubmit}>
              <div className="field">
                <label htmlFor="leadName">Your Name</label>
                <input
                  id="leadName"
                  type="text"
                  placeholder="e.g. Sarah Connor"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="leadPhone">Phone Number</label>
                <input
                  id="leadPhone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={15}
                  placeholder="e.g. +1 555-0199"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="leadEmail">Email Address (Optional)</label>
                <input
                  id="leadEmail"
                  type="email"
                  placeholder="e.g. sarah@company.com"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="leadOrg">Company / Organization (Optional)</label>
                <input
                  id="leadOrg"
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={leadOrg}
                  onChange={(e) => setLeadOrg(e.target.value)}
                />
              </div>
              <button type="submit" className="ht-btn-exchange" style={{ width: '100%', marginTop: 8 }} disabled={leadSubmitting}>
                {leadSubmitting ? 'Sharing…' : 'Share My Contact'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
