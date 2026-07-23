import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_URL } from '../api.js';

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="subtitle">Loading…</p>;
  if (error) return <div className="error-banner">{error}</div>;

  const initials = (profile?.fullName || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const contactRows = [
    profile?.phone && { icon: '☎', label: profile.phone, href: `tel:${profile.phone}` },
    profile?.publicEmail && { icon: '✉', label: profile.publicEmail, href: `mailto:${profile.publicEmail}` },
  ].filter(Boolean);

  const socialRows = [
    profile?.instagramUrl && { icon: 'IG', label: 'Instagram', href: profile.instagramUrl },
    profile?.twitterUrl && { icon: 'X', label: 'Twitter / X', href: profile.twitterUrl },
    profile?.whatsapp && {
      icon: 'WA',
      label: 'WhatsApp',
      href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`,
    },
  ].filter(Boolean);

  // Only show tabs for sections that actually have content -- matches the
  // real public tap page's behaviour exactly, since this IS a preview of it.
  const tabs = [];
  if (profile?.bio) tabs.push({ label: 'My Bio', key: 'bio' });
  if (contactRows.length) tabs.push({ label: 'Contact', key: 'contact' });
  if (profile?.portfolioUrl) tabs.push({ label: 'Portfolio', key: 'portfolio' });
  if (socialRows.length) tabs.push({ label: 'Social', key: 'social' });
  // Huntsworld is a business listing platform -- featured in its own tab,
  // mirroring backend/public-tap/index.html exactly.
  if (profile?.huntsworldUrl) tabs.push({ label: 'Huntsworld', key: 'huntsworld' });
  if (tabs.length === 0) tabs.push({ label: 'Info', key: 'empty' });

  const clampedTab = Math.min(activeTab, tabs.length - 1);
  const currentKey = tabs[clampedTab]?.key;

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      setActiveTab((t) => Math.max(0, Math.min(tabs.length - 1, t + (dx < 0 ? 1 : -1))));
    }
    touchStartX.current = null;
  }

  return (
    <div>
      <Link
        to="/dashboard/settings"
        style={{
          display: 'block',
          textAlign: 'center',
          textDecoration: 'none',
          background: 'var(--holo-gradient)',
          color: '#06120f',
          fontWeight: 700,
          fontSize: 14,
          padding: 13,
          borderRadius: 9,
          marginBottom: 20,
        }}
      >
        Edit Profile
      </Link>

      {/* This block visually matches backend/public-tap/index.html exactly --
          it's a live, accurate preview of what a receiver sees, not just a
          loose approximation. */}
      <div className="profile-preview">
        {profile?.bannerUrl && (
          <div className="pv-cover">
            <div className="pv-banner">
              <img src={profile.bannerUrl} alt="" />
            </div>
            <div className="pv-avatar-wrap pv-cover-avatar">
              <div className="pv-avatar">
                {profile?.photoUrl ? <img src={profile.photoUrl} alt="" /> : initials}
              </div>
            </div>
          </div>
        )}
        <div className={`pv-header${profile?.bannerUrl ? ' has-banner' : ''}`}>
          {!profile?.bannerUrl && (
            <div className="pv-avatar-wrap">
              <div className="pv-avatar">
                {profile?.photoUrl ? <img src={profile.photoUrl} alt="" /> : initials}
              </div>
            </div>
          )}
          <div className="pv-name">{profile?.fullName}</div>
          <div className="pv-client-id">{profile?.clientId}</div>
          <div className="pv-title">{profile?.jobTitle || '\u00A0'}</div>
          {profile?.clientId && (
            <div className="pv-qr-inline">
              <img src={`${API_URL}/api/public/qr/${profile.clientId}`} alt="QR code for this card" />
            </div>
          )}

          <div className="pv-actions">
            <Link className="pv-btn pv-btn-primary" to={`/c/${profile?.clientId}`} target="_blank" rel="noopener noreferrer">
              View Live Page
            </Link>
            <Link className="pv-btn pv-btn-secondary" to="/dashboard/settings">
              Edit
            </Link>
          </div>
        </div>

        <div className="pv-tab-bar">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              className={`pv-tab-btn${i === clampedTab ? ' active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pv-panel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {currentKey === 'bio' && <p className="pv-bio">{profile.bio}</p>}

          {currentKey === 'contact' &&
            contactRows.map((row) => (
              <a className="pv-contact-row" key={row.label} href={row.href} target="_blank" rel="noopener noreferrer">
                <span className="pv-icon">{row.icon}</span>
                <span className="pv-contact-label">{row.label}</span>
              </a>
            ))}

          {currentKey === 'portfolio' && (
            <a
              className="pv-contact-row"
              href={profile.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="pv-icon">◆</span>
              <span className="pv-contact-label">{profile.portfolioUrl.replace(/^https?:\/\//, '')}</span>
            </a>
          )}

          {currentKey === 'social' &&
            socialRows.map((row) => (
              <a className="pv-contact-row" key={row.label} href={row.href} target="_blank" rel="noopener noreferrer">
                <span className="pv-icon">{row.icon}</span>
                <span className="pv-contact-label">{row.label}</span>
              </a>
            ))}

          {currentKey === 'huntsworld' && (
            <>
              <div className="pv-section-label">Business listing</div>
              <div className="pv-hw-block">
                <div className="pv-hw-head">
                  <span className="pv-hw-badge">H</span>
                  <div>
                    <div className="pv-hw-title">Huntsworld</div>
                    <div className="pv-hw-sub">{profile.huntsworldUrl.replace(/^https?:\/\//, '')}</div>
                  </div>
                </div>
                <a className="pv-hw-btn" href={profile.huntsworldUrl} target="_blank" rel="noopener noreferrer">
                  View listing on Huntsworld
                </a>
              </div>
            </>
          )}

          {currentKey === 'empty' && <div className="pv-empty">No additional details added yet.</div>}
        </div>
      </div>

      {profile?.clientId && (
        <p className="hint" style={{ marginTop: 16 }}>
          Your public card page:{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>/c/{profile.clientId}</span>
        </p>
      )}
    </div>
  );
}
