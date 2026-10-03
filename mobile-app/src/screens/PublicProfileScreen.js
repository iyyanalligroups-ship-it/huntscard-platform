import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import { api, publicUrl, resolveAssetUrl, WEB_URL } from '../api/client.js';
import { Glyph } from '../components/Glyph.js';
import { Avatar, Button, Card, Field, Message, Sheet, Tabs } from '../components/ui.js';
import { downloadAndShare } from '../lib/files.js';
import { initialsOf, onlyDigits, splitName } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const ACCENTS = [{ id: 'teal', label: 'HuntsTAG Teal', color: '#0d9394' }, { id: 'violet', label: 'Royal Violet', color: '#7367f0' }, { id: 'amber', label: 'Warm Amber', color: '#e58a16' }];
const BUILTIN = new Set(['contact', 'portfolio', 'social', 'huntsworld']);
const DEFAULT_TAGS = ['NFC Smart Card', 'HuntsTAG Hologram', 'Instant Tap', 'Digital Bio', 'Verified Contact'];
const DEV_TAGS = ['JavaScript', 'React', 'Node.js', 'TypeScript', 'APIs & Cloud', 'Clean Architecture'];

function RaiseTicketForm({ clientId, cardNumber }) {
  const [form, setForm] = useState({ name: '', contactNumber: '', issue: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (!form.name.trim() || !form.contactNumber.trim() || !form.issue.trim()) return setError('Name, contact number, and the reason/issue are required.');
    setSubmitting(true); setError('');
    try { await api.submitCardTicket(clientId, form, cardNumber); setSubmitted(true); }
    catch (err) { setError(err.message || 'Could not submit your ticket'); } finally { setSubmitting(false); }
  }

  if (submitted) return <View style={styles.state}><Text style={styles.stateText}>Ticket submitted — our support team will review your issue and contact you within 24–48 hours.</Text></View>;
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
    <Text style={styles.ticketTitle}>This card has been temporarily deactivated</Text>
    <Text style={styles.ticketSub}>Raise a ticket below and our support team will get back to you.</Text>
    <Message>{error}</Message>
    <Field label="Name" value={form.name} onChangeText={set('name')} />
    <Field label="Contact number" keyboardType="phone-pad" value={form.contactNumber} onChangeText={set('contactNumber')} />
    <Field label="Reason / Issue" multiline value={form.issue} onChangeText={set('issue')} />
    <Field label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set('email')} />
    <Button title={submitting ? 'Submitting…' : 'Submit ticket'} disabled={submitting} onPress={submit} />
  </ScrollView>;
}

function Tile({ icon, tint, type, value, copyLabel, href, onCopy, copied }) {
  return <View style={styles.tile}>
    <View style={[styles.tileBadge, { backgroundColor: `${tint}26` }]}><Glyph name={icon} size={17} color={tint} /></View>
    <View style={{ flex: 1 }}><Text style={styles.tileType}>{type}</Text><Text style={styles.tileVal} numberOfLines={2}>{value}</Text></View>
    {onCopy ? <Pressable hitSlop={8} onPress={() => onCopy(value, copyLabel)} style={styles.tileAct}><Glyph name={copied ? 'check' : 'copy'} size={15} color={copied ? colors.holoCyan : colors.textDim} /></Pressable> : null}
    {href ? <Pressable hitSlop={8} onPress={() => Linking.openURL(href)} style={styles.tileAct}><Glyph name="arrowUpRight" size={15} /></Pressable> : null}
  </View>;
}

