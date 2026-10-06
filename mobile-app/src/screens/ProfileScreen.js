import { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { api, publicUrl, resolveAssetUrl, WEB_URL } from '../api/client.js';
import { Glyph } from '../components/Glyph.js';
import { Avatar, Button, Card, Loading, Message, Screen, Sheet, Tabs, Title } from '../components/ui.js';
import { initialsOf, stripProtocol } from '../lib/format.js';
import { colors } from '../theme/colors.js';

function InfoRow({ icon, text, label, href, onCopy }) {
  const body = <>
    <View style={styles.rowIcon}>{text ? <Text style={styles.rowIconText}>{text}</Text> : <Glyph name={icon} size={15} color={colors.holoCyan} />}</View>
    <Text style={styles.rowLabel} numberOfLines={2}>{label}</Text>
    {href ? <Glyph name="arrowUpRight" size={15} color={colors.text} /> : null}
  </>;
  return href ? <Pressable style={styles.row} onPress={() => Linking.openURL(href)} onLongPress={onCopy}>{body}</Pressable> : <View style={styles.row}>{body}</View>;
}

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('bio');
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, attrs] = await Promise.all([api.getProfile(), api.getAttributeDefinitions().catch(() => [])]);
      setProfile(p); setAttributes(attrs); setBannerFailed(false); setError('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shareUrl = profile?.clientId ? `${WEB_URL}/c/${profile.clientId}` : '';
  const shareText = profile?.fullName ? `${profile.fullName} — HuntsTAG\n${shareUrl}` : shareUrl;

  const customRowsFor = useCallback((section) => attributes.filter((a) => a.section === section).map((a) => {
    const value = profile?.customAttributes?.[a.key];
    if (!value) return null;
    const href = a.fieldType === 'phone' ? `tel:${value}` : a.fieldType === 'email' ? `mailto:${value}` : a.fieldType === 'url' ? value : undefined;
    return { key: a.key, text: a.label.slice(0, 2).toUpperCase(), label: `${a.label}: ${value}`, href };
  }).filter(Boolean), [attributes, profile]);

  const tabs = useMemo(() => {
    if (!profile) return [];
    const contactRows = [profile.phone, profile.publicEmail || profile.loginEmail].filter(Boolean);
    const socialRows = [profile.instagramUrl, profile.twitterUrl, profile.whatsapp].filter(Boolean);
    const list = [];
    if (profile.bio) list.push({ label: 'My Bio', key: 'bio' });
    if (contactRows.length || customRowsFor('contact').length) list.push({ label: 'Contact', key: 'contact' });
    if (profile.portfolioUrl || customRowsFor('portfolio').length) list.push({ label: 'Portfolio', key: 'portfolio' });
    if (socialRows.length || customRowsFor('social').length) list.push({ label: 'Social', key: 'social' });
    if (profile.huntsworldUrl || customRowsFor('huntsworld').length) list.push({ label: 'Huntsworld', key: 'huntsworld' });
    const builtin = new Set(['contact', 'portfolio', 'social', 'huntsworld']);
    for (const section of new Set(attributes.map((a) => a.section))) {
      if (builtin.has(section) || !customRowsFor(section).length) continue;
      list.push({ label: attributes.find((a) => a.section === section)?.sectionLabel || section, key: section });
    }
    if (!list.length) list.push({ label: 'Info', key: 'empty' });
    return list;
  }, [profile, attributes, customRowsFor]);

  if (loading) return <Screen><Loading /></Screen>;
  if (error && !profile) return <Screen><Message>{error}</Message></Screen>;

  const currentKey = tabs.find((t) => t.key === tab)?.key || tabs[0]?.key;
  const checks = [profile.fullName, profile.jobTitle, profile.photoUrl, profile.bannerUrl, profile.bio, profile.phone, profile.publicEmail || profile.loginEmail, profile.portfolioUrl, profile.whatsapp, profile.instagramUrl || profile.twitterUrl];
  const done = checks.filter(Boolean).length;
  const completion = Math.round((done / checks.length) * 100);

  async function copyLink() {
    await Clipboard.setStringAsync(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  const copyable = (text) => () => Clipboard.setStringAsync(text);

  return <Screen refreshing={false} onRefresh={load}>
    <Title eyebrow="Digital identity" subtitle="Preview exactly what people see when they tap or scan your card.">Your HuntsTAG profile</Title>

    <Card style={styles.preview}>
      <View style={styles.cover}>
        {profile.bannerUrl && !bannerFailed ? <Image source={{ uri: resolveAssetUrl(profile.bannerUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBannerFailed(true)} />
          : <Pressable style={styles.bannerEmpty} onPress={() => navigation.navigate('Profile Settings')}><Glyph name="image" size={24} color={colors.text} /><Text style={styles.link}>Upload a banner</Text></Pressable>}
        <View style={styles.avatarWrap}><Avatar uri={resolveAssetUrl(profile.photoUrl)} name={initialsOf(profile.fullName)} size={86} style={styles.avatar} /></View>
      </View>
      <View style={styles.head}>
        <Text style={styles.name}>{profile.fullName}</Text>
        <Text style={styles.clientId}>{profile.clientId}</Text>
        <Text style={styles.job}>{profile.jobTitle || ' '}</Text>
        {profile.clientId ? <Image source={{ uri: publicUrl(`/api/public/qr/${profile.clientId}`) }} style={styles.qr} /> : null}
        <View style={styles.actions}>
          <Button compact icon="arrowUpRight" title="View live page" onPress={() => navigation.navigate('Card', { clientId: profile.clientId })} style={styles.flex} />
          <Button compact kind="secondary" icon="edit" title="Edit profile" onPress={() => navigation.navigate('Profile Settings')} style={styles.flex} />
          <Pressable style={styles.shareBtn} onPress={() => setShareOpen(true)}><Glyph name="send" size={18} /></Pressable>
        </View>
      </View>
      <Tabs tabs={tabs} value={currentKey} onChange={setTab} style={{ marginHorizontal: 14 }} />
      <View style={styles.panel}>
        {currentKey === 'bio' ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        {currentKey === 'contact' ? <>
          {profile.phone ? <InfoRow icon="phone" label={profile.phone} href={`tel:${profile.phone}`} onCopy={copyable(profile.phone)} /> : null}
          {(profile.publicEmail || profile.loginEmail) ? <InfoRow icon="mail" label={profile.publicEmail || profile.loginEmail} href={`mailto:${profile.publicEmail || profile.loginEmail}`} /> : null}
          {customRowsFor('contact').map((row) => <InfoRow key={row.key} {...row} />)}
        </> : null}
        {currentKey === 'portfolio' ? <>
          {profile.portfolioUrl ? <InfoRow icon="link" label={stripProtocol(profile.portfolioUrl)} href={profile.portfolioUrl} /> : null}
          {customRowsFor('portfolio').map((row) => <InfoRow key={row.key} {...row} />)}
        </> : null}
        {currentKey === 'social' ? <>
          {profile.instagramUrl ? <InfoRow icon="camera" label="Instagram" href={profile.instagramUrl} /> : null}
          {profile.twitterUrl ? <InfoRow icon="globe" label="Twitter / X" href={profile.twitterUrl} /> : null}
          {profile.whatsapp ? <InfoRow icon="chat" label="WhatsApp" href={`https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`} /> : null}
          {customRowsFor('social').map((row) => <InfoRow key={row.key} {...row} />)}
        </> : null}
        {currentKey === 'huntsworld' ? <>
          {profile.huntsworldUrl ? <View style={styles.hw}>
            <View style={styles.row}><View style={styles.hwBadge}><Text style={styles.hwBadgeText}>H</Text></View><View style={{ flex: 1 }}><Text style={styles.name2}>Huntsworld</Text><Text style={styles.dim}>{stripProtocol(profile.huntsworldUrl)}</Text></View></View>
            <Button compact title="View listing on Huntsworld" onPress={() => Linking.openURL(profile.huntsworldUrl)} />
          </View> : null}
          {customRowsFor('huntsworld').map((row) => <InfoRow key={row.key} {...row} />)}
        </> : null}
        {currentKey && !['bio', 'contact', 'portfolio', 'social', 'huntsworld', 'empty'].includes(currentKey) ? customRowsFor(currentKey).map((row) => <InfoRow key={row.key} {...row} />) : null}
        {currentKey === 'empty' ? <Text style={styles.dim}>No additional details added yet.</Text> : null}
      </View>
    </Card>

    <Card style={{ gap: 12 }}>
      <Text style={styles.h2}>Profile readiness</Text>
      <Text style={styles.dim}>{done} of {checks.length} essentials added</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${completion}%` }]} /></View>
      <Text style={styles.pct}>{completion}%</Text>
      <Text style={styles.dim}>{completion === 100 ? 'Everything important is ready to share.' : 'Add more details to make every tap more useful.'}</Text>
    </Card>

    <Card style={{ gap: 8 }}>
      <Text style={styles.h2}>Card identity</Text>
      <InfoRow icon="user" label={`Name: ${profile.fullName || 'Not added'}`} />
      <InfoRow icon="building" label={`Role: ${profile.jobTitle || 'Not added'}`} />
      <InfoRow icon="globe" label={`Client ID: ${profile.clientId}`} />
    </Card>

    <Card style={{ gap: 10 }}>
      <Text style={styles.h2}>Public profile link</Text>
      <View style={styles.linkBox}><Text style={styles.linkText} numberOfLines={1}>/c/{profile.clientId}</Text><Pressable onPress={copyLink} hitSlop={10}><Glyph name={copied ? 'check' : 'copy'} size={18} color={colors.holoCyan} /></Pressable></View>
      <Button compact kind="ghost" icon="edit" title="Edit profile details" onPress={() => navigation.navigate('Profile Settings')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Card>

    <Sheet visible={shareOpen} onClose={() => setShareOpen(false)} title="Share your profile">
      <Button icon="chat" title="WhatsApp" onPress={() => { setShareOpen(false); Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`); }} />
      <Button kind="secondary" icon="send" title="Telegram" onPress={() => { setShareOpen(false); Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${profile.fullName || ''} — HuntsTAG`)}`); }} />
      <Button kind="secondary" icon="mail" title="Email" onPress={() => { setShareOpen(false); Linking.openURL(`mailto:?subject=${encodeURIComponent(`${profile.fullName || ''} — HuntsTAG`)}&body=${encodeURIComponent(shareText)}`); }} />
      <Button kind="secondary" icon={copied ? 'check' : 'copy'} title={copied ? 'Link copied!' : 'Copy link'} onPress={copyLink} />
    </Sheet>
  </Screen>;
}

const styles = StyleSheet.create({
  preview: { padding: 0, overflow: 'hidden', gap: 14, paddingBottom: 14 },
  cover: { height: 130, backgroundColor: '#0e1a2b', marginBottom: 44 },
  bannerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  avatarWrap: { position: 'absolute', bottom: -43, alignSelf: 'center', borderRadius: 50, borderWidth: 4, borderColor: colors.panel }, avatar: {},
  head: { alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  name: { color: colors.text, fontSize: 22, fontWeight: '900' }, clientId: { color: colors.textDim, fontSize: 12, letterSpacing: 1 }, job: { color: colors.holoCyan, fontWeight: '700' },
  qr: { width: 110, height: 110, borderRadius: 8, backgroundColor: '#fff', marginVertical: 8 },
  actions: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 4 }, flex: { flex: 1 },
  shareBtn: { width: 44, borderRadius: 10, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' },
  panel: { paddingHorizontal: 14, gap: 8, minHeight: 60 },
  bio: { color: colors.text, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, rowIconText: { color: colors.holoCyan, fontWeight: '800', fontSize: 11 },
  rowLabel: { color: colors.text, flex: 1, fontSize: 14 },
  hw: { gap: 12, padding: 14, borderRadius: 12, backgroundColor: colors.panelRaised }, hwBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.holoViolet, alignItems: 'center', justifyContent: 'center' }, hwBadgeText: { color: '#ffffff', fontWeight: '900', fontSize: 18 },
  name2: { color: colors.text, fontWeight: '800' }, dim: { color: colors.textDim, fontSize: 12, lineHeight: 18 }, link: { color: colors.holoCyan, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 17, fontWeight: '800' }, pct: { color: colors.holoCyan, fontSize: 26, fontWeight: '900' },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.panelRaised, overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: colors.holoCyan, borderRadius: 5 },
  linkBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, backgroundColor: colors.panelRaised }, linkText: { color: colors.text, fontFamily: 'monospace', flex: 1 },
});
