import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_URL } from '../api.js';
import DeviceProtectionCard from '../components/DeviceProtectionCard.jsx';
import NotificationBell from '../components/NotificationBell.jsx';

/* Profile fields that count toward completeness -- grouped the same way
   Profile Settings groups them, so the donut legend maps 1:1 to real
   sections the client can go fill in. */
const FIELD_GROUPS = [
  { label: 'Basics', color: '#4f8ef7', fields: ['fullName', 'jobTitle', 'bio', 'photoUrl'] },
  { label: 'Contact', color: '#22c58b', fields: ['phone', 'whatsapp', 'publicEmail'] },
  { label: 'Links & social', color: '#f5a524', fields: ['instagramUrl', 'twitterUrl', 'portfolioUrl', 'huntsworldUrl'] },
];

const ORDER_STAGES = ['Order placed', 'Card created', 'Shipping', 'Delivered'];

function orderStage(p) {
  if (!p?.paid) return -1; // no order yet
  if (p.delivered) return 3;
  if (p.dispatched) return 2;
  if (p.chipEncoded) return 1;
  return 0;
}

export default function DashboardHome() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimeoutRef = useRef(null);
  const [zingState, setZingState] = useState('idle'); // idle | busy | success | fail
  const zingTimeoutRef = useRef(null);
  const zingFileRef = useRef(null); // pre-fetched vCard File, ready before the button is ever clicked

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Pre-fetch the vCard as soon as we know who this client is, instead of
  // fetching it inside handleZing -- navigator.share() must be called
  // synchronously off the click for browsers to still consider it a
  // trusted user gesture; an `await fetch(...)` in front of it is enough
  // for some browsers to drop that and throw (this was the actual "Zing
  // button turns red" bug, not a share-sheet/permissions problem).
  useEffect(() => {
    if (!profile?.clientId) return;
    let cancelled = false;
    fetch(`${API_URL}/api/public/vcard/${profile.clientId}`)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        const file = new File([blob], `${profile.fullName || 'contact'}.vcf`, { type: 'text/vcard' });
        zingFileRef.current = navigator.canShare?.({ files: [file] }) ? file : null;
      })
      .catch(() => {
        /* Zing still works via the url/clipboard fallback below without a file */
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.clientId, profile?.fullName]);

  function showToast(msg, duration = 2600) {
    setToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(''), duration);
  }

  // Zing: share this client's own contact card without needing their
  // physical NFC card present. A website can't make the phone act as an
  // NFC tag for another phone to tap (that needs native Host Card
  // Emulation, Android-only), so this uses the OS share sheet instead --
  // the nearest no-card, one-tap equivalent that works on any phone.
  // Prefers sharing the actual vCard file so the recipient's share sheet
  // can offer "Add to Contacts" directly; falls back to sharing the
  // profile link, then to a copied link on desktop browsers.
  // Flashes the round Zing button green (success) or red (fail) for a
  // couple seconds so tapping it gives visible confirmation the contact
  // actually went out, then resets back to its normal state.
  function markZing(state) {
    setZingState(state);
    clearTimeout(zingTimeoutRef.current);
    zingTimeoutRef.current = setTimeout(() => setZingState('idle'), 2500);
  }

  async function handleZing() {
    if (!profile?.clientId || zingState === 'busy') return;
    setZingState('busy');
    const shareUrl = `${window.location.origin}/c/${profile.clientId}`;
    const shareTitle = `${profile.fullName} — HuntsTAG`;
    // Already fetched (see the useEffect above) -- nothing async runs
    // between the click and navigator.share() below.
    const file = zingFileRef.current;

    try {
      if (file) {
        await navigator.share({ files: [file], title: shareTitle });
      } else if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied — send it to share your contact');
      }
      markZing('success');
    } catch (err) {
      if (err?.name === 'AbortError') {
        setZingState('idle'); // user backed out of the share sheet -- not a failure
        return;
      }
      showToast('Could not share');
      markZing('fail');
    }
  }

  if (loading) return <p className="subtitle">Loading…</p>;
  if (error) return <div className="error-banner">{error}</div>;

  const firstName = (profile?.fullName || 'there').split(' ')[0];

  // --- completeness, computed from real fields only ---
  const groups = FIELD_GROUPS.map((g) => {
    const filled = g.fields.filter((f) => Boolean(profile?.[f] && String(profile[f]).trim())).length;
    return { ...g, filled, total: g.fields.length };
  });
  const totalFields = groups.reduce((s, g) => s + g.total, 0);
  const totalFilled = groups.reduce((s, g) => s + g.filled, 0);
  const pct = Math.round((totalFilled / totalFields) * 100);

  const stage = orderStage(profile);
  const planLabel = profile?.cardType
    ? profile.cardType.charAt(0).toUpperCase() + profile.cardType.slice(1)
    : 'No card yet';
  const statusLabel = stage === -1 ? 'No order yet' : ORDER_STAGES[stage];

  // Donut geometry
  const R = 84;
  const C = 2 * Math.PI * R;

  const kpis = [
    {
      label: 'Card taps',
      value: profile?.tapCount ?? 0,
      sub: 'Times your card was opened',
      tone: 'cyan',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
      ),
    },
    {
      label: 'Your plan',
      value: planLabel,
      sub: profile?.paid ? 'Paid' : 'Not purchased yet',
      tone: 'blue',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>
      ),
    },
    {
      label: 'Order status',
      value: statusLabel,
      sub: profile?.trackingId ? `Tracking ${profile.trackingId}` : 'Full details on Track',
      tone: 'orange',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8h13v9H1z"/><path d="M14 11h4l3 3v3h-7"/><circle cx="6" cy="19" r="1.8"/><circle cx="17.5" cy="19" r="1.8"/></svg>
      ),
    },
    {
      label: 'Profile complete',
      value: `${pct}%`,
      sub: `${totalFilled} of ${totalFields} fields filled`,
      tone: 'green',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/></svg>
      ),
    },
  ];

  return (
    <div className="dash-home">
      {/* A real, easy-to-hit footgun otherwise -- pause the card while
          traveling (see Settings.jsx's "Card status"), forget it's still
          off. Anyone tapping/scanning sees a "deactivated" message the
          whole time this banner is up. */}
      {profile?.cardActive === false && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          Your card is currently deactivated -- visitors see a "card deactivated" message
          instead of your profile.{' '}
          <Link to="/dashboard/account-settings" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Reactivate it
          </Link>
        </div>
      )}

      {/* Hero -- greeting + shortcut to the live card preview */}
      <section className="dash-hero">
        <div>
          <h1 className="dash-hero-title">Welcome back, {firstName} 👋</h1>
          <p className="dash-hero-sub">
            {stage >= 1
              ? 'Your HuntsTAG is live. Tap stats and order progress below.'
              : profile?.paid
                ? 'Your card is being prepared. Follow its progress below.'
                : 'Complete your profile, then grab a card from the Shop.'}
          </p>
          <Link to="/dashboard/profile" className="dash-hero-btn">View my card</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <NotificationBell />
          <div className={`tap-card mini ${profile?.cardType || 'unassigned'}`}>
            <span className="tap-card-tier">{planLabel}</span>
            <span className="tap-card-name">{profile?.fullName}</span>
          </div>
        </div>
      </section>

      {/* Zing -- share your contact without your physical card. Opens the
          phone's native share sheet (AirDrop / Nearby Share / WhatsApp /
          Bluetooth / etc.) with your vCard, so the other person can save
          you straight to their contacts without any NFC card or app. */}
      <section className="zing-section">
        <div>
          <h2 className="zing-title">⚡ Zing</h2>
          <p className="zing-sub">
            {profile?.zingEnabled
              ? 'No card on you? Zing your contact straight to their phone.'
              : `Zing isn't included in your current plan${profile?.cardType ? ` (${profile.cardType})` : ''}.`}
          </p>
        </div>
        {profile?.zingEnabled ? (
          <div className="zing-action">
            <button
              className={`zing-btn zing-${zingState}`}
              onClick={handleZing}
              disabled={zingState === 'busy'}
              aria-label="Zing my contact"
              title="Zing my contact"
            >
              {zingState === 'success' ? '✓' : zingState === 'fail' ? '!' : zingState === 'busy' ? '…' : '⚡'}
            </button>
            <span className="zing-caption">
              {zingState === 'success' ? 'Shared!' : zingState === 'fail' ? 'Try again' : zingState === 'busy' ? 'Sharing…' : 'Zing my contact'}
            </span>
          </div>
        ) : (
          <Link to="/dashboard/upgrade" className="dash-hero-btn">See plans with Zing</Link>
        )}
      </section>

      {/* KPI row -- every number here is real (taps, plan, order, completeness) */}
      <section className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <span className={`kpi-chip ${k.tone}`}>{k.icon}</span>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </section>

      <section className="dash-two-col">
        {/* Completeness donut -- legend maps to real Profile Settings sections */}
        <div className="dash-panel">
          <h2 className="dash-panel-title">Profile completeness</h2>
          <div className="donut-wrap">
            <svg viewBox="0 0 200 200" className="donut">
              <circle cx="100" cy="100" r={R} fill="none" style={{ stroke: 'var(--donut-track, rgba(255,255,255,0.07))' }} strokeWidth="16" />
              <circle
                cx="100" cy="100" r={R} fill="none"
                stroke="url(#donutGrad)" strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`}
                transform="rotate(-90 100 100)"
              />
              <defs>
                <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: 'var(--donut-c1, #4f8ef7)' }} />
                  <stop offset="50%" style={{ stopColor: 'var(--donut-c2, #22c58b)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--donut-c3, #f5a524)' }} />
                </linearGradient>
              </defs>
              <text x="100" y="94" textAnchor="middle" className="donut-pct">{pct}%</text>
              <text x="100" y="118" textAnchor="middle" className="donut-caption">complete</text>
            </svg>
            <div className="donut-legend">
              {groups.map((g) => (
                <div className="legend-row" key={g.label}>
                  <span className="legend-dot" style={{ background: g.color }} />
                  <span className="legend-label">{g.label}</span>
                  <span className="legend-value">{g.filled}/{g.total}</span>
                </div>
              ))}
              {pct < 100 && (
                <Link to="/dashboard/settings" className="legend-cta">Finish your profile →</Link>
              )}
            </div>
          </div>
        </div>

        {/* Order progress -- same fields the Track page reads */}
        <div className="dash-panel">
          <h2 className="dash-panel-title">Order progress</h2>
          {stage === -1 ? (
            <div className="dash-empty">
              <p>No card order yet.</p>
              <Link to="/dashboard/upgrade" className="dash-hero-btn">Browse the Shop</Link>
            </div>
          ) : (
            <>
              <ol className="mini-steps">
                {ORDER_STAGES.map((s, i) => (
                  <li key={s} className={i <= stage ? 'done' : ''}>
                    <span className="mini-step-dot">{i <= stage ? '✓' : i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <Link to="/dashboard/track" className="legend-cta">Full tracking details →</Link>
            </>
          )}
        </div>
      </section>

      <DeviceProtectionCard />

      <div className={`pv-toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}
