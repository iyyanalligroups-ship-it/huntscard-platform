import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, WEB_URL } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useCart } from '../cart/CartContext.js';
import { Glyph } from '../components/Glyph.js';
import { IconButton } from '../components/ui.js';
import { colors } from '../theme/colors.js';
import { navigationRef } from './navigationRef.js';
import LoginScreen from '../screens/LoginScreen.js';
import RegisterScreen from '../screens/RegisterScreen.js';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen.js';
import ChangePasswordScreen from '../screens/ChangePasswordScreen.js';
import HomeScreen from '../screens/HomeScreen.js';
import CatalogScreen from '../screens/CatalogScreen.js';
import ContactUsScreen from '../screens/ContactUsScreen.js';
import { AboutScreen, FaqScreen, HuntsworldScreen } from '../screens/InfoScreens.js';
import MagicArtScreen from '../screens/MagicArtScreen.js';
import MagicPosterCartScreen from '../screens/MagicPosterCartScreen.js';
import ShopScreen from '../screens/ShopScreen.js';
import ChatScreen from '../screens/ChatScreen.js';
import DashboardScreen from '../screens/DashboardScreen.js';
import AppointmentsScreen from '../screens/AppointmentsScreen.js';
import ProfileScreen from '../screens/ProfileScreen.js';
import ProfileSettingsScreen from '../screens/ProfileSettingsScreen.js';
import ContactsScreen from '../screens/ContactsScreen.js';
import ArLayoutScreen from '../screens/ArLayoutScreen.js';
import MagicBusinessCardScreen from '../screens/MagicBusinessCardScreen.js';
import TrackScreen from '../screens/TrackScreen.js';
import SettingsScreen from '../screens/SettingsScreen.js';
import NotificationsScreen from '../screens/NotificationsScreen.js';
import DeviceSafetyCheckScreen from '../screens/DeviceSafetyCheckScreen.js';
import PublicProfileScreen from '../screens/PublicProfileScreen.js';
import OpenCardScreen from '../screens/OpenCardScreen.js';
import { ArExperienceScreen, MagicCamera3DScreen, MagicCameraScreen } from '../screens/WebExperienceScreen.js';

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.space, card: colors.panel, text: colors.text, border: colors.panelBorder, primary: colors.holoCyan },
};

const headerStyle = { headerStyle: { backgroundColor: colors.panel }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.space } };

// Same grouping as client-app/src/components/Layout.jsx's NAV_GROUPS, plus the
// public-site pages from PublicLayout/Footer so nothing on the website is
// unreachable from the app.
const DASHBOARD_ITEM = { name: 'Dashboard', icon: 'dashboard' };
const MEMBER_GROUPS = [
  { id: 'account', label: 'Account & connections', icon: 'user', items: [
    { name: 'Appointment Requests', icon: 'calendar' }, { name: 'Profile', icon: 'user' }, { name: 'Profile Settings', icon: 'edit' }, { name: 'Contacts', icon: 'contacts' }] },
  { id: 'studio', label: 'Studio & AR', icon: 'layers', items: [
    { name: 'AR Layout', icon: 'layers' }, { name: 'Magic Camera', icon: 'magic', stack: true }, { name: 'Magic Business Card', icon: 'magic' }] },
  { id: 'orders', label: 'Shop & orders', icon: 'bag', items: [
    { name: 'Shop', icon: 'bag' }, { name: 'Magic Poster', icon: 'image' }, { name: 'Track Orders', icon: 'truck' }] },
  { id: 'support', label: 'Help & settings', icon: 'chat', items: [
    { name: 'Chat Support', icon: 'chat' }, { name: 'Settings', icon: 'settings' }, { name: 'Notifications', icon: 'bell' }, { name: 'Device Protection Check', icon: 'shield' }] },
];
const EXPLORE_GROUP = { id: 'explore', label: 'Explore HuntsTAG', icon: 'home', items: [
  { name: 'Home', icon: 'home' }, { name: 'Catalog', icon: 'card' }, { name: 'Contact Us', icon: 'mail' }, { name: 'About Us', icon: 'info' },
  { name: 'What is HuntsWorld?', icon: 'globe' }, { name: 'FAQ', icon: 'help' }, { name: 'Open a Card', icon: 'scan', stack: true }] };
const PUBLIC_GROUPS = [
  { id: 'shop', label: 'Shop', icon: 'bag', items: [{ name: 'Shop', icon: 'bag' }, { name: 'Magic Poster', icon: 'image' }, { name: 'Catalog', icon: 'card' }, { name: 'Magic Camera', icon: 'magic', stack: true }] },
  { id: 'about', label: 'About', icon: 'info', items: [{ name: 'About Us', icon: 'info' }, { name: 'What is HuntsWorld?', icon: 'globe' }, { name: 'FAQ', icon: 'help' }] },
  { id: 'support', label: 'Support', icon: 'chat', items: [{ name: 'Chat Support', icon: 'chat' }, { name: 'Contact Us', icon: 'mail' }, { name: 'Open a Card', icon: 'scan', stack: true }] },
];

