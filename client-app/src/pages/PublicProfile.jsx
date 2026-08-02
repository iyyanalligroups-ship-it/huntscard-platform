import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, API_URL } from '../api.js';
import ArView from './ArView.jsx';

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

  useEffect(() => {
    // ArView fetches its own profile/layout data -- skip the plain-profile
    // fetch entirely in AR mode instead of doing it and throwing it away.
    if (isArMode) return;
    api
      .getPublicProfile(clientId)
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // Separate from the critical profile fetch above -- these are cosmetic
    // extra fields, a failure here shouldn't block the rest of the page.
    api
      .getAttributeDefinitions()
      .then(setAttributes)
      .catch(() => {});
  }, [clientId, isArMode]);

  if (isArMode) {
    return <ArView clientId={clientId} />;
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
      const res = await fetch(`${API_URL}/api/public/vcard/${clientId}`);
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
            <button className="pv-btn pv-btn-primary" onClick={saveContact}>Save Contact</button>
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
    </div>
  );
}
