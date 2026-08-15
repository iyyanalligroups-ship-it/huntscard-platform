import { useEffect, useMemo, useRef, useState } from 'react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { api } from '../api.js';
import Magic3DPreview from '../components/Magic3DPreview.jsx';

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
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [arBannerUploading, setArBannerUploading] = useState(false);
  const [arBannerSaved, setArBannerSaved] = useState(false);
  const [arBannerPreviewUrl, setArBannerPreviewUrl] = useState(null);
  const [arBannerPreviewType, setArBannerPreviewType] = useState(null); // 'video' | 'image' -- only needed for the LOCAL preview before the server's own arBannerType comes back
  const [arModelUploading, setArModelUploading] = useState(false);
  const [arModelSaved, setArModelSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('bio');
  const [attributes, setAttributes] = useState([]); // admin-defined extra fields, see AttributeDefinition
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const arBannerInputRef = useRef(null);
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

  // AR-flagged attributes (AttributeDefinition.arComponent) -- rendered
  // below as extra link inputs, values read/written via the same
  // customAttributes map every other custom field already uses.
  const arComponents = useMemo(() => attributes.filter((a) => a.arComponent), [attributes]);

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

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreviewUrl(URL.createObjectURL(file));
    setError('');
    setLogoSaved(false);
    setLogoUploading(true);
    try {
      const updated = await api.uploadLogo(file);
      setProfile(updated);
      setLogoSaved(true);
    } catch (err) {
      setError(err.message);
      setLogoPreviewUrl(null); // upload failed -- drop the preview so it doesn't look saved when it isn't
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleLogoRemove() {
    setError('');
    setLogoSaved(false);
    setLogoUploading(true);
    try {
      const updated = await api.removeLogo();
      setProfile(updated);
      setLogoPreviewUrl(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleArBannerChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArBannerPreviewType(file.type.startsWith('video/') ? 'video' : 'image');
    setArBannerPreviewUrl(URL.createObjectURL(file));
    setError('');
    setArBannerSaved(false);
    setArBannerUploading(true);
    try {
      const updated = await api.uploadArBanner(file);
      setProfile(updated);
      setArBannerSaved(true);
    } catch (err) {
      setError(err.message);
      setArBannerPreviewUrl(null); // upload failed -- drop the preview so it doesn't look saved when it isn't
    } finally {
      setArBannerUploading(false);
      if (arBannerInputRef.current) arBannerInputRef.current.value = '';
    }
  }

  async function handleArBannerRemove() {
    setError('');
    setArBannerSaved(false);
    setArBannerUploading(true);
    try {
      const updated = await api.removeArBanner();
      setProfile(updated);
      setArBannerPreviewUrl(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setArBannerUploading(false);
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
      // Private, admin-only fields -- deliberately NOT part of
      // IDENTITY_FIELDS/SECTION_FIELDS above, since those all render on
      // the public card and these must never appear there.
      updates.gender = form.gender || '';
      updates.dateOfBirth = form.dateOfBirth || '';
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
  const displayLogo = logoPreviewUrl || profile?.logoUrl;
  // Resolution order: a fresh local pick, then the new one-slot field, then
  // the legacy video-only field (implicitly 'video') for clients who
  // uploaded before this existed -- never falls back to the general
  // profile photo here, that's shown separately in AR when this is empty.
  const displayArBannerUrl = arBannerPreviewUrl || profile?.arBannerUrl || profile?.arVideoUrl;
  const displayArBannerType = arBannerPreviewUrl
    ? arBannerPreviewType
    : profile?.arBannerUrl
    ? profile?.arBannerType
    : profile?.arVideoUrl
    ? 'video'
    : null;

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
            <Zoom>
              <img src={displayBanner} alt="" />
            </Zoom>
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

      {/* --- logo: for print production, admin downloads this from the
          Clients page to send to the physical card printer --- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 8 }}>Logo (optional, for printing on your card)</label>
        <div
          className="banner-preview"
          style={{ opacity: logoUploading ? 0.5 : 1 }}
        >
          {displayLogo ? (
            <Zoom>
              <img src={displayLogo} alt="" style={{ objectFit: 'contain' }} />
            </Zoom>
          ) : (
            <span className="banner-placeholder">No logo yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleLogoChange}
            style={{ display: 'none' }}
            id="logoInput"
            disabled={logoUploading}
          />
          <label
            htmlFor="logoInput"
            className="secondary"
            style={{ display: 'inline-block', width: 'auto', cursor: logoUploading ? 'default' : 'pointer', opacity: logoUploading ? 0.6 : 1 }}
          >
            {logoUploading ? 'Working…' : displayLogo ? 'Change logo' : 'Choose logo'}
          </label>
          {displayLogo && !logoUploading && (
            <button
              type="button"
              className="secondary"
              style={{ width: 'auto' }}
              onClick={handleLogoRemove}
            >
              Remove
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          {logoUploading
            ? 'Saving your logo now…'
            : "JPEG, PNG, or WEBP. Max 5MB. We'll print this on your physical card as uploaded."}
        </p>
        {logoSaved && !logoUploading && (
          <p className="hint" style={{ margin: '4px 0 0', color: 'var(--holo-cyan)' }}>
            Logo saved.
          </p>
        )}
      </div>

      {/* --- HuntsAR World Banner: one slot for either a floating "hologram"
          video or a still image, shown when someone scans your card's QR
          code --- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 8 }}>HuntsAR World Banner (optional)</label>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          Upload either a video (filmed against a plain green or blue background, plays as a floating
          hologram figure of you) or a still image -- whichever you have. Shown when someone scans your
          card in the HuntsAR World app. Without one, they'll just see your photo and name instead.
        </p>
        <div
          className="banner-preview"
          style={{ opacity: arBannerUploading ? 0.5 : 1, minHeight: 90 }}
        >
          {displayArBannerUrl ? (
            displayArBannerType === 'video' ? (
              <video
                src={displayArBannerUrl}
                controls
                muted
                style={{ width: '100%', maxHeight: 220, display: 'block' }}
              />
            ) : (
              <Zoom>
                <img src={displayArBannerUrl} alt="" style={{ width: '100%', maxHeight: 220, display: 'block', objectFit: 'contain' }} />
              </Zoom>
            )
          ) : (
            <span className="banner-placeholder">No banner yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <input
            ref={arBannerInputRef}
            type="file"
            accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
            onChange={handleArBannerChange}
            style={{ display: 'none' }}
            id="arBannerInput"
            disabled={arBannerUploading}
          />
          <label
            htmlFor="arBannerInput"
            className="secondary"
            style={{ display: 'inline-block', width: 'auto', cursor: arBannerUploading ? 'default' : 'pointer', opacity: arBannerUploading ? 0.6 : 1 }}
          >
            {arBannerUploading ? 'Working…' : displayArBannerUrl ? 'Change banner' : 'Choose video or image'}
          </label>
          {displayArBannerUrl && !arBannerUploading && (
            <button
              type="button"
              className="secondary"
              style={{ width: 'auto' }}
              onClick={handleArBannerRemove}
            >
              Remove
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          {arBannerUploading
            ? 'Saving your banner now…'
            : 'MP4/MOV video (max 80MB, green/blue screen required for the floating effect) or JPEG/PNG/WEBP image. Uploads immediately.'}
        </p>
        {arBannerSaved && !arBannerUploading && (
          <p className="hint" style={{ margin: '4px 0 0', color: 'var(--holo-cyan)' }}>
            Banner saved.
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
          Upload either a real 3D model (.glb or .fbx, shown as an actual 3D object) or a flat
          cutout image (PNG/JPEG/WEBP -- a transparent PNG works well, shown as a real 3D card in
          HuntsAR World, same as the banner). Without one, your video or photo panel is used
          instead.
        </p>
        <div
          className="banner-preview"
          style={{ opacity: arModelUploading ? 0.5 : 1, minHeight: 160 }}
        >
          {profile?.arModelUrl && profile?.arModelType === 'image' ? (
            // Click to zoom to a full-size lightbox -- the 3D-model case
            // below auto-rotates on a turntable instead, no zoom needed.
            <Zoom>
              <img src={profile.arModelUrl} alt="" style={{ maxHeight: 220, display: 'block', margin: '0 auto' }} />
            </Zoom>
          ) : profile?.arModelUrl ? (
            <Magic3DPreview modelUrl={profile.arModelUrl} modelType={profile.arModelType} width={320} height={220} />
          ) : (
            <span className="banner-placeholder">No model yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <input
            ref={arModelInputRef}
            type="file"
            accept=".glb,.fbx,image/jpeg,image/png,image/webp"
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
            {arModelUploading ? 'Working…' : profile?.arModelUrl ? 'Change model' : 'Choose model or image'}
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
          {arModelUploading ? 'Saving your model now…' : '.glb, .fbx, JPEG, PNG, or WEBP. Max 50MB. Uploads immediately.'}
        </p>
        {arModelSaved && !arModelUploading && (
          <p className="hint" style={{ margin: '4px 0 0', color: 'var(--holo-cyan)' }}>
            Model saved.
          </p>
        )}
      </div>
      )}

      {/* AR-flagged attributes (AttributeDefinition.arComponent) -- e.g.
          "Map" (a Google Maps link). Gated the same way the banner/3D
          model above are, since these are AR Layout elements too. */}
      {profile?.arEnabled && arComponents.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 8 }}>AR links</label>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            Fill any of these in and they show up as their own draggable block in HuntsAR World -- position
            them from the AR Layout page.
          </p>
          <div className="field-grid">
            {arComponents.map((c) => (
              <div className="field" key={c.key}>
                <label htmlFor={`ar-component-${c.key}`}>{c.label}</label>
                <input
                  id={`ar-component-${c.key}`}
                  type="url"
                  placeholder="https://…"
                  value={form.customAttributes?.[c.key] || ''}
                  onChange={(e) => updateCustomAttribute(c.key, e.target.value)}
                />
              </div>
            ))}
          </div>
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
              <Zoom>
                <img src={displayPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </Zoom>
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

        {/* Private, for our records only -- never sent to the public
            profile route, never rendered on the public card. Kept
            visually separate from the identity/tab fields above/below,
            which are all things a stranger tapping the card sees. */}
        <div className="field-grid" style={{ marginBottom: 20 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <p className="hint" style={{ margin: '0 0 10px', fontWeight: 600 }}>
              Private details (for our records only — never shown on your public card)
            </p>
          </div>
          <div className="field">
            <label htmlFor="gender">Gender</label>
            <select id="gender" value={form.gender || ''} onChange={(e) => updateField('gender', e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              type="date"
              value={(form.dateOfBirth || '').slice(0, 10)}
              onChange={(e) => updateField('dateOfBirth', e.target.value)}
            />
          </div>
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