function DrawerContent({ navigation, state, member, groups }) {
  const { signOut } = useAuth();
  const activeName = state.routes[state.index]?.name;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => Object.fromEntries(groups.map((g) => [g.id, true])));
  const all = useMemo(() => [...(member ? [DASHBOARD_ITEM] : [{ name: 'Home', icon: 'home' }]), ...groups.flatMap((g) => g.items)], [groups, member]);
  const results = query.trim() ? all.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())) : [];

  const go = (item) => { setQuery(''); navigation.closeDrawer(); navigation.navigate(item.name); };
  const Item = ({ item, child }) => {
    const active = activeName === item.name;
    return <Pressable onPress={() => go(item)} style={[styles.link, child && styles.child, active && styles.linkActive]}>
      <Glyph name={item.icon} size={18} color={active ? colors.holoCyan : colors.textDim} />
      <Text style={[styles.linkText, active && { color: colors.holoCyan }]}>{item.name}</Text>
    </Pressable>;
  };

  return <SafeAreaView style={styles.drawer} edges={['top', 'bottom']}>
    <View style={styles.brandRow}><View style={styles.brandMark} /><View><Text style={styles.brand}>HuntsTAG</Text><Text style={styles.brandSub}>{member ? 'CLIENT PORTAL' : 'SMART CARDS'}</Text></View></View>
    <View style={styles.search}>
      <Glyph name="search" size={16} color={colors.textDim} />
      <TextInputLite value={query} onChange={setQuery} />
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      {query.trim() ? (results.length ? results.map((item) => <Item key={item.name} item={item} />) : <Text style={styles.none}>No matching page</Text>) : <>
        <Text style={styles.section}>Workspace</Text>
        <Item item={member ? DASHBOARD_ITEM : { name: 'Home', icon: 'home' }} />
        <Text style={styles.section}>{member ? 'Management' : 'Explore'}</Text>
        {groups.map((group) => {
          const expanded = open[group.id];
          const groupActive = group.items.some((item) => item.name === activeName);
          return <View key={group.id}>
            <Pressable style={[styles.parent, groupActive && { backgroundColor: 'rgba(94,234,212,0.06)' }]} onPress={() => setOpen((o) => ({ ...o, [group.id]: !o[group.id] }))}>
              <Glyph name={group.icon} size={18} color={groupActive ? colors.holoCyan : colors.text} />
              <Text style={styles.parentText}>{group.label}</Text>
              <Glyph name={expanded ? 'chevronUp' : 'chevronDown'} size={15} color={colors.textDim} />
            </Pressable>
            {expanded ? group.items.map((item) => <Item key={item.name} item={item} child />) : null}
          </View>;
        })}
      </>}
    </ScrollView>
    <View style={styles.footer}>
      {member ? <>
        <Pressable style={styles.link} onPress={() => { navigation.closeDrawer(); navigation.navigate('Home'); }}><Glyph name="home" size={18} color={colors.textDim} /><Text style={styles.linkText}>Home</Text></Pressable>
        <Pressable style={styles.link} onPress={signOut}><Glyph name="logout" size={18} color={colors.danger} /><Text style={[styles.linkText, { color: colors.danger }]}>Log out</Text></Pressable>
      </> : <>
        <Pressable style={styles.link} onPress={() => { navigation.closeDrawer(); navigationRef.navigate('Login'); }}><Glyph name="login" size={18} color={colors.holoCyan} /><Text style={[styles.linkText, { color: colors.holoCyan }]}>Log in</Text></Pressable>
        <Pressable style={styles.link} onPress={() => { navigation.closeDrawer(); navigationRef.navigate('Register'); }}><Glyph name="user" size={18} color={colors.text} /><Text style={styles.linkText}>Create account</Text></Pressable>
      </>}
      <Pressable onPress={() => Linking.openURL('mailto:info@huntsworld.com')}><Text style={styles.mail}>info@huntsworld.com</Text></Pressable>
    </View>
  </SafeAreaView>;
}

// Minimal inline search box (kept local so the drawer has no extra deps).
function TextInputLite({ value, onChange }) {
  return <TextInput value={value} onChangeText={onChange} placeholder="Search pages..." placeholderTextColor={colors.textDim} style={styles.searchInput} autoCapitalize="none" />;
}

function HeaderRight({ member, navigation }) {
  const cart = useCart();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!member) return undefined;
    let alive = true;
    const poll = () => api.getNotifications().then((d) => alive && setUnread(d.unreadCount || 0)).catch(() => {});
    poll();
    const timer = setInterval(poll, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [member]);

  return <View style={styles.headerRight}>
    <IconButton name="cart" badge={cart.totalCount} onPress={() => navigation.navigate('Magic Poster Cart')} />
    {member ? <IconButton name="bell" badge={unread} onPress={() => navigation.navigate('Notifications')} /> : null}
  </View>;
}

