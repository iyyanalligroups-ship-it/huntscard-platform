import { useEffect, useMemo, useRef, useState } from 'react';
import '@google/model-viewer'; // registers the <model-viewer> custom element used for the 3D model preview below
import { api } from '../api.js';

// Name/job title stay above the tabs, same as the photo/banner -- they're
// identity, not something that belongs to one of the five card tabs.
const IDENTITY_FIELDS = [
  { key: 'fullName', label: 'Full name', type: 'text', required: true },
  { key: 'jobTitle', label: 'Job title', type: 'text' },
];

// Everything else groups under the same five tabs the public card itself
// uses (see PublicProfile.jsx) -- Profile Settings used to be one long
// flat form, which made it hard to see what actually maps to what on the
// card. Admin-defined attributes (fetched separately, see `attributes`
// state below) render alongside these within the matching tab.
const SECTION_FIELDS = {
  contact: [
    { key: 'phone', label: 'Phone number', type: 'tel' },
    { key: 'whatsapp', label: 'WhatsApp number', type: 'tel' },
    { key: 'publicEmail', label: 'Public email', type: 'email' },
  ],
  portfolio: [{ key: 'portfolioUrl', label: 'Portfolio link', type: 'url' }],
  social: [
    { key: 'instagramUrl', label: 'Instagram link', type: 'url' },
    { key: 'twitterUrl', label: 'Twitter / X link', type: 'url' },
  ],
  huntsworld: [{ key: 'huntsworldUrl', label: 'Huntsworld profile link', type: 'url' }],
};

// Custom sections an admin adds (see the admin Attributes page) get
// appended after these, discovered from whatever attribute definitions
// actually come back -- not hardcoded, since there's no fixed list of them.
const BASE_TABS = [
  { key: 'bio', label: 'My Bio' },
  { key: 'contact', label: 'Contact' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'social', label: 'Social' },
  { key: 'huntsworld', label: 'Huntsworld' },
];

