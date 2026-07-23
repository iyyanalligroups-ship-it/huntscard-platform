import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const FIELD_DEFS = [
  { key: 'fullName', label: 'Full name', type: 'text' },
  { key: 'jobTitle', label: 'Job title', type: 'text' },
  { key: 'phone', label: 'Phone number', type: 'tel' },
  { key: 'whatsapp', label: 'WhatsApp number', type: 'tel' },
  { key: 'publicEmail', label: 'Public email', type: 'email' },
  { key: 'instagramUrl', label: 'Instagram link', type: 'url' },
  { key: 'twitterUrl', label: 'Twitter / X link', type: 'url' },
  { key: 'portfolioUrl', label: 'Portfolio link', type: 'url' },
  { key: 'huntsworldUrl', label: 'Huntsworld profile link', type: 'url' },
];

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
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const arVideoInputRef = useRef(null);

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

  async function handleSaveDetails(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      const updates = {};
      for (const { key } of FIELD_DEFS) updates[key] = form[key] || '';
      updates.bio = form.bio || '';
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
        <div className="field-grid">
          {FIELD_DEFS.map(({ key, label, type }) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                type={type}
                value={form[key] || ''}
                onChange={(e) => updateField(key, e.target.value)}
                required={key === 'fullName'}
              />
            </div>
          ))}
        </div>
        <button type="submit" disabled={saving} style={{ marginTop: 8 }}>
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
