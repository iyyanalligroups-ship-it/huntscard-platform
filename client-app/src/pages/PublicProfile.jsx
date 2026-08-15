import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api, API_URL } from '../api.js';
import ArView from './ArView.jsx';

// Opt-in alternative tracking engine (mind-ar, whole-card tracking instead
// of QR-corner POSIT) -- reached ONLY via `?ar=1&engine=mindar` together.
// Lazy-loaded since it pulls in mind-ar + TensorFlow.js, a genuinely heavy
// dependency that every normal `?ar=1` (the default, unchanged) visitor
// shouldn't have to download. See ArViewMindAR.jsx's own file comment for
// the full context -- this is the validated "Mark 1" experiment, now
// live behind a flag for real-traffic testing, not yet the default.
const ArViewMindAR = lazy(() => import('./ArViewMindAR.jsx'));

// If the new engine crashes, fall back to the link home instead of a
// blank white screen -- this route is public and unauthenticated, so
// there's no dashboard/devtools access to diagnose from if something
// goes wrong for a real visitor.
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

// One row for an admin-defined extra field (see AttributeDefinition) --
// same visual as the fixed contact/social rows, but 'text'-type fields
// have no href (nothing to link to), so this renders a plain div instead
// of an <a> in that case.
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

// The public tap page -- what a stranger sees when they tap the physical
// card or scan its QR code. No login, no session: anyone who has the
// clientId can view this, same as backend/public-tap/index.html did
// before this page replaced it. Visually this mirrors Dashboard.jsx's own
// "preview of your live page" block (same pv-* classes), since that block
// was explicitly built to be an accurate live preview of this exact page.
export default function PublicProfile() {
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [attributes, setAttributes] = useState([]); // admin-defined extra fields, see AttributeDefinition
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimeoutRef = useRef(null);
  const touchStartX = useRef(null);
  const isArMode = searchParams.get('ar') === '1';
  // Opt-in only -- see the ArViewMindAR import comment above. Every
  // existing tap/scan link (bare `?ar=1`) is completely unaffected.
  const useMindAR = isArMode && searchParams.get('engine') === 'mindar';
  // Which specific physical card this is, if its own URL encoded one (see
  // models/Card.js) -- absent for cards written before this existed, in
  // which case only the whole-profile pause applies (see backend).
  const cardNumber = searchParams.get('card') || undefined;
  // Which AR experience to show -- asked once per visit via the chooser
  // screen below, only relevant while isArMode is true. 'ar' falls
  // through into the existing useMindAR/ArView logic below unchanged;
  // 'magic' hands off to the client-scoped Magic Camera (a client-side
  // redirect, not rendered inline here, since MagicCamera.jsx is a full
  // route component that reads its own :clientId via useParams).
  const [arChoice, setArChoice] = useState(null);

  // "Exchange Contact" -- the reverse direction of saveContact() below.
  // Combined into one action (see the button itself, ~line 229) rather
  // than a separate opt-in button, since most visitors won't bother
  // clicking a second, skippable ask.
  const [showExchange, setShowExchange] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadOrg, setLeadOrg] = useState('');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState('');

  useEffect(() => {
    // ArView fetches its own profile/layout data -- skip the plain-profile
    // fetch entirely in AR mode instead of doing it and throwing it away.
    if (isArMode) return;
    api
      .getPublicProfile(clientId, cardNumber)
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // Separate from the critical profile fetch above -- these are cosmetic
    // extra fields, a failure here shouldn't block the rest of the page.
    api
      .getAttributeDefinitions()
      .then(setAttributes)
      .catch(() => {});
  }, [clientId, isArMode, cardNumber]);

  // Asked once, before committing to either experience -- a card can have
  // both a HuntsAR World floating panel AND a Magic Business Card effect
  // set up, and there's no way to tell which one a visitor wants just
  // from the QR itself, so ask instead of guessing.
  if (isArMode && !arChoice) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 16, maxWidth: 320 }}>Choose an experience</p>
        <div style={{ display: 'flex', gap: 16 }}>
          <button onClick={() => setArChoice('ar')} style={{ width: 'auto', padding: '14px 28px' }}>
            AR
          </button>
          <button
            onClick={() => setArChoice('magic')}
            className="secondary"
            style={{ width: 'auto', padding: '14px 28px' }}
          >
            Magic
          </button>
        </div>
      </div>
    );
  }

  if (arChoice === 'magic') {
    return <Navigate to={`/magic-camera/${clientId}`} replace />;
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

  function showToast(msg, duration = 1800) {
    setToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(''), duration);
  }

  // Downloads the vCard as a blob and hands it to the browser, rather than
  // a plain <a href> -- a straight link-click download can silently no-op
  // on some browsers before a second click actually triggers it. This is
  // always a single, reliable action, with our own toast confirming it
  // instead of relying on the browser's own download UI.
  async function saveContact() {
    try {
      const res = await fetch(`${API_URL}/api/public/vcard/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`);
      if (!res.ok) throw new Error('vcard fetch failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
      const filename = filenameMatch ? filenameMatch[1] : 'contact.vcf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Downloading is as far as any website can go -- actually adding it
      // to the phone's contacts happens when the OS opens this file and
      // its own Contacts app shows an import screen. No browser lets a
      // webpage write into the OS address book directly.
      showToast('Downloaded — open it to add to your contacts', 3200);
    } catch {
      showToast('Could not save contact');
    }
  }

  // The combined "Exchange Contact" action -- downloads the owner's vCard
  // (unchanged) and then opens the leave-your-info form, so a single tap
  // covers both directions instead of requiring a second, separate ask.
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
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    }
  }

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

  if (loading) return <div className="pv-page"><p className="pv-state-msg">Loading card…</p></div>;
  // Deliberately distinct wording from "Card not found" below -- this
  // card genuinely exists, its owner just turned it off (see
  // Settings.jsx's "Card status"), which reads very differently to
  // someone debugging their own link.
  if (profile?.paused) {
    return (
      <div className="pv-page">
        <p className="pv-state-msg">This card has been deactivated by its owner.</p>
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="pv-page">
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

  const contactRows = [
    profile.phone && { icon: '☎', label: profile.phone, href: `tel:${profile.phone}` },
    profile.publicEmail && { icon: '✉', label: profile.publicEmail, href: `mailto:${profile.publicEmail}` },
  ].filter(Boolean);

  const socialRows = [
    profile.instagramUrl && { icon: 'IG', label: 'Instagram', href: profile.instagramUrl },
    profile.twitterUrl && { icon: 'X', label: 'Twitter / X', href: profile.twitterUrl },
    profile.whatsapp && {
      icon: 'WA',
      label: 'WhatsApp',
      href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`,
    },
  ].filter(Boolean);

  // Admin-defined extra fields (see AttributeDefinition) that this client
  // actually filled in -- rendered the same row style as the fixed fields
  // above, appended within whichever tab they belong to.
  function customRowsFor(section) {
    return attributes
      .filter((a) => a.section === section)
      .map((a) => {
        const value = profile.customAttributes?.[a.key];
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

  const tabs = [];
  if (profile.bio) tabs.push({ label: 'My Bio', key: 'bio' });
  if (contactRows.length || contactCustomRows.length) tabs.push({ label: 'Contact', key: 'contact' });
  if (profile.portfolioUrl || portfolioCustomRows.length) tabs.push({ label: 'Portfolio', key: 'portfolio' });
  if (socialRows.length || socialCustomRows.length) tabs.push({ label: 'Social', key: 'social' });
  if (profile.huntsworldUrl || huntsworldCustomRows.length) tabs.push({ label: 'Huntsworld', key: 'huntsworld' });

  // Sections an admin added beyond the original four (see the admin
  // Attributes page) -- no hardcoded fields of their own, just whatever
  // custom rows this client filled in for that section.
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

  return (
    <div className="pv-page">
      <div className="pv-shell">
        {profile.bannerUrl && (
          <div className="pv-cover">
            <div className="pv-banner"><img src={profile.bannerUrl} alt="" onError={(e) => e.target.parentElement.remove()} /></div>
            <div className="pv-avatar-wrap pv-cover-avatar">
              <div className="pv-avatar">{profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : initials}</div>
            </div>
          </div>
        )}
        <div className={`pv-header${profile.bannerUrl ? ' has-banner' : ''}`}>
          {!profile.bannerUrl && (
            <div className="pv-avatar-wrap">
              <div className="pv-avatar">{profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : initials}</div>
            </div>
          )}
          <div className="pv-name">{profile.fullName}</div>
          {profile.jobTitle && <div className="pv-title">{profile.jobTitle}</div>}

          <div className="pv-actions">
            <button className="pv-btn pv-btn-primary" onClick={handleExchangeClick}>Exchange Contact</button>
            <button className="pv-btn pv-btn-secondary" onClick={handleShare}>Share</button>
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

        <div className="pv-footer-brand">
          <div className="pv-footer-mark" />
          HUNTSTAG
        </div>
      </div>

      <div className={`pv-toast${toast ? ' show' : ''}`}>{toast}</div>

      {showExchange && (
        <div className="auth-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowExchange(false)}>
          <div className="auth-modal-card">
            <button className="auth-modal-close" onClick={() => setShowExchange(false)} aria-label="Close">
              ×
            </button>
            <h1 style={{ fontSize: 20 }}>Leave your contact</h1>
            <p className="subtitle" style={{ marginBottom: 20 }}>
              {profile.fullName || 'They'}'ll get your info so they can follow up with you.
            </p>
            {leadError && <div className="error-banner">{leadError}</div>}
            <form onSubmit={handleLeadSubmit}>
              <div className="field">
                <label htmlFor="leadName">Name</label>
                <input id="leadName" type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="leadPhone">Phone number</label>
                <input
                  id="leadPhone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="leadEmail">Email (optional)</label>
                <input id="leadEmail" type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="leadOrg">Company (optional)</label>
                <input id="leadOrg" type="text" value={leadOrg} onChange={(e) => setLeadOrg(e.target.value)} />
              </div>
              <button type="submit" disabled={leadSubmitting}>
                {leadSubmitting ? 'Sharing…' : 'Share my contact'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
