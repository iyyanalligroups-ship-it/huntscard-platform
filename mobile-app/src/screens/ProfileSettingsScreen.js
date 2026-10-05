import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl } from '../api/client.js';
import { Glyph } from '../components/Glyph.js';
import DateTimeField from '../components/DateTimeField.js';
import MediaUploader, { pickMedia } from '../components/MediaUploader.js';
import { Avatar, Button, Card, Field, Loading, Message, Screen, SelectField, Tabs, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const MAX_HIGHLIGHTS = 8;

const IDENTITY_FIELDS = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'designation', label: 'Designation (optional)' },
];
const SECTION_FIELDS = {
  contact: [{ key: 'phone', label: 'Phone number', type: 'phone' }, { key: 'whatsapp', label: 'WhatsApp number', type: 'phone' }, { key: 'publicEmail', label: 'Public email', type: 'email' }],
  portfolio: [{ key: 'portfolioUrl', label: 'Portfolio link', type: 'url' }],
  social: [{ key: 'instagramUrl', label: 'Instagram link', type: 'url' }, { key: 'twitterUrl', label: 'Twitter / X link', type: 'url' }],
  huntsworld: [{ key: 'huntsworldUrl', label: 'Huntsworld profile link', type: 'url' }],
};
const BASE_TABS = [{ key: 'bio', label: 'My Bio' }, { key: 'contact', label: 'Contact' }, { key: 'portfolio', label: 'Portfolio' }, { key: 'social', label: 'Social' }, { key: 'huntsworld', label: 'Huntsworld' }];

const keyboardFor = (type) => (type === 'phone' ? 'phone-pad' : type === 'email' ? 'email-address' : type === 'url' ? 'url' : 'default');

