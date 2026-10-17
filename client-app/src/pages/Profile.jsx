import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { api } from '../api.js';
import Magic3DPreview from '../components/Magic3DPreview.jsx';
import ThemedSelect from '../components/ThemedSelect.jsx';
import ThemeDatePicker from '../components/ThemeDatePicker.jsx';
import GeoSelect from '../components/GeoSelect.jsx';

const MAX_HIGHLIGHTS = 8;
const MAX_HEADLINE_CHARACTERS = 120;
const MAX_BIO_CHARACTERS = 300;
const EMAIL_OTP_COOLDOWN_SECONDS = 45;
const ADDRESS_FIELDS = [
  'addressMode',
  'addressLine1',
  'addressLine2',
  'addressCountry',
  'addressCountryCode',
  'addressState',
  'addressStateCode',
  'addressCity',
  'addressPincode',
  'googleMapsUrl',
];

function todayDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// Name/job title stay above the tabs, same as the photo/banner -- they're
// identity, not something that belongs to one of the five card tabs.
const IDENTITY_FIELDS = [
  { key: 'fullName', label: 'Full name', type: 'text', required: true },
  { key: 'jobTitle', label: 'Company name', type: 'text' },
  { key: 'designation', label: 'Occupation (optional)', type: 'text' },
  {
    key: 'headline',
    label: 'Profile headline (optional)',
    type: 'text',
    maxLength: MAX_HEADLINE_CHARACTERS,
    placeholder: 'e.g. Helping businesses turn ideas into useful products',
  },
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
  { key: 'address', label: 'Address' },
];