// Admin's `fieldType` values map straight onto <input type="..."> except
// 'phone', which HTML spells 'tel'.
const INPUT_TYPE = { text: 'text', phone: 'tel', url: 'url', email: 'email' };

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerSaved, setBannerSaved] = useState(false);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState(null);
  const [arVideoUploading, setArVideoUploading] = useState(false);
  const [arVideoSaved, setArVideoSaved] = useState(false);
  const [arVideoPreviewUrl, setArVideoPreviewUrl] = useState(null);
  const [arModelUploading, setArModelUploading] = useState(false);
  const [arModelSaved, setArModelSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('bio');
  const [attributes, setAttributes] = useState([]); // admin-defined extra fields, see AttributeDefinition
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const arVideoInputRef = useRef(null);
  const arModelInputRef = useRef(null);

  useEffect(() => {
    // Separate from the profile fetch below -- these are cosmetic extra
    // fields, so a failure here shouldn't block the rest of the page.
    api
      .getAttributeDefinitions()
      .then(setAttributes)
      .catch(() => {});
  }, []);

  const tabs = useMemo(() => {
    const baseKeys = new Set(BASE_TABS.map((t) => t.key));
    const customByKey = new Map();
    for (const attr of attributes) {
      if (!baseKeys.has(attr.section) && !customByKey.has(attr.section)) {
        customByKey.set(attr.section, { key: attr.section, label: attr.sectionLabel || attr.section });
      }
    }
    return [...BASE_TABS, ...customByKey.values()];
  }, [attributes]);

  useEffect(() => {
    api
      .getProfile()
      .then((data) => {
        setProfile(data);
        setForm(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function updateCustomAttribute(key, value) {
    setForm((f) => ({ ...f, customAttributes: { ...(f.customAttributes || {}), [key]: value } }));
    setSaved(false);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
    setPhotoSaved(false);
    setUploading(true);
    try {
      const updated = await api.uploadPhoto(file);
      setProfile(updated);
      setPhotoSaved(true);
    } catch (err) {
      setError(err.message);
      setPreviewUrl(null); // upload failed -- drop the preview so it doesn't look saved when it isn't
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleBannerChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerPreviewUrl(URL.createObjectURL(file));
    setError('');
    setBannerSaved(false);
    setBannerUploading(true);
    try {
      const updated = await api.uploadBanner(file);
      setProfile(updated);
      setBannerSaved(true);
    } catch (err) {
      setError(err.message);
      setBannerPreviewUrl(null); // upload failed -- drop the preview so it doesn't look saved when it isn't
    } finally {
      setBannerUploading(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function handleBannerRemove() {
    setError('');
    setBannerSaved(false);
    setBannerUploading(true);
    try {
      const updated = await api.removeBanner();
      setProfile(updated);
      setBannerPreviewUrl(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBannerUploading(false);
    }
  }

  async function handleArVideoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArVideoPreviewUrl(URL.createObjectURL(file));
    setError('');
    setArVideoSaved(false);
    setArVideoUploading(true);
    try {
      const updated = await api.uploadArVideo(file);
      setProfile(updated);
      setArVideoSaved(true);
    } catch (err) {
      setError(err.message);
      setArVideoPreviewUrl(null); // upload failed -- drop the preview so it doesn't look saved when it isn't
    } finally {
      setArVideoUploading(false);
      if (arVideoInputRef.current) arVideoInputRef.current.value = '';
    }
  }

  async function handleArVideoRemove() {
    setError('');
    setArVideoSaved(false);
    setArVideoUploading(true);
    try {
      const updated = await api.removeArVideo();
      setProfile(updated);
      setArVideoPreviewUrl(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setArVideoUploading(false);
    }
  }

  async function handleArModelChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setArModelSaved(false);
    setArModelUploading(true);
    try {
      const updated = await api.uploadArModel(file);
      setProfile(updated);
      setArModelSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setArModelUploading(false);
      if (arModelInputRef.current) arModelInputRef.current.value = '';
    }
  }

  async function handleArModelRemove() {
    setError('');
    setArModelSaved(false);
    setArModelUploading(true);
    try {
      const updated = await api.removeArModel();
      setProfile(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setArModelUploading(false);
    }
  }

  async function handleSaveDetails(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      const updates = { bio: form.bio || '' };
      for (const { key } of IDENTITY_FIELDS) updates[key] = form[key] || '';
      for (const fields of Object.values(SECTION_FIELDS)) {
        for (const { key } of fields) updates[key] = form[key] || '';
      }
      updates.customAttributes = form.customAttributes || {};
      const updated = await api.updateProfile(updates);
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="subtitle">Loading…</p>;

  const displayPhoto = previewUrl || profile?.photoUrl;
  const displayBanner = bannerPreviewUrl || profile?.bannerUrl;

  return (
    <div>
      <h1>Profile Settings</h1>
      <p className="subtitle">
        Everything here — photo, identity, and contact details — is what's shown when someone taps or scans
        your card. Changes go live immediately after saving.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {saved && !error && (
        <div className="hint" style={{ marginBottom: 16, color: 'var(--accent)' }}>
          Saved — your card reflects this the next time someone taps it.
        </div>
      )}

      {/* --- photo + banner: both upload immediately on selection --- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 8 }}>Banner (shown behind your photo on the card)</label>
        <div
          className="banner-preview"
          style={{ opacity: bannerUploading ? 0.5 : 1 }}
        >
          {displayBanner ? (
            <img src={displayBanner} alt="" />
          ) : (
            <span className="banner-placeholder">No banner yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleBannerChange}
            style={{ display: 'none' }}
            id="bannerInput"
            disabled={bannerUploading}
          />
          <label
            htmlFor="bannerInput"
            className="secondary"
            style={{ display: 'inline-block', width: 'auto', cursor: bannerUploading ? 'default' : 'pointer', opacity: bannerUploading ? 0.6 : 1 }}
          >
            {bannerUploading ? 'Working…' : displayBanner ? 'Change banner' : 'Choose banner'}
          </label>
          {displayBanner && !bannerUploading && (
            <button
              type="button"
              className="secondary"
              style={{ width: 'auto' }}
              onClick={handleBannerRemove}
            >
              Remove
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          {bannerUploading
            ? 'Saving your banner now…'
            : 'JPEG, PNG, or WEBP. Max 5MB. Wide images work best (about 3:1). Uploads immediately.'}
        </p>
        {bannerSaved && !bannerUploading && (
          <p className="hint" style={{ margin: '4px 0 0', color: 'var(--holo-cyan)' }}>
            Banner saved.
          </p>
        )}
      </div>

      {/* --- HuntsAR World video: the floating "hologram" figure people see
          in the app when they scan your card's QR code --- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 8 }}>HuntsAR World video (optional)</label>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          Filmed against a plain green or blue background, this plays as a floating figure of you when someone
          scans your card in the HuntsAR World app. Without one, they'll just see your photo and name instead.
        </p>
        <div
          className="banner-preview"
          style={{ opacity: arVideoUploading ? 0.5 : 1, minHeight: 90 }}
        >
          {profile?.arVideoUrl || arVideoPreviewUrl ? (
            <video
              src={arVideoPreviewUrl || profile.arVideoUrl}
              controls
              muted
              style={{ width: '100%', maxHeight: 220, display: 'block' }}
            />
          ) : (
            <span className="banner-placeholder">No video yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <input
            ref={arVideoInputRef}
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={handleArVideoChange}
            style={{ display: 'none' }}
            id="arVideoInput"
            disabled={arVideoUploading}
          />
          <label
            htmlFor="arVideoInput"
            className="secondary"
            style={{ display: 'inline-block', width: 'auto', cursor: arVideoUploading ? 'default' : 'pointer', opacity: arVideoUploading ? 0.6 : 1 }}
          >
            {arVideoUploading ? 'Working…' : profile?.arVideoUrl ? 'Change video' : 'Choose video'}
          </label>
          {profile?.arVideoUrl && !arVideoUploading && (
            <button
              type="button"
              className="secondary"
              style={{ width: 'auto' }}
              onClick={handleArVideoRemove}
            >
              Remove
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          {arVideoUploading
            ? 'Saving your video now…'
            : 'MP4 or MOV. Max 80MB. Green/blue screen background required for the floating effect to work. Uploads immediately.'}
        </p>
        {arVideoSaved && !arVideoUploading && (
          <p className="hint" style={{ margin: '4px 0 0', color: 'var(--holo-cyan)' }}>
            Video saved.
          </p>
        )}
      </div>

      {/* The 3D model is an AR Layout element, so it's gated the same way
          AR Layout itself is -- no point uploading one on a plan that can
          never actually use it. */}
      {profile && !profile.arEnabled && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>
            3D model isn't included in your current plan
            {profile?.cardType ? ` (${profile.cardType})` : ''}.
          </p>
          <p className="hint" style={{ marginBottom: 16 }}>
            Upgrade to a plan with AR to add a real 3D model to your HuntsAR World panel.
          </p>
          <a href="/dashboard/upgrade">
            <button style={{ width: 'auto' }}>See plans with AR</button>
          </a>
        </div>
      )}

      {profile?.arEnabled && (
      /* --- Real 3D model: rendered as an actual 3D object in HuntsAR
          World instead of the flat video/photo panel, when set --- */
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 8 }}>3D model (optional)</label>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          A real 3D model (.glb) shown in HuntsAR World instead of the flat video/photo
          panel. Without one, your video or photo panel is used instead.
        </p>
        <div
          className="banner-preview"
          style={{ opacity: arModelUploading ? 0.5 : 1, minHeight: 160 }}
        >
          {profile?.arModelUrl ? (
            <model-viewer
              src={profile.arModelUrl}
              camera-controls
              auto-rotate
              style={{ width: '100%', height: 220, display: 'block' }}
            />
          ) : (
            <span className="banner-placeholder">No model yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <input
            ref={arModelInputRef}
            type="file"
            accept=".glb"
            onChange={handleArModelChange}
            style={{ display: 'none' }}
            id="arModelInput"
            disabled={arModelUploading}
          />
          <label
            htmlFor="arModelInput"
            className="secondary"
            style={{ display: 'inline-block', width: 'auto', cursor: arModelUploading ? 'default' : 'pointer', opacity: arModelUploading ? 0.6 : 1 }}
          >
            {arModelUploading ? 'Working…' : profile?.arModelUrl ? 'Change model' : 'Choose model'}
          </label>
          {profile?.arModelUrl && !arModelUploading && (
            <button
              type="button"
              className="secondary"
              style={{ width: 'auto' }}
              onClick={handleArModelRemove}
            >
              Remove
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          {arModelUploading ? 'Saving your model now…' : '.glb format only. Max 50MB. Uploads immediately.'}
        </p>
        {arModelSaved && !arModelUploading && (
          <p className="hint" style={{ margin: '4px 0 0', color: 'var(--holo-cyan)' }}>
            Model saved.
          </p>
        )}
      </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              position: 'relative',
              background: displayPhoto ? 'transparent' : 'var(--holo-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
              color: '#06120f',
              border: '1px solid var(--panel-border)',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {displayPhoto ? (
              <img src={displayPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (profile?.fullName || '?').charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="photoInput"
              disabled={uploading}
            />
            <label
              htmlFor="photoInput"
              className="secondary"
              style={{ display: 'inline-block', width: 'auto', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? 'Uploading…' : 'Choose photo'}
            </label>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              {uploading ? 'Saving your photo now…' : 'JPEG, PNG, or WEBP. Max 5MB. Uploads immediately.'}
            </p>
            {photoSaved && !uploading && (
              <p className="hint" style={{ margin: '4px 0 0', color: 'var(--accent)' }}>
                Photo saved.
              </p>
            )}
          </div>
        </div>
      </div>

      <form className="card" onSubmit={handleSaveDetails}>
        {/* Identity -- shown above the tabs, same as the photo/banner above, since
            it isn't part of any one of the card's five tabs. */}
        <div className="field-grid" style={{ marginBottom: 20 }}>
          {IDENTITY_FIELDS.map(({ key, label, type, required }) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                type={type}
                value={form[key] || ''}
                onChange={(e) => updateField(key, e.target.value)}
                required={required}
              />
            </div>
          ))}
        </div>

        {/* Mirrors the public card's own five tabs (see PublicProfile.jsx)
            so it's obvious what maps to what -- was one long flat form before. */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--panel-border)',
            marginBottom: 16,
            paddingBottom: 10,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={activeTab === tab.key ? undefined : 'secondary'}
              style={{ width: 'auto', padding: '8px 14px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'bio' && (
          <div className="field">
            <label htmlFor="bio">About (short bio)</label>
            <textarea
              id="bio"
              rows={3}
              maxLength={280}
              value={form.bio || ''}
              onChange={(e) => updateField('bio', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--panel-raised)',
                border: '1px solid var(--panel-border)',
                borderRadius: 9,
                padding: '11px 13px',
                color: 'var(--text)',
                fontSize: 14,
                fontFamily: 'var(--font-ui)',
                resize: 'vertical',
              }}
            />
          </div>
        )}

        {activeTab !== 'bio' && (
          <div className="field-grid">
            {(SECTION_FIELDS[activeTab] || []).map(({ key, label, type }) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{label}</label>
                <input id={key} type={type} value={form[key] || ''} onChange={(e) => updateField(key, e.target.value)} />
              </div>
            ))}
            {attributes
              .filter((attr) => attr.section === activeTab)
              .map((attr) => (
                <div className="field" key={attr.key}>
                  <label htmlFor={`attr-${attr.key}`}>{attr.label}</label>
                  <input
                    id={`attr-${attr.key}`}
                    type={INPUT_TYPE[attr.fieldType] || 'text'}
                    value={form.customAttributes?.[attr.key] || ''}
                    onChange={(e) => updateCustomAttribute(attr.key, e.target.value)}
                  />
                </div>
              ))}
          </div>
        )}

        <button type="submit" disabled={saving} style={{ marginTop: 20 }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {/* Feedback right next to the button -- the top-of-page banner is
            off-screen when you're scrolled down at the Save button. */}
        {saved && !error && (
          <p className="hint" style={{ margin: '10px 0 0', color: 'var(--holo-cyan)' }}>
            ✓ Saved — your card reflects this the next time someone taps it.
          </p>
        )}
        {error && (
          <p className="hint" style={{ margin: '10px 0 0', color: 'var(--danger)' }}>
            Couldn't save: {error}
          </p>
        )}
      </form>

      {profile?.clientId && (
        <p className="hint" style={{ marginTop: 16 }}>
          Your public card page:{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>/c/{profile.clientId}</span>
        </p>
      )}
    </div>
  );
}