export default function ProfileSettingsScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [attributes, setAttributes] = useState([]);
  const [highlightInput, setHighlightInput] = useState('');
  const [activeTab, setActiveTab] = useState('bio');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, attrs] = await Promise.all([api.getProfile(), api.getAttributeDefinitions().catch(() => [])]);
      setProfile(data); setForm((current) => (Object.keys(current).length ? current : data)); setAttributes(attrs);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tabs = useMemo(() => {
    const baseKeys = new Set(BASE_TABS.map((t) => t.key));
    const custom = new Map();
    for (const attr of attributes) if (!baseKeys.has(attr.section) && !custom.has(attr.section)) custom.set(attr.section, { key: attr.section, label: attr.sectionLabel || attr.section });
    return [...BASE_TABS, ...custom.values()];
  }, [attributes]);
  const arComponents = useMemo(() => attributes.filter((a) => a.arComponent), [attributes]);

  const update = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setSaved(false); };
  const updateCustom = (key) => (value) => { setForm((f) => ({ ...f, customAttributes: { ...(f.customAttributes || {}), [key]: value } })); setSaved(false); };

  function addHighlight() {
    const clean = highlightInput.trim().replace(/^#/, '');
    const existing = form.highlights || [];
    if (clean && existing.length < MAX_HIGHLIGHTS && !existing.some((t) => t.toLowerCase() === clean.toLowerCase())) update('highlights')([...existing, clean]);
    setHighlightInput('');
  }

  async function changePhoto() {
    setError('');
    try {
      const asset = await pickMedia({ kind: 'image', editing: true, aspect: [1, 1], quality: 0.85 });
      if (!asset) return;
      setPhotoBusy(true);
      setProfile(await api.uploadPhoto(asset));
    } catch (err) { setError(err.message); } finally { setPhotoBusy(false); }
  }

  async function save() {
    setError(''); setSaving(true); setSaved(false);
    try {
      const updates = { bio: form.bio || '', highlights: form.highlights || [], gender: form.gender || '', dateOfBirth: form.dateOfBirth || '', customAttributes: form.customAttributes || {} };
      for (const { key } of IDENTITY_FIELDS) updates[key] = form[key] || '';
      for (const fields of Object.values(SECTION_FIELDS)) for (const { key } of fields) updates[key] = form[key] || '';
      setProfile(await api.updateProfile(updates)); setSaved(true);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  if (loading) return <Screen><Loading label="Loading profile…" /></Screen>;
  if (!profile) return <Screen><Message>{error}</Message></Screen>;

  const dob = form.dateOfBirth ? new Date(String(form.dateOfBirth).slice(0, 10) + 'T00:00:00') : null;
  const arBannerUrl = profile.arBannerUrl || profile.arVideoUrl;
  const arBannerType = profile.arBannerUrl ? profile.arBannerType : profile.arVideoUrl ? 'video' : null;

  return <Screen>
    <Title subtitle="Everything here — photo, identity, and contact details — is what's shown when someone taps or scans your card. Changes go live immediately after saving.">Profile Settings</Title>
    <Message>{error}</Message>
    {saved && !error ? <Message tone="success">Saved — your card reflects this the next time someone taps it.</Message> : null}

    <MediaUploader title="Banner (shown behind your photo on the card)" uri={profile.bannerUrl} chooseLabel="Choose banner" changeLabel="Change banner" hint="JPEG, PNG, or WEBP. Max 5MB. Wide images work best (about 3:1). Uploads immediately." editing aspect={[3, 1]}
      onPicked={async (asset) => setProfile(await api.uploadBanner(asset))} onRemove={async () => setProfile(await api.removeBanner())} />

    <MediaUploader title="Logo (optional, for printing on your card)" uri={profile.logoUrl} chooseLabel="Choose logo" changeLabel="Change logo" contain hint="JPEG, PNG, or WEBP. Max 5MB. We'll print this on your physical card as uploaded."
      onPicked={async (asset) => setProfile(await api.uploadLogo(asset))} onRemove={async () => setProfile(await api.removeLogo())} />

    <MediaUploader title="HuntsAR World Banner (optional)" kind="media" type={arBannerType} uri={arBannerUrl} contain previewHeight={190} chooseLabel="Choose video or image" changeLabel="Change banner"
      description="Upload either a video (filmed against a plain green or blue background, plays as a floating hologram figure of you) or a still image -- whichever you have. Shown when someone scans your card in the HuntsAR World app. Without one, they'll just see your photo and name instead."
      hint="MP4/MOV video (max 80MB, green/blue screen required for the floating effect) or JPEG/PNG/WEBP image. Uploads immediately."
      onPicked={async (asset) => setProfile(await api.uploadArBanner(asset))} onRemove={async () => setProfile(await api.removeArBanner())} />

    {!profile.arEnabled ? <Card style={{ gap: 10, alignItems: 'center' }}>
      <Text style={styles.text}>3D model isn't included in your current plan{profile.cardType ? ` (${profile.cardType})` : ''}.</Text>
      <Text style={styles.hint}>Upgrade to a plan with AR to add a real 3D model to your HuntsAR World panel.</Text>
      <Button compact title="See plans with AR" onPress={() => navigation.navigate('Shop')} />
    </Card> : <MediaUploader title="3D model (optional)" kind="model" uri={profile.arModelUrl} type={profile.arModelType === 'image' ? 'image' : 'model'} contain previewHeight={160} chooseLabel="Choose model or image" changeLabel="Change model"
      description="Upload either a real 3D model (.glb or .fbx, shown as an actual 3D object) or a flat cutout image (PNG/JPEG/WEBP -- a transparent PNG works well, shown as a real 3D card in HuntsAR World, same as the banner). Without one, your video or photo panel is used instead."
      hint=".glb, .fbx, JPEG, PNG, or WEBP. Max 50MB. Uploads immediately."
      extraPreview={profile.arModelUrl && profile.arModelType !== 'image' ? <View style={styles.modelBox}><Glyph name="box" size={30} color={colors.holoCyan} /><Text style={styles.text}>3D model uploaded</Text><Text style={styles.hint}>Preview it in your AR Layout.</Text></View> : undefined}
      onPicked={async (asset) => setProfile(await api.uploadArModel(asset))} onRemove={async () => setProfile(await api.removeArModel())} />}

    {profile.arEnabled && arComponents.length ? <Card style={{ gap: 12 }}>
      <Text style={styles.cardTitle}>AR links</Text>
      <Text style={styles.hint}>Fill any of these in and they show up as their own draggable block in HuntsAR World -- position them from the AR Layout page.</Text>
      {arComponents.map((c) => <Field key={c.key} label={c.label} placeholder="https://…" autoCapitalize="none" keyboardType="url" value={form.customAttributes?.[c.key] || ''} onChangeText={updateCustom(c.key)} />)}
    </Card> : null}

    <Card style={styles.photoRow}>
      <Avatar uri={resolveAssetUrl(profile.photoUrl)} name={profile.fullName} size={84} style={{ opacity: photoBusy ? 0.5 : 1 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Button compact kind="secondary" icon="camera" title={photoBusy ? 'Uploading…' : 'Choose photo'} disabled={photoBusy} onPress={changePhoto} style={{ alignSelf: 'flex-start' }} />
        <Text style={styles.hint}>JPEG, PNG, or WEBP. Max 5MB. Uploads immediately.</Text>
      </View>
    </Card>

    <Card style={{ gap: 14 }}>
      {IDENTITY_FIELDS.map(({ key, label }) => <Field key={key} label={label} value={form[key] || ''} onChangeText={update(key)} />)}

      <Text style={styles.private}>Private details (for our records only — never shown on your public card)</Text>
      <SelectField label="Gender" value={form.gender || ''} onChange={update('gender')} options={[{ value: '', label: 'Prefer not to say' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
      <DateTimeField label="Date of birth" value={dob} maximumDate={new Date()} placeholder="Select date" clearable onChange={(date) => update('dateOfBirth')(date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '')} />

      <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
      {activeTab === 'bio' ? <>
        <Field label="About (short bio)" multiline maxLength={280} value={form.bio || ''} onChangeText={update('bio')} hint={`${(form.bio || '').length}/280`} />
        <View style={{ gap: 8 }}>
          <Text style={styles.cardTitle}>Expertise & highlights</Text>
          <Text style={styles.hint}>Shown as #tags under your bio on your public card. Add up to {MAX_HIGHLIGHTS}.</Text>
          <View style={styles.tags}>
            {(form.highlights || []).map((tag, i) => <Pressable key={`${tag}-${i}`} style={styles.tag} onPress={() => update('highlights')((form.highlights || []).filter((_, idx) => idx !== i))}>
              <Text style={styles.tagText}>#{tag}</Text><Glyph name="close" size={12} color={colors.holoCyan} />
            </Pressable>)}
          </View>
          <Field placeholder={(form.highlights || []).length >= MAX_HIGHLIGHTS ? `Max ${MAX_HIGHLIGHTS} reached` : 'Add a highlight…'} editable={(form.highlights || []).length < MAX_HIGHLIGHTS} value={highlightInput} onChangeText={setHighlightInput} onSubmitEditing={addHighlight} returnKeyType="done" right={<Pressable hitSlop={8} onPress={addHighlight}><Glyph name="plus" size={18} color={colors.holoCyan} /></Pressable>} />
        </View>
      </> : <>
        {(SECTION_FIELDS[activeTab] || []).map(({ key, label, type }) => <Field key={key} label={label} value={form[key] || ''} onChangeText={update(key)} keyboardType={keyboardFor(type)} autoCapitalize="none" />)}
        {attributes.filter((attr) => attr.section === activeTab).map((attr) => <Field key={attr.key} label={attr.label} value={form.customAttributes?.[attr.key] || ''} onChangeText={updateCustom(attr.key)} keyboardType={keyboardFor(attr.fieldType === 'text' ? 'text' : attr.fieldType)} autoCapitalize={attr.fieldType === 'text' ? 'sentences' : 'none'} />)}
      </>}

      <Button title={saving ? 'Saving…' : 'Save changes'} disabled={saving || !form.fullName?.trim()} onPress={save} />
      {saved && !error ? <Text style={[styles.hint, { color: colors.holoCyan }]}>✓ Saved — your card reflects this the next time someone taps it.</Text> : null}
      {error ? <Text style={[styles.hint, { color: colors.danger }]}>Couldn't save: {error}</Text> : null}
    </Card>
    {profile.clientId ? <Text style={styles.hint}>Your public card page: /c/{profile.clientId}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 14 }, hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 }, private: { color: colors.textDim, fontWeight: '700', fontSize: 12, marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(21,101,255,0.12)' }, tagText: { color: colors.holoCyan, fontWeight: '700', fontSize: 12 },
  modelBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
