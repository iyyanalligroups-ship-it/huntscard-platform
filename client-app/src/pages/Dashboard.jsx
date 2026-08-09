import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_URL } from '../api.js';

// One row for an admin-defined extra field (see AttributeDefinition) --
// same visual as the fixed contact/social rows, but 'text'-type fields
// have no href (nothing to link to), so this renders a plain div instead
// of an <a> in that case. Mirrors PublicProfile.jsx's own CustomRow --
// this preview is meant to match the real public page exactly.
function CustomRow({ row }) {
  const content = (
    <>
      <span className="pv-icon">{row.icon}</span>
      <span className="pv-contact-label">{row.label}</span>
    </>
  );
  return row.href ? (
    <a className="pv-contact-row" href={row.href} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <div className="pv-contact-row">{content}</div>
  );
}

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [attributes, setAttributes] = useState([]); // admin-defined extra fields, see AttributeDefinition
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const touchStartX = useRef(null);
  // Direct WhatsApp/Telegram/email share links, not the OS share sheet --
  // navigator.share({files:[...]}) for a .vcf is unreliable on desktop
  // (most desktop share sheets have nothing registered that accepts a raw
  // vCard file, so it just throws). Sharing the profile LINK through
  // these three specific, always-available deep links is what was
  // actually asked for and works every time, no share-sheet roulette.
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // Separate from the critical profile fetch above -- these are cosmetic
    // extra fields, a failure here shouldn't block the rest of the page.
    api
      .getAttributeDefinitions()
      .then(setAttributes)
      .catch(() => {});
  }, []);

  const shareUrl = profile?.clientId ? `${window.location.origin}/c/${profile.clientId}` : '';
  const shareText = profile?.fullName ? `${profile.fullName} — HuntsTAG\n${shareUrl}` : shareUrl;

  function closeShareMenu() {
    setShareMenuOpen(false);
    setLinkCopied(false);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      /* clipboard blocked -- the link is still right there in the popup to select by hand */
    }
  }

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

  // Admin-defined extra fields (see AttributeDefinition) that this client
  // actually filled in -- rendered the same row style as the fixed fields
  // above, appended within whichever tab they belong to. Mirrors
  // PublicProfile.jsx's own customRowsFor exactly.
  function customRowsFor(section) {
    return attributes
      .filter((a) => a.section === section)
      .map((a) => {
        const value = profile?.customAttributes?.[a.key];
        if (!value) return null;
        const href =
          a.fieldType === 'phone' ? `tel:${value}` : a.fieldType === 'email' ? `mailto:${value}` : a.fieldType === 'url' ? value : undefined;
        return { key: a.key, icon: a.label.slice(0, 2).toUpperCase(), label: `${a.label}: ${value}`, href };
      })
      .filter(Boolean);
  }
  const contactCustomRows = customRowsFor('contact');
  const portfolioCustomRows = customRowsFor('portfolio');
  const socialCustomRows = customRowsFor('social');
  const huntsworldCustomRows = customRowsFor('huntsworld');

  // Only show tabs for sections that actually have content -- matches the
  // real public tap page's behaviour exactly, since this IS a preview of it.
  const tabs = [];
  if (profile?.bio) tabs.push({ label: 'My Bio', key: 'bio' });
  if (contactRows.length || contactCustomRows.length) tabs.push({ label: 'Contact', key: 'contact' });
  if (profile?.portfolioUrl || portfolioCustomRows.length) tabs.push({ label: 'Portfolio', key: 'portfolio' });
  if (socialRows.length || socialCustomRows.length) tabs.push({ label: 'Social', key: 'social' });
  // Huntsworld is a business listing platform -- featured in its own tab,
  // mirroring backend/public-tap/index.html exactly.
  if (profile?.huntsworldUrl || huntsworldCustomRows.length) tabs.push({ label: 'Huntsworld', key: 'huntsworld' });

  // Sections an admin added beyond the original four (see the admin
  // Attributes page) -- no hardcoded fields of their own, just whatever
  // custom rows this client filled in for that section. Includes AR-
  // flagged attributes' own sections (e.g. "Map"), same as PublicProfile.jsx.
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
            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <button
                type="button"
                onClick={() => setShareMenuOpen((v) => !v)}
                title="Share your profile"
                aria-label="Share your profile"
                style={{
                  width: 44,
                  padding: 0,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--pv-surface)',
                  border: '1px solid var(--pv-border)',
                  color: 'var(--pv-text)',
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                  <path d="M16 6l-4-4-4 4" />
                  <path d="M12 2v14" />
                </svg>
              </button>

              {shareMenuOpen && (
                <>
                  {/* Click-outside catcher -- a full-viewport transparent
                      layer under the popup, same trick the AR Layout
                      editors use for their own dropdowns. */}
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={closeShareMenu} />
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 8,
                      background: 'var(--pv-surface)',
                      border: '1px solid var(--pv-border)',
                      borderRadius: 12,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                      minWidth: 190,
                      overflow: 'hidden',
                      zIndex: 10,
                    }}
                  >
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeShareMenu}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', color: 'var(--pv-text)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                    >
                      <span style={{ color: '#25D366' }}>●</span> WhatsApp
                    </a>
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${profile?.fullName || ''} — HuntsTAG`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeShareMenu}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', color: 'var(--pv-text)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                    >
                      <span style={{ color: '#29A9EA' }}>●</span> Telegram
                    </a>
                    <a
                      href={`mailto:?subject=${encodeURIComponent(`${profile?.fullName || ''} — HuntsTAG`)}&body=${encodeURIComponent(shareText)}`}
                      onClick={closeShareMenu}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', color: 'var(--pv-text)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                    >
                      <span style={{ color: 'var(--holo-cyan)' }}>●</span> Email
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '11px 14px',
                        background: 'none',
                        border: 'none',
                        borderTop: '1px solid var(--pv-border)',
                        color: 'var(--pv-text)',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: 'var(--pv-text-dim)' }}>●</span> {linkCopied ? 'Link copied!' : 'Copy link'}
                    </button>
                  </div>
                </>
              )}
            </div>
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

          {currentKey === 'contact' && (
            <>
              {contactRows.map((row) => (
                <a className="pv-contact-row" key={row.label} href={row.href} target="_blank" rel="noopener noreferrer">
                  <span className="pv-icon">{row.icon}</span>
                  <span className="pv-contact-label">{row.label}</span>
                </a>
              ))}
              {contactCustomRows.map((row) => (
                <CustomRow key={row.key} row={row} />
              ))}
            </>
          )}

          {currentKey === 'portfolio' && (
            <>
              {profile.portfolioUrl && (
                <a className="pv-contact-row" href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer">
                  <span className="pv-icon">◆</span>
                  <span className="pv-contact-label">{profile.portfolioUrl.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
              {portfolioCustomRows.map((row) => (
                <CustomRow key={row.key} row={row} />
              ))}
            </>
          )}

          {currentKey === 'social' && (
            <>
              {socialRows.map((row) => (
                <a className="pv-contact-row" key={row.label} href={row.href} target="_blank" rel="noopener noreferrer">
                  <span className="pv-icon">{row.icon}</span>
                  <span className="pv-contact-label">{row.label}</span>
                </a>
              ))}
              {socialCustomRows.map((row) => (
                <CustomRow key={row.key} row={row} />
              ))}
            </>
          )}

          {currentKey === 'huntsworld' && (
            <>
              {profile.huntsworldUrl && (
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
              {huntsworldCustomRows.map((row) => (
                <CustomRow key={row.key} row={row} />
              ))}
            </>
          )}

          {currentKey && customSectionRows[currentKey] && (
            <>
              {customSectionRows[currentKey].map((row) => (
                <CustomRow key={row.key} row={row} />
              ))}
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