// Admin's `fieldType` values map straight onto <input type="..."> except
// 'phone', which HTML spells 'tel'.
const INPUT_TYPE = { text: 'text', phone: 'tel', url: 'url', email: 'email' };

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [highlightInput, setHighlightInput] = useState('');
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
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const [emailVerificationError, setEmailVerificationError] = useState('');
  const [emailVerificationMessage, setEmailVerificationMessage] = useState('');
  const [addressCountries, setAddressCountries] = useState([]);
  const [addressStates, setAddressStates] = useState([]);
  const [addressCities, setAddressCities] = useState([]);
  const [pincodeLookupStatus, setPincodeLookupStatus] = useState('');
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

  useEffect(() => {
    api.getCountries().then(setAddressCountries).catch(() => {});
  }, []);

  useEffect(() => {
    const countryCode = form.addressCountryCode;
    if (!countryCode) {
      setAddressStates([]);
      return undefined;
    }
    let cancelled = false;
    api
      .getStates(countryCode)
      .then((items) => {
        if (cancelled) return;
        setAddressStates(items);
        setForm((current) => {
          if (current.addressCountryCode !== countryCode || current.addressStateCode || !current.addressState) return current;
          const match = items.find((item) => item.name.toLowerCase() === current.addressState.toLowerCase());
          return match ? { ...current, addressStateCode: match.isoCode } : current;
        });
      })
      .catch(() => !cancelled && setAddressStates([]));
    return () => {
      cancelled = true;
    };
  }, [form.addressCountryCode]);

  useEffect(() => {
    const countryCode = form.addressCountryCode;
    const stateCode = form.addressStateCode;
    if (!countryCode || !stateCode) {
      setAddressCities([]);
      return undefined;
    }
    let cancelled = false;
    api
      .getCities(countryCode, stateCode)
      .then((items) => !cancelled && setAddressCities(items))
      .catch(() => !cancelled && setAddressCities([]));
    return () => {
      cancelled = true;
    };
  }, [form.addressCountryCode, form.addressStateCode]);

  useEffect(() => {
    if (emailOtpCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setEmailOtpCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [emailOtpCooldown]);

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
        const legacyAddress = data.customAttributes?.address || '';
        const legacyIsMapUrl = /^https?:\/\//i.test(legacyAddress);
        const hasStructuredAddress = Boolean(data.addressLine1 || data.addressLine2 || data.addressCity || data.addressState || data.addressPincode || data.googleMapsUrl);
        setForm({
          ...data,
          addressMode: hasStructuredAddress ? data.addressMode || (data.googleMapsUrl ? 'google' : 'manual') : legacyIsMapUrl ? 'google' : 'manual',
          addressCountry: data.addressCountry || 'India',
          addressCountryCode: data.addressCountryCode || 'IN',
          addressLine1: data.addressLine1 || (!legacyIsMapUrl ? legacyAddress : ''),
          googleMapsUrl: data.googleMapsUrl || (legacyIsMapUrl ? legacyAddress : ''),
        });
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

  function handleAddressCountryChange(option) {
    setForm((current) => ({
      ...current,
      addressCountryCode: option.value,
      addressCountry: option.label,
      addressStateCode: '',
      addressState: '',
      addressCity: '',
      addressPincode: '',
    }));
    setAddressCities([]);
    setPincodeLookupStatus('');
    setSaved(false);
  }

  function handleAddressStateChange(option) {
    setForm((current) => ({
      ...current,
      addressStateCode: option.value,
      addressState: option.label,
      addressCity: '',
    }));
    setAddressCities([]);
    setSaved(false);
  }

  function handleAddressCityChange(option) {
    updateField('addressCity', option.value);
  }

  async function handleAddressPincodeChange(raw) {
    const pincode = raw.replace(/\D/g, '').slice(0, 6);
    updateField('addressPincode', pincode);
    setPincodeLookupStatus('');
    if (pincode.length !== 6 || (form.addressCountryCode || 'IN') !== 'IN') return;

    setPincodeLookupStatus('Looking up PIN code…');
    try {
      const location = await api.lookupPincode(pincode);
      const indiaStates = addressStates.length ? addressStates : await api.getStates('IN');
      setAddressStates(indiaStates);
      const matchingState = indiaStates.find(
        (item) => item.name.toLowerCase().replace(/\s+/g, '') === location.state.toLowerCase().replace(/\s+/g, ''),
      );
      const cityNames = matchingState ? await api.getCities('IN', matchingState.isoCode) : [];
      setAddressCities(cityNames);
      setForm((current) =>
        current.addressPincode === pincode
          ? {
              ...current,
              addressCountry: location.country || 'India',
              addressCountryCode: 'IN',
              addressState: location.state || current.addressState,
              addressStateCode: matchingState?.isoCode || current.addressStateCode,
              addressCity: location.city || current.addressCity,
            }
          : current,
      );
      setPincodeLookupStatus('✓ State and city loaded from PIN code.');
    } catch (err) {
      setPincodeLookupStatus(err.message);
    }
  }

  function handlePublicEmailChange(value) {
    updateField('publicEmail', value.toLowerCase());
    setEmailOtp('');
    setEmailOtpSent(false);
    setEmailOtpCooldown(0);
    setEmailVerificationError('');
    setEmailVerificationMessage('');
  }

  async function handleRequestPublicEmailOtp() {
    const email = (form.publicEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailVerificationError('Enter a valid email address.');
      return;
    }
    setEmailVerificationError('');
    setEmailVerificationMessage('');
    setEmailOtpSending(true);
    try {
      const result = await api.requestPublicEmailOtp(email);
      if (result.verified) {
        setProfile((current) => ({ ...current, publicEmail: email, publicEmailVerified: true }));
        setEmailVerificationMessage('Email already verified.');
        return;
      }
      setEmailOtpSent(true);
      setEmailOtp('');
      setEmailOtpCooldown(EMAIL_OTP_COOLDOWN_SECONDS);
      setEmailVerificationMessage(`Verification code sent to ${email}.`);
    } catch (err) {
      setEmailVerificationError(err.message);
    } finally {
      setEmailOtpSending(false);
    }
  }

  async function handleVerifyPublicEmailOtp() {
    const email = (form.publicEmail || '').trim().toLowerCase();
    if (!/^\d{6}$/.test(emailOtp)) {
      setEmailVerificationError('Enter the 6-digit verification code.');
      return;
    }
    setEmailVerificationError('');
    setEmailOtpVerifying(true);
    try {
      const updated = await api.verifyPublicEmailOtp(email, emailOtp);
      setProfile(updated);
      setForm((current) => ({ ...current, publicEmail: updated.publicEmail || email }));
      setEmailOtpSent(false);
      setEmailOtp('');
      setEmailOtpCooldown(0);
      setEmailVerificationMessage('Email verified successfully.');
    } catch (err) {
      setEmailVerificationError(err.message);
    } finally {
      setEmailOtpVerifying(false);
    }
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
      const updates = { bio: form.bio || '', highlights: form.highlights || [] };
      for (const { key } of IDENTITY_FIELDS) updates[key] = form[key] || '';
      for (const fields of Object.values(SECTION_FIELDS)) {
        for (const { key } of fields) {
          if (key !== 'publicEmail') updates[key] = form[key] || '';
        }
      }
      for (const key of ADDRESS_FIELDS) {
        updates[key] = form[key] || (key === 'addressCountry' ? 'India' : key === 'addressCountryCode' ? 'IN' : '');
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
  const publicEmailIsVerified = Boolean(
    profile?.publicEmailVerified &&
      (form.publicEmail || '').trim().toLowerCase() === (profile.publicEmail || '').trim().toLowerCase(),
  );
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
            {profile?.cardType ? ` (${profile.planName || profile.cardType})` : ''}.
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
          {IDENTITY_FIELDS.map(({ key, label, type, required, maxLength, placeholder }) => (
            <div className="field" key={key}>
              <div className="bio-field-heading">
                <label htmlFor={key}>{label}</label>
                {maxLength && (
                  <span className={`bio-character-count${(form[key] || '').length >= maxLength ? ' at-limit' : ''}`}>
                    {(form[key] || '').length} / {maxLength}
                  </span>
                )}
              </div>
              <input
                id={key}
                type={type}
                value={form[key] || ''}
                onChange={(e) => updateField(key, e.target.value)}
                required={required}
                maxLength={maxLength}
                placeholder={placeholder}
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
            <ThemedSelect
              id="gender"
              value={form.gender || ''}
              onChange={(nextValue) => updateField('gender', nextValue)}
              ariaLabel="Gender"
              options={[
                { value: '', label: 'Prefer not to say' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <ThemeDatePicker
              id="dateOfBirth"
              value={(form.dateOfBirth || '').slice(0, 10)}
              onChange={(value) => updateField('dateOfBirth', value)}
              max={todayDateValue()}
              ariaLabel="Date of birth"
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
            <div className="bio-field-heading">
              <label htmlFor="bio">About (short bio)</label>
              <span
                id="bioCharacterCount"
                className={`bio-character-count${(form.bio || '').length >= MAX_BIO_CHARACTERS ? ' at-limit' : ''}`}
              >
                {(form.bio || '').length} / {MAX_BIO_CHARACTERS}
              </span>
            </div>
            <textarea
              id="bio"
              rows={3}
              maxLength={MAX_BIO_CHARACTERS}
              aria-describedby="bioCharacterCount"
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

        {activeTab === 'bio' && (
          <div className="field">
            <label htmlFor="highlightInput">Expertise &amp; highlights</label>
            <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
              Shown as #tags under your bio on your public card. Press Enter to add one, up to {MAX_HIGHLIGHTS}.
            </p>
            <div className="highlight-tag-editor">
              {(form.highlights || []).map((tag, i) => (
                <span key={`${tag}-${i}`} className="highlight-tag-chip">
                  #{tag}
                  <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() => updateField('highlights', (form.highlights || []).filter((_, idx) => idx !== i))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                id="highlightInput"
                type="text"
                className="highlight-tag-input"
                placeholder={(form.highlights || []).length >= MAX_HIGHLIGHTS ? `Max ${MAX_HIGHLIGHTS} reached` : 'Add a highlight…'}
                disabled={(form.highlights || []).length >= MAX_HIGHLIGHTS}
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const clean = highlightInput.trim().replace(/^#/, '');
                    const existing = form.highlights || [];
                    if (clean && existing.length < MAX_HIGHLIGHTS && !existing.some((t) => t.toLowerCase() === clean.toLowerCase())) {
                      updateField('highlights', [...existing, clean]);
                    }
                    setHighlightInput('');
                  } else if (e.key === 'Backspace' && !highlightInput && (form.highlights || []).length) {
                    updateField('highlights', (form.highlights || []).slice(0, -1));
                  }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'address' && (
          <div className="profile-address-editor">
            <div className="profile-address-mode" role="group" aria-label="Address entry method">
              <button
                type="button"
                className={form.addressMode === 'google' ? 'secondary' : undefined}
                onClick={() => updateField('addressMode', 'manual')}
              >
                Enter address
              </button>
              <button
                type="button"
                className={form.addressMode === 'google' ? undefined : 'secondary'}
                onClick={() => updateField('addressMode', 'google')}
              >
                Google Maps link
              </button>
            </div>

            {(form.addressMode || 'manual') === 'manual' ? (
              <div className="field-grid">
                <div className="field profile-address-wide">
                  <label htmlFor="addressLine1">Address line 1</label>
                  <input id="addressLine1" type="text" value={form.addressLine1 || ''} onChange={(e) => updateField('addressLine1', e.target.value)} placeholder="House/building number and street" />
                </div>
                <div className="field profile-address-wide">
                  <label htmlFor="addressLine2">Address line 2 (optional)</label>
                  <input id="addressLine2" type="text" value={form.addressLine2 || ''} onChange={(e) => updateField('addressLine2', e.target.value)} placeholder="Area, landmark, floor, etc." />
                </div>
                <div className="field">
                  <label>Country</label>
                  <GeoSelect
                    value={form.addressCountryCode || 'IN'}
                    options={addressCountries.map((country) => ({ value: country.isoCode, label: country.name }))}
                    onChange={handleAddressCountryChange}
                    placeholder="Select country"
                    searchPlaceholder="Search countries…"
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <GeoSelect
                    value={form.addressStateCode || ''}
                    options={addressStates.map((state) => ({ value: state.isoCode, label: state.name }))}
                    onChange={handleAddressStateChange}
                    placeholder="Select state"
                    searchPlaceholder="Search states…"
                    disabled={!form.addressCountryCode}
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <GeoSelect
                    value={form.addressCity || ''}
                    options={addressCities.map((city) => ({ value: city, label: city }))}
                    onChange={handleAddressCityChange}
                    placeholder="Select city"
                    searchPlaceholder="Search cities…"
                    disabled={!form.addressStateCode}
                  />
                </div>
                <div className="field">
                  <label htmlFor="addressPincode">PIN code</label>
                  <input
                    id="addressPincode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={form.addressPincode || ''}
                    onChange={(e) => handleAddressPincodeChange(e.target.value)}
                    placeholder="6-digit PIN code"
                  />
                  {pincodeLookupStatus && (
                    <p className={`hint profile-pincode-status${pincodeLookupStatus.startsWith('✓') ? ' success' : ''}`}>
                      {pincodeLookupStatus}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="googleMapsUrl">Google Maps location link</label>
                <input id="googleMapsUrl" type="url" value={form.googleMapsUrl || ''} onChange={(e) => updateField('googleMapsUrl', e.target.value)} placeholder="https://maps.google.com/..." />
                <p className="hint" style={{ margin: '8px 0 0' }}>Paste the Share link from Google Maps.</p>
              </div>
            )}
          </div>
        )}

        {activeTab !== 'bio' && activeTab !== 'address' && (
          <div className="field-grid">
            {(SECTION_FIELDS[activeTab] || []).map(({ key, label, type }) =>
              key === 'publicEmail' ? (
                <div className="field public-email-verification" key={key}>
                  <div className="public-email-label">
                    <label htmlFor={key}>{label}</label>
                    <span className={publicEmailIsVerified ? 'is-verified' : 'is-unverified'}>
                      {publicEmailIsVerified ? '✓ Verified' : 'Unverified'}
                    </span>
                  </div>
                  <div className="public-email-input-row">
                    <input
                      id={key}
                      type={type}
                      value={form[key] || ''}
                      onChange={(e) => handlePublicEmailChange(e.target.value)}
                      placeholder="name@example.com"
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={handleRequestPublicEmailOtp}
                      disabled={publicEmailIsVerified || emailOtpSending || emailOtpCooldown > 0}
                    >
                      {publicEmailIsVerified
                        ? 'Verified'
                        : emailOtpSending
                        ? 'Sending…'
                        : emailOtpCooldown > 0
                        ? `Resend in ${emailOtpCooldown}s`
                        : emailOtpSent
                        ? 'Resend OTP'
                        : 'Send OTP'}
                    </button>
                  </div>
                  {emailOtpSent && !publicEmailIsVerified && (
                    <div className="public-email-otp-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        aria-label="Email verification code"
                        placeholder="6-digit OTP"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPublicEmailOtp}
                        disabled={emailOtpVerifying || emailOtp.length !== 6}
                      >
                        {emailOtpVerifying ? 'Verifying…' : 'Verify email'}
                      </button>
                    </div>
                  )}
                  {emailVerificationMessage && <p className="hint public-email-success">{emailVerificationMessage}</p>}
                  {emailVerificationError && <p className="hint public-email-error">{emailVerificationError}</p>}
                </div>
              ) : (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input id={key} type={type} value={form[key] || ''} onChange={(e) => updateField(key, e.target.value)} />
                </div>
              ),
            )}
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
          {saving ? 'Saving…' : saved && !error ? '✓ Saved' : 'Save changes'}
        </button>
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
