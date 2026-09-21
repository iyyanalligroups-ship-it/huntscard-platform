import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // True once the banner <img> actually fails to load (a stale bannerUrl
  // pointing at a file that's gone from the backend, not just "never set"
  // -- that case is handled separately below). Without this, a broken
  // image left the cover-avatar's absolutely-positioned circle (it
  // centers itself on .pv-cover's height) sitting on top of a collapsed
  // 0-height banner, clipping its top half against .profile-preview's
  // own overflow:hidden.
  const [bannerFailed, setBannerFailed] = useState(false);
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
  // Where the speed-dial column anchors -- computed from the trigger
  // button's own position at open time (it's portaled to document.body,
  // so it has no ancestor to position itself relative to via CSS alone).
  const [shareAnchor, setShareAnchor] = useState(null);
  const shareBtnRef = useRef(null);

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

  // Give a freshly-uploaded banner a clean retry -- otherwise a stale
  // bannerFailed from a PREVIOUS broken URL would keep the placeholder
  // showing even after the client uploads a working one.
  useEffect(() => {
    setBannerFailed(false);
  }, [profile?.bannerUrl]);

  const shareUrl = profile?.clientId ? `${window.location.origin}/c/${profile.clientId}` : '';
  const shareText = profile?.fullName ? `${profile.fullName} — HuntsTAG\n${shareUrl}` : shareUrl;

  function closeShareMenu() {
    setShareMenuOpen(false);
    setLinkCopied(false);
  }

  function toggleShareMenu() {
    if (shareMenuOpen) {
      closeShareMenu();
      return;
    }
    const rect = shareBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setShareAnchor({ right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 8 });
    }
    setShareMenuOpen(true);
  }

  // A static anchor (computed once, on open) would drift out from under
  // the button if the page scrolls or resizes while the dial is open --
  // simplest fix, matching how native popovers behave, is to just close it.
  useEffect(() => {
    if (!shareMenuOpen) return;
    function handleReflow() {
      closeShareMenu();
    }
    window.addEventListener('scroll', handleReflow, true);
    window.addEventListener('resize', handleReflow);
    return () => {
      window.removeEventListener('scroll', handleReflow, true);
      window.removeEventListener('resize', handleReflow);
    };
  }, [shareMenuOpen]);

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
    (profile?.publicEmail || profile?.loginEmail) && {
      icon: '✉',
      label: profile.publicEmail || profile.loginEmail,
      href: `mailto:${profile.publicEmail || profile.loginEmail}`,
    },
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
        className="dash-edit-profile-btn"
        style={{
          display: 'block',
          textAlign: 'center',
          textDecoration: 'none',
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
          loose approximation. The cover/avatar-overlap layout below always
          renders (real banner or placeholder) rather than switching to a
          differently-laid-out plain avatar when there's no banner -- that
          used to also mean a stale bannerUrl pointing at a file missing
          from the backend rendered a 0-height banner with the absolutely-
          positioned avatar clipped against .profile-preview's own
          overflow:hidden (its top:50% math has nothing to center against). */}
      <div className="profile-preview">
        <div className="pv-cover">
          {profile?.bannerUrl && !bannerFailed ? (
            <div className="pv-banner">
              <img src={profile.bannerUrl} alt="" onError={() => setBannerFailed(true)} />
            </div>
          ) : (
            <div className="pv-banner pv-banner-placeholder">
              <span className="pv-banner-placeholder-icon">🖼</span>
              <Link to="/dashboard/settings">Upload a banner</Link>
            </div>
          )}
          <div className="pv-avatar-wrap pv-cover-avatar">
            <div className="pv-avatar">
              {profile?.photoUrl ? <img src={profile.photoUrl} alt="" /> : initials}
            </div>
          </div>
        </div>
        <div className="pv-header has-banner">
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
            <button
              ref={shareBtnRef}
              type="button"
              onClick={toggleShareMenu}
              title="Share your profile"
              aria-label="Share your profile"
              aria-expanded={shareMenuOpen}
              style={{
                width: 44,
                flex: '0 0 auto',
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
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Portaled to document.body -- .profile-preview's own
            overflow:hidden (needed elsewhere for its rounded corners) is
            exactly what was clipping the old dropdown's lower options
            behind the tab bar, and a fixed-position column has no ancestor
            box to escape here anyway. Position comes from shareAnchor,
            captured off the trigger button at open time (see
            toggleShareMenu). Icons stack bottom-up in DOM order -- closest
            to the button (WhatsApp) pops in first, farthest (Copy link)
            last. */}
        {shareMenuOpen && shareAnchor && createPortal(
          <>
            <div className="share-dial-overlay" onClick={closeShareMenu} />
            <div className="share-dial-col" style={{ position: 'fixed', right: shareAnchor.right, bottom: shareAnchor.bottom }}>
              <button
                type="button"
                onClick={handleCopyLink}
                className="share-dial-item"
                title={linkCopied ? 'Link copied!' : 'Copy link'}
                aria-label="Copy link"
                style={{ color: 'var(--holo-violet)', animationDelay: '210ms' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {linkCopied ? (
                    <path d="M5 13l4 4L19 7" />
                  ) : (
                    <>
                      <path d="M9 15 15 9" />
                      <path d="M10.5 6.5 12 5a3.5 3.5 0 0 1 5 5l-1.5 1.5" />
                      <path d="M13.5 17.5 12 19a3.5 3.5 0 0 1-5-5l1.5-1.5" />
                    </>
                  )}
                </svg>
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent(`${profile?.fullName || ''} — HuntsTAG`)}&body=${encodeURIComponent(shareText)}`}
                onClick={closeShareMenu}
                className="share-dial-item"
                title="Share via Email"
                aria-label="Share via Email"
                style={{ color: 'var(--holo-cyan)', animationDelay: '140ms' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${profile?.fullName || ''} — HuntsTAG`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeShareMenu}
                className="share-dial-item"
                title="Share via Telegram"
                aria-label="Share via Telegram"
                style={{ color: '#29A9EA', animationDelay: '70ms' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 3 2 10.5l6.5 2.2M22 3 15.5 21l-6-8.3M22 3 8.5 12.7" />
                </svg>
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeShareMenu}
                className="share-dial-item"
                title="Share via WhatsApp"
                aria-label="Share via WhatsApp"
                style={{ color: '#25D366', animationDelay: '0ms' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20l1.4-4.1A7.9 7.9 0 1 1 8.6 19L4 20Z" />
                  <path d="M9 10.2c0 2.7 2.1 4.8 4.8 4.8" />
                </svg>
              </a>
            </div>
          </>,
          document.body
        )}

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
