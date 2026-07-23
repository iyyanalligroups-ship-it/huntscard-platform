import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

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

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
        <div className={`tap-card mini ${profile?.cardType || 'unassigned'}`}>
          <span className="tap-card-tier">{planLabel}</span>
          <span className="tap-card-name">{profile?.fullName}</span>
        </div>
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
              <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
              <circle
                cx="100" cy="100" r={R} fill="none"
                stroke="url(#donutGrad)" strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`}
                transform="rotate(-90 100 100)"
              />
              <defs>
                <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f8ef7" />
                  <stop offset="50%" stopColor="#22c58b" />
                  <stop offset="100%" stopColor="#f5a524" />
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
    </div>
  );
}