export default function PublicProfileScreen({ navigation, route }) {
  const { clientId, cardNumber } = route.params || {};
  const [profile, setProfile] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [tab, setTab] = useState('bio');
  const [accent, setAccent] = useState('teal');
  const [themeOpen, setThemeOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [lead, setLead] = useState({ name: '', phone: '', email: '', org: '' });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [toast, setToast] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  const accentColor = ACCENTS.find((a) => a.id === accent)?.color || '#0d9394';

  useEffect(() => {
    if (!clientId) { setError('No card specified.'); setLoading(false); return; }
    setLoading(true); setBannerFailed(false);
    api.getPublicProfile(clientId, cardNumber).then(setProfile).catch((err) => setError(err.message)).finally(() => setLoading(false));
    api.getAttributeDefinitions().then(setAttributes).catch(() => {});
  }, [clientId, cardNumber]);

  const flash = useCallback((message, duration = 2200) => { setToast(message); setTimeout(() => setToast(''), duration); }, []);

  const copy = useCallback(async (text, label) => {
    await Clipboard.setStringAsync(text); setCopiedKey(label); flash(`${label} copied to clipboard`); setTimeout(() => setCopiedKey(null), 1800);
  }, [flash]);

  const customRowsFor = useCallback((section) => attributes.filter((a) => a.section === section).map((a) => {
    const value = profile?.customAttributes?.[a.key];
    if (!value) return null;
    const href = a.fieldType === 'phone' ? `tel:${value}` : a.fieldType === 'email' ? `mailto:${value}` : a.fieldType === 'url' ? value : undefined;
    return { key: a.key, label: a.label, value, href };
  }).filter(Boolean), [attributes, profile]);

  const tabs = useMemo(() => {
    if (!profile || profile.paused) return [];
    const list = [{ label: 'About', key: 'bio' }, { label: 'Contact', key: 'contact' }];
    if (profile.portfolioUrl) list.push({ label: 'Portfolio', key: 'portfolio' });
    if (profile.huntsworldUrl) list.push({ label: 'HuntsTAG', key: 'huntsworld' });
    for (const section of new Set(attributes.map((a) => a.section))) {
      if (BUILTIN.has(section) || !customRowsFor(section).length) continue;
      list.push({ label: attributes.find((a) => a.section === section)?.sectionLabel || section, key: section });
    }
    return list;
  }, [profile, attributes, customRowsFor]);

  const cardParam = cardNumber ? `?card=${cardNumber}` : '';
  const shareUrl = `${WEB_URL}/c/${clientId}${cardParam}`;

  // Save straight into the phone's address book; fall back to sharing the
  // vCard file when contacts access is declined (the web just downloads the .vcf).
  async function saveContact() {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.granted) {
        const { firstName, lastName } = splitName(profile.fullName);
        await Contacts.addContactAsync({
          contactType: Contacts.ContactTypes.Person, name: profile.fullName, firstName, lastName,
          jobTitle: profile.jobTitle || undefined, company: 'HuntsTAG',
          phoneNumbers: [profile.phone && { number: profile.phone, label: 'mobile' }, profile.whatsapp && { number: profile.whatsapp, label: 'whatsapp' }].filter(Boolean),
          emails: profile.publicEmail ? [{ email: profile.publicEmail, label: 'work' }] : [],
          urls: [profile.portfolioUrl && { url: profile.portfolioUrl, label: 'portfolio' }].filter(Boolean),
        });
        flash('Contact saved to your phone', 3000);
        return;
      }
      throw new Error('declined');
    } catch {
      try {
        await downloadAndShare({ url: publicUrl(`/api/public/vcard/${clientId}${cardParam}`), filename: `${profile.fullName || 'contact'}.vcf`, mimeType: 'text/vcard', dialogTitle: 'Save contact' });
        flash('Contact card ready — open it to save to your phone', 3400);
      } catch { flash('Could not save contact'); }
    }
  }

  function openExchange() { saveContact(); setLeadError(''); setExchangeOpen(true); }

  async function submitLead() {
    if (!lead.name.trim() || !lead.phone.trim()) return setLeadError('Name and phone number are required');
    setLeadSubmitting(true); setLeadError('');
    try {
      await api.submitLead(clientId, lead, cardNumber);
      setExchangeOpen(false); setLead({ name: '', phone: '', email: '', org: '' });
      flash(`Thanks! ${profile.fullName || 'They'}'ll be in touch.`, 2600);
    } catch (err) { setLeadError(err.message || 'Could not share your contact'); } finally { setLeadSubmitting(false); }
  }

  function share() { Share.share({ title: `${profile.fullName} — HuntsTAG`, message: `${profile.fullName} — HuntsTAG\n${shareUrl}`, url: shareUrl }).catch(() => {}); }

  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.holoCyan} /><Text style={styles.stateText}>Connecting to HuntsTAG NFC card…</Text></View>;
  if (profile?.paused) {
    if (profile.reason === 'deleted') return <View style={styles.state}><Text style={styles.stateText}>This card has been permanently deleted and can no longer be used.</Text></View>;
    if (profile.reason === 'deactivated') return <RaiseTicketForm clientId={clientId} cardNumber={cardNumber} />;
    return <View style={styles.state}><Text style={styles.stateText}>This card has been deactivated by its owner.</Text></View>;
  }
  if (error || !profile) return <View style={styles.state}><Text style={styles.stateText}>Card not found. Check the link and try again.</Text><Button kind="secondary" title="Go back" onPress={() => navigation.goBack()} /></View>;

  const currentKey = tabs.find((t) => t.key === tab)?.key || 'bio';
  const locationAttr = profile.customAttributes?.address || profile.customAttributes?.map || null;
  const isDeveloper = /developer|engineer|coder|tech|fullstack|frontend|backend/i.test(`${profile.jobTitle || ''} ${profile.bio || ''}`);
  const tags = profile.highlights?.length ? profile.highlights : isDeveloper ? DEV_TAGS : DEFAULT_TAGS;
  const wa = profile.whatsapp ? profile.whatsapp.replace(/\D/g, '') : '';
  const socials = [
    profile.portfolioUrl && { icon: 'globe', href: profile.portfolioUrl, color: accentColor },
    wa && { icon: 'chat', href: `https://wa.me/${wa}`, color: '#25D366' },
    profile.instagramUrl && { icon: 'camera', href: profile.instagramUrl, color: '#E1306C' },
    profile.twitterUrl && { icon: 'send', href: profile.twitterUrl, color: '#e5e7eb' },
    profile.publicEmail && { icon: 'mail', href: `mailto:${profile.publicEmail}`, color: '#f5a524' },
    profile.phone && { icon: 'phone', href: `tel:${profile.phone}`, color: '#22c58b' },
  ].filter(Boolean);

  return <View style={{ flex: 1, backgroundColor: '#070a12' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={[styles.frame, { borderColor: `${accentColor}55` }]}>
        <View style={styles.top}>
          <View style={styles.statusChip}><View style={[styles.pulse, { backgroundColor: accentColor }]} /><Text style={styles.statusText}>HuntsTAG</Text></View>
          <View style={styles.topActions}>
            {profile.arEnabled ? <Pressable style={[styles.arBtn, { borderColor: accentColor }]} onPress={() => navigation.navigate('AR Experience', { clientId, cardNumber })}><Glyph name="layers" size={14} color={accentColor} /><Text style={[styles.arText, { color: accentColor }]}>3D AR</Text></Pressable> : null}
            <Pressable style={styles.pillBtn} onPress={() => setThemeOpen(true)}><Glyph name="palette" size={16} /><View style={[styles.swatchDot, { backgroundColor: accentColor }]} /></Pressable>
            <Pressable style={styles.pillBtn} onPress={() => setQrOpen(true)}><Glyph name="qr" size={16} /></Pressable>
          </View>
        </View>

        <View style={styles.banner}>
          {profile.bannerUrl && !bannerFailed ? <Image source={{ uri: resolveAssetUrl(profile.bannerUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBannerFailed(true)} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#12163a' }]} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,10,18,0.35)' }]} />
        </View>

        <View style={styles.identity}>
          <View style={[styles.avatarRing, { borderColor: accentColor }]}>
            <Avatar uri={resolveAssetUrl(profile.photoUrl)} name={initialsOf(profile.fullName)} size={92} />
            <View style={[styles.verified, { backgroundColor: accentColor }]}><Glyph name="check" size={11} color="#fff" strokeWidth={3} /></View>
          </View>
          <Text style={styles.fullName}>{profile.fullName}</Text>
          <View style={styles.badges}>
            {profile.jobTitle ? <View style={styles.roleBadge}><Glyph name="user" size={12} color={accentColor} /><Text style={[styles.badgeText, { color: accentColor }]}>{profile.jobTitle}</Text></View> : null}
            <View style={styles.roleBadge}><Glyph name="building" size={12} color="#cbd5e1" /><Text style={styles.badgeText}>HuntsTAG</Text></View>
          </View>
          {profile.bio ? <Text style={styles.snippet} numberOfLines={3}>{profile.bio}</Text> : null}
        </View>

        {socials.length ? <View style={styles.strip}>{socials.map((s) => <Pressable key={s.icon} style={[styles.circle, { borderColor: `${s.color}66` }]} onPress={() => Linking.openURL(s.href)}><Glyph name={s.icon} size={18} color={s.color} /></Pressable>)}</View> : null}

        <View style={styles.primary}>
          <Pressable style={[styles.exchange, { backgroundColor: accentColor }]} onPress={openExchange}><Glyph name="exchange" size={18} color="#fff" /><Text style={styles.exchangeText}>Exchange Contact</Text></Pressable>
          <Pressable style={styles.secondaryAct} onPress={saveContact}><Glyph name="download" size={17} /><Text style={styles.secondaryText}>Save</Text></Pressable>
          <Pressable style={styles.shareAct} onPress={share}><Glyph name="share" size={18} /></Pressable>
        </View>

        <Tabs tabs={tabs} value={currentKey} onChange={setTab} style={{ marginHorizontal: 16 }} />

        <View style={styles.content}>
          {currentKey === 'bio' ? <>
            <View style={styles.bioCard}>
              <Text style={[styles.bioHead, { color: accentColor }]}>About & Vision</Text>
              <Text style={styles.bioText}>{profile.bio || 'Welcome to my digital profile!'}</Text>
              <Text style={styles.tagsTitle}>EXPERTISE & HIGHLIGHTS</Text>
              <View style={styles.tags}>{tags.map((tag, i) => <Text key={tag} style={[styles.tag, i % 2 === 0 ? { color: accentColor, borderColor: `${accentColor}66` } : { color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.15)' }]}>#{tag}</Text>)}</View>
            </View>
            <View style={styles.specs}>
              <View style={styles.spec}><Text style={styles.specLabel}>Business</Text><Text style={[styles.specVal, { color: accentColor }]}>HuntsTAG</Text></View>
              <View style={styles.spec}><Text style={styles.specLabel}>Card ID</Text><Text style={styles.specVal}>{profile.clientId}</Text></View>
              <View style={styles.spec}><Text style={styles.specLabel}>AR Hologram</Text><Text style={[styles.specVal, { color: profile.arEnabled ? accentColor : '#94a3b8' }]}>{profile.arEnabled ? 'Active' : 'Standard'}</Text></View>
            </View>
          </> : null}

          {currentKey === 'contact' ? <View style={{ gap: 10 }}>
            {profile.phone ? <Tile icon="phone" tint="#22c58b" type="Mobile Phone" value={profile.phone} copyLabel="Phone number" href={`tel:${profile.phone}`} onCopy={copy} copied={copiedKey === 'Phone number'} /> : null}
            {profile.publicEmail ? <Tile icon="mail" tint="#f5a524" type="Email Address" value={profile.publicEmail} copyLabel="Email" href={`mailto:${profile.publicEmail}`} onCopy={copy} copied={copiedKey === 'Email'} /> : null}
            {wa ? <Tile icon="chat" tint="#25D366" type="WhatsApp" value={`+${wa}`} href={`https://wa.me/${wa}`} /> : null}
            {locationAttr ? <Tile icon="pin" tint="#ef4444" type="Location & Map" value="Google Maps Location" href={locationAttr} /> : null}
            {customRowsFor('contact').map((row) => <Tile key={row.key} icon="globe" tint={accentColor} type={row.label} value={row.value} href={row.href} />)}
          </View> : null}

          {currentKey === 'portfolio' ? <View style={{ gap: 10 }}>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Official Portfolio & Projects</Text>
              <Text style={styles.heroUrl} numberOfLines={2}>{profile.portfolioUrl}</Text>
              <Button title="Visit Live Website" icon="arrowUpRight" onPress={() => Linking.openURL(profile.portfolioUrl)} />
            </View>
            {customRowsFor('portfolio').map((row) => <Tile key={row.key} icon="globe" tint={accentColor} type={row.label} value={row.value} href={row.href} />)}
          </View> : null}

          {currentKey === 'huntsworld' ? <View style={{ gap: 10 }}>
            {profile.huntsworldUrl ? <View style={styles.hero}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={[styles.emblem, { backgroundColor: accentColor }]}><Text style={styles.emblemText}>H</Text></View><View style={{ flex: 1 }}><Text style={styles.heroTitle}>HuntsTAG Business Profile</Text><Text style={styles.heroUrl}>Official Verified Enterprise Profile</Text></View></View>
              <Text style={styles.bioText}>Connect with HuntsTAG verified products, professional business services, and smart NFC tap networking solutions.</Text>
              <Button title="View on HuntsTAG →" onPress={() => Linking.openURL(profile.huntsworldUrl)} />
            </View> : null}
            {customRowsFor('huntsworld').map((row) => <Tile key={row.key} icon="globe" tint={accentColor} type={row.label} value={row.value} href={row.href} />)}
          </View> : null}

          {!['bio', 'contact', 'portfolio', 'huntsworld'].includes(currentKey) ? <View style={{ gap: 10 }}>{customRowsFor(currentKey).map((row) => <Tile key={row.key} icon="globe" tint={accentColor} type={row.label} value={row.value} href={row.href} />)}</View> : null}
        </View>
      </View>
      <Button kind="ghost" title="Open Magic Camera" icon="magic" onPress={() => navigation.navigate('Magic Camera', { clientId, cardNumber })} style={{ marginTop: 14 }} />
    </ScrollView>
    {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}

    <Sheet visible={themeOpen} onClose={() => setThemeOpen(false)} title="Theme color">
      <Text style={styles.ticketSub}>Choose your dynamic card accent.</Text>
      {ACCENTS.map((a) => <Pressable key={a.id} style={styles.option} onPress={() => { setAccent(a.id); setThemeOpen(false); flash(`Applied ${a.label} theme`); }}>
        <View style={[styles.swatchDot, { backgroundColor: a.color, width: 18, height: 18, borderRadius: 9 }]} /><Text style={styles.optionText}>{a.label}</Text>{accent === a.id ? <Glyph name="check" size={16} color={colors.holoCyan} /> : null}
      </Pressable>)}
    </Sheet>

    <Sheet visible={qrOpen} onClose={() => setQrOpen(false)} title="Card QR code">
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Image source={{ uri: publicUrl(`/api/public/qr/${clientId}${cardNumber ? `?card=${cardNumber}` : ''}`) }} style={{ width: 220, height: 220, backgroundColor: '#fff', borderRadius: 10 }} />
        <Text style={styles.ticketSub}>Scan to open {profile.fullName}'s HuntsTAG card.</Text>
        <Button kind="secondary" icon="copy" title="Copy profile link" onPress={() => copy(shareUrl, 'Profile Link')} style={{ alignSelf: 'stretch' }} />
      </View>
    </Sheet>

    <Sheet visible={exchangeOpen} onClose={() => setExchangeOpen(false)} title="Share your contact back">
      <Text style={styles.ticketSub}>{profile.fullName}'s contact was saved. Leave yours so they can reach you too.</Text>
      <Message>{leadError}</Message>
      <Field label="Your name" value={lead.name} onChangeText={(v) => setLead((l) => ({ ...l, name: v }))} />
      <Field label="Phone number" keyboardType="phone-pad" value={lead.phone} onChangeText={(v) => setLead((l) => ({ ...l, phone: v }))} />
      <Field label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={lead.email} onChangeText={(v) => setLead((l) => ({ ...l, email: v }))} />
      <Field label="Company (optional)" value={lead.org} onChangeText={(v) => setLead((l) => ({ ...l, org: v }))} />
      <Button title={leadSubmitting ? 'Sharing…' : 'Share my contact'} disabled={leadSubmitting} onPress={submitLead} />
      <Button kind="ghost" title="Skip" onPress={() => setExchangeOpen(false)} />
    </Sheet>
  </View>;
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: '#070a12' }, stateText: { color: '#94a3b8', textAlign: 'center', lineHeight: 22, fontSize: 14 },
  ticketTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }, ticketSub: { color: '#94a3b8', textAlign: 'center', fontSize: 13, lineHeight: 19 },
  frame: { backgroundColor: '#0d1220', borderRadius: 26, borderWidth: 1, overflow: 'hidden', paddingBottom: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, zIndex: 3 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)' }, pulse: { width: 8, height: 8, borderRadius: 4 }, statusText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  topActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  arBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.45)' }, arText: { fontWeight: '800', fontSize: 11 },
  pillBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }, swatchDot: { position: 'absolute', right: 3, bottom: 3, width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#0d1220' },
  banner: { height: 150, marginTop: -62, backgroundColor: '#12163a' },
  identity: { alignItems: 'center', gap: 8, paddingHorizontal: 18, marginTop: -48 },
  avatarRing: { padding: 4, borderRadius: 60, borderWidth: 2, backgroundColor: '#0d1220' }, verified: { position: 'absolute', right: 2, bottom: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0d1220' },
  fullName: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' }, badgeText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  snippet: { color: '#94a3b8', textAlign: 'center', lineHeight: 20, fontSize: 13 },
  strip: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 14, paddingHorizontal: 16 }, circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  primary: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginVertical: 16 },
  exchange: { flex: 1, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, exchangeText: { color: '#fff', fontWeight: '800' },
  secondaryAct: { height: 48, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)' }, secondaryText: { color: colors.text, fontWeight: '700' },
  shareAct: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  content: { padding: 16, gap: 12 },
  bioCard: { padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', gap: 10 }, bioHead: { fontWeight: '800', fontSize: 14 }, bioText: { color: '#cbd5e1', lineHeight: 22, fontSize: 14 },
  tagsTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  specs: { flexDirection: 'row', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', padding: 14 }, spec: { flex: 1, gap: 4 }, specLabel: { color: '#94a3b8', fontSize: 11 }, specVal: { color: '#fff', fontWeight: '800', fontSize: 13 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' }, tileBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileType: { color: '#94a3b8', fontSize: 11 }, tileVal: { color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 1 }, tileAct: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  hero: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)' }, heroTitle: { color: '#fff', fontWeight: '800', fontSize: 15 }, heroUrl: { color: '#94a3b8', fontSize: 12 },
  emblem: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, emblemText: { color: '#fff', fontWeight: '900', fontSize: 20 },
  toast: { position: 'absolute', bottom: 28, alignSelf: 'center', backgroundColor: '#1f2937', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 }, toastText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.panelBorder }, optionText: { color: colors.text, flex: 1, fontSize: 15 },
});
