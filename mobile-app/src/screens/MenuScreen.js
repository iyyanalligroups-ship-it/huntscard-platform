import { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Glyph } from '../components/Glyph.js';
import { initialsOf } from '../lib/siteConfig.js';
import { colors } from '../theme/colors.js';

// The full link list, grouped exactly like the website's dashboard sidebar
// (client-app/src/components/Layout.jsx NAV_GROUPS) plus the public site pages,
// so every page the website has is one tap away from here.
export const MEMBER_MENU = [
  { id: 'workspace', label: 'Workspace', items: [{ name: 'Dashboard', icon: 'dashboard' }] },
  { id: 'account', label: 'Account & connections', items: [
    { name: 'Appointment Requests', icon: 'calendar' }, { name: 'Profile', icon: 'user' },
    { name: 'Profile Settings', icon: 'edit' }, { name: 'Contacts', icon: 'contacts' }] },
  { id: 'studio', label: 'Studio & AR', items: [
    { name: 'AR Layout', icon: 'layers' }, { name: 'Magic Camera', icon: 'magic' }, { name: 'Magic Business Card', icon: 'sparkles' }] },
  { id: 'orders', label: 'Shop & orders', items: [
    { name: 'Shop', icon: 'bag' }, { name: 'Magic Poster', icon: 'image' }, { name: 'Track Orders', icon: 'truck' }] },
  { id: 'support', label: 'Help & settings', items: [
    { name: 'Chat Support', icon: 'chat' }, { name: 'Settings', icon: 'settings' }, { name: 'Notifications', icon: 'bell' },
    { name: 'Device Protection Check', icon: 'shield' }] },
  { id: 'explore', label: 'Explore HuntsTAG', items: [
    { name: 'Home', icon: 'home' }, { name: 'Catalog', icon: 'card' }, { name: 'Contact Us', icon: 'mail' },
    { name: 'About Us', icon: 'info' }, { name: 'What is HuntsWorld?', icon: 'globe' }, { name: 'FAQ', icon: 'help' },
    { name: 'Open a Card', icon: 'scan' }] },
];

export const PUBLIC_MENU = [
  { id: 'shop', label: 'Shop', items: [
    { name: 'Shop', icon: 'bag' }, { name: 'Magic Poster', icon: 'image' }, { name: 'Catalog', icon: 'card' }, { name: 'Magic Camera', icon: 'magic' }] },
  { id: 'about', label: 'About', items: [
    { name: 'About Us', icon: 'info' }, { name: 'What is HuntsWorld?', icon: 'globe' }, { name: 'FAQ', icon: 'help' }] },
  { id: 'support', label: 'Support', items: [
    { name: 'Chat Support', icon: 'chat' }, { name: 'Contact Us', icon: 'mail' }, { name: 'Open a Card', icon: 'scan' }] },
];

export default function MenuScreen({ navigation }) {
  const { session, signOut } = useAuth();
  const member = Boolean(session);
  const [me, setMe] = useState(null);
  const [query, setQuery] = useState('');

  useFocusEffect(useCallback(() => {
    if (!member) { setMe(null); return; }
    api.getProfile().then(setMe).catch(() => {});
  }, [member]));

  const groups = member ? MEMBER_MENU : PUBLIC_MENU;
  const q = query.trim().toLowerCase();
  const results = useMemo(() => (q ? groups.flatMap((g) => g.items).filter((i) => i.name.toLowerCase().includes(q)) : []), [groups, q]);
  const go = (name) => { setQuery(''); navigation.navigate(name); };

  const Row = ({ item, last }) => (
    <Pressable onPress={() => go(item.name)} android_ripple={{ color: '#dbe5f7' }} style={[styles.row, !last && styles.rowLine]}>
      <View style={styles.iconTile}><Glyph name={item.icon} size={19} color={colors.holoCyan} /></View>
      <Text style={styles.rowText}>{item.name}</Text>
      <Glyph name="chevronRight" size={16} color={colors.text} />
    </Pressable>
  );

  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {member ? (
      <Pressable style={styles.profile} onPress={() => navigation.navigate('Profile')}>
        <View style={styles.avatar}>
          {me?.photoUrl ? <Image source={{ uri: resolveAssetUrl(me.photoUrl) }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initialsOf(me?.fullName) || '?'}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{me?.fullName || 'Your account'}</Text>
          <Text style={styles.role} numberOfLines={1}>{me?.jobTitle || me?.loginEmail || 'HuntsTAG member'}</Text>
        </View>
        <Glyph name="chevronRight" size={18} color="#cfe0ff" />
      </Pressable>
    ) : (
      <View style={styles.profile}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.name}>Welcome to HuntsTAG</Text>
          <Text style={styles.role}>Log in to manage your card, orders and contacts.</Text>
          <View style={styles.authRow}>
            <Pressable style={styles.authBtn} onPress={() => navigation.navigate('Login')}><Text style={styles.authBtnText}>Log in</Text></Pressable>
            <Pressable style={[styles.authBtn, styles.authBtnGhost]} onPress={() => navigation.navigate('Register')}><Text style={[styles.authBtnText, { color: '#fff' }]}>Create account</Text></Pressable>
          </View>
        </View>
      </View>
    )}

    <View style={styles.search}>
      <Glyph name="search" size={17} color={colors.text} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Search pages…" placeholderTextColor="#5b6783" style={styles.searchInput} autoCapitalize="none" />
      {query ? <Pressable onPress={() => setQuery('')} hitSlop={10}><Glyph name="close" size={16} color={colors.text} /></Pressable> : null}
    </View>

    {q ? (
      <View style={styles.card}>
        {results.length ? results.map((item, i) => <Row key={item.name} item={item} last={i === results.length - 1} />) : <Text style={styles.none}>No matching page</Text>}
      </View>
    ) : groups.map((group) => (
      <View key={group.id} style={{ gap: 8 }}>
        <Text style={styles.section}>{group.label}</Text>
        <View style={styles.card}>{group.items.map((item, i) => <Row key={item.name} item={item} last={i === group.items.length - 1} />)}</View>
      </View>
    ))}

    {member ? (
      <Pressable style={[styles.card, styles.logout]} onPress={signOut}>
        <Glyph name="logout" size={19} color={colors.danger} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    ) : null}

    <Pressable onPress={() => Linking.openURL('mailto:info@huntsworld.com')}><Text style={styles.mail}>info@huntsworld.com</Text></Pressable>
    <Text style={styles.version}>HuntsTAG · A smart card for a smarter first impression.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.space },
  content: { padding: 16, gap: 16, paddingBottom: 30 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 22, backgroundColor: colors.holoCyan },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0b3fb8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  name: { color: '#fff', fontSize: 18, fontWeight: '800' },
  role: { color: '#dbe9ff', fontSize: 13 },
  authRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  authBtn: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  authBtnGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)' },
  authBtnText: { color: colors.holoCyan, fontWeight: '800', fontSize: 13 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 46, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panelBorder },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, height: 46 },
  section: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 4 },
  card: { backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.panelBorder, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 13 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.panelBorder },
  iconTile: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#e3edff', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, color: colors.text, fontSize: 15.5, fontWeight: '600' },
  none: { color: colors.textDim, padding: 18, textAlign: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  logoutText: { color: colors.danger, fontWeight: '800', fontSize: 15.5 },
  mail: { color: colors.holoCyan, textAlign: 'center', fontWeight: '700', marginTop: 4 },
  version: { color: colors.textDim, fontSize: 11.5, textAlign: 'center' },
});