function makeDrawer(member, groups) {
  return function DrawerRoot() {
    const content = useCallback((props) => <DrawerContent {...props} member={member} groups={groups} />, []);
    return <Drawer.Navigator
      drawerContent={content}
      initialRouteName={member ? 'Dashboard' : 'Home'}
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.panel }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' },
        drawerStyle: { backgroundColor: colors.panel, width: 300 }, sceneStyle: { backgroundColor: colors.space },
        headerRight: () => <HeaderRight member={member} navigation={navigation} />,
      })}
    >
      {member ? <>
        <Drawer.Screen name="Dashboard" component={DashboardScreen} />
        <Drawer.Screen name="Appointment Requests" component={AppointmentsScreen} />
        <Drawer.Screen name="Profile" component={ProfileScreen} />
        <Drawer.Screen name="Profile Settings" component={ProfileSettingsScreen} />
        <Drawer.Screen name="Contacts" component={ContactsScreen} />
        <Drawer.Screen name="AR Layout" component={ArLayoutScreen} />
        <Drawer.Screen name="Magic Business Card" component={MagicBusinessCardScreen} />
        <Drawer.Screen name="Track Orders" component={TrackScreen} />
        <Drawer.Screen name="Settings" component={SettingsScreen} />
        <Drawer.Screen name="Notifications" component={NotificationsScreen} />
        <Drawer.Screen name="Device Protection Check" component={DeviceSafetyCheckScreen} />
      </> : null}
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Shop" component={ShopScreen} />
      <Drawer.Screen name="Magic Poster" component={MagicArtScreen} />
      <Drawer.Screen name="Magic Poster Cart" component={MagicPosterCartScreen} options={{ title: 'Cart' }} />
      <Drawer.Screen name="Catalog" component={CatalogScreen} />
      <Drawer.Screen name="Contact Us" component={ContactUsScreen} />
      <Drawer.Screen name="About Us" component={AboutScreen} />
      <Drawer.Screen name="What is HuntsWorld?" component={HuntsworldScreen} />
      <Drawer.Screen name="FAQ" component={FaqScreen} />
      <Drawer.Screen name="Chat Support" component={ChatScreen} />
    </Drawer.Navigator>;
  };
}

const MemberDrawer = makeDrawer(true, [...MEMBER_GROUPS, EXPLORE_GROUP]);
const PublicDrawer = makeDrawer(false, PUBLIC_GROUPS);

// Screens reachable from both the public and logged-in areas (the website's
// /c/:clientId, /magic-camera, /magic-camera-3d routes and the AR view).
const sharedScreens = <>
  <Stack.Screen name="Card" component={PublicProfileScreen} options={{ title: 'HuntsTAG Card' }} />
  <Stack.Screen name="Open a Card" component={OpenCardScreen} />
  <Stack.Screen name="Magic Camera" component={MagicCameraScreen} />
  <Stack.Screen name="Magic Camera 3D" component={MagicCamera3DScreen} />
  <Stack.Screen name="AR Experience" component={ArExperienceScreen} options={{ title: 'HuntsAR World' }} />
</>;

const linking = {
  prefixes: [WEB_URL, 'huntstag://'],
  config: { screens: { Card: 'c/:clientId' } },
};

export default function AppNavigator() {
  const { session, restoring, signInWithToken } = useAuth();

  // Admin "view as this client": huntstag://impersonate?token=…&clientId=…
  useEffect(() => {
    async function handle(url) {
      if (!url || !/impersonate/i.test(url)) return;
      const query = url.split('?')[1] || '';
      const params = Object.fromEntries(query.split('&').map((pair) => pair.split('=').map(decodeURIComponent)));
      if (params.token && params.clientId) await signInWithToken(params.token, params.clientId);
    }
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [signInWithToken]);

  if (restoring) return <View style={styles.splash}><Text style={styles.logo}>huntsTAG</Text><ActivityIndicator color={colors.holoCyan} /></View>;

  return <NavigationContainer theme={navTheme} ref={navigationRef} linking={linking}>
    <Stack.Navigator screenOptions={headerStyle}>
      {!session ? <>
        <Stack.Screen name="Public" component={PublicDrawer} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset password' }} />
        {sharedScreens}
      </> : session.mustChangePassword ? <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Secure your account', headerBackVisible: false }} />
        : <>
          <Stack.Screen name="Main" component={MemberDrawer} options={{ headerShown: false }} />
          {sharedScreens}
        </>}
    </Stack.Navigator>
  </NavigationContainer>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.space, alignItems: 'center', justifyContent: 'center', gap: 18 }, logo: { color: colors.holoCyan, fontSize: 30, fontWeight: '900' },
  drawer: { flex: 1, backgroundColor: colors.panel },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 }, brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.holoCyan },
  brand: { color: colors.text, fontWeight: '900', fontSize: 18 }, brandSub: { color: colors.textDim, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder },
  searchInput: { flex: 1, color: colors.text, height: 40, fontSize: 14 }, none: { color: colors.textDim, padding: 16 },
  section: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 },
  parent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 }, parentText: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 11, marginHorizontal: 8, borderRadius: 10 }, child: { paddingLeft: 34 },
  linkActive: { backgroundColor: colors.panelRaised }, linkText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  footer: { borderTopWidth: 1, borderTopColor: colors.panelBorder, paddingTop: 8 }, mail: { color: colors.textDim, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
  headerRight: { flexDirection: 'row', gap: 10, marginRight: 12 },
});
