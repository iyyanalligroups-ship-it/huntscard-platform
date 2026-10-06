import { useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, WEB_URL } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useCart } from '../cart/CartContext.js';
import { Glyph } from '../components/Glyph.js';
import { IconButton } from '../components/ui.js';
import SplashOverlay from '../components/SplashOverlay.js';
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
import MenuScreen from '../screens/MenuScreen.js';
import { ArExperienceScreen, MagicCamera3DScreen, MagicCameraScreen } from '../screens/WebExperienceScreen.js';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.space, card: colors.panel, text: colors.text, border: colors.panelBorder, primary: colors.holoCyan },
};

// Native-feel stack header: white bar, bold title, platform back gesture.
const stackOptions = {
  headerStyle: { backgroundColor: colors.panel },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '800', fontSize: 17 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: colors.space },
  animation: 'slide_from_right',
};

const TAB_ICONS = { Home: 'home', Shop: 'bag', 'Magic Poster': 'image', Dashboard: 'dashboard', 'Contact Us': 'mail', Menu: 'menu' };

function BrandTitle() {
  return <View style={styles.brandTitle}>
    <Image source={require('../../assets/wolf-source.png')} style={styles.brandLogo} resizeMode="contain" />
    <Text style={styles.brandText}>HuntsTAG</Text>
  </View>;
}

// Cart and (for members) notifications, shown in every tab header.
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

// Bottom tabs: the five places people use most. Everything else is one tap away in "Menu",
// which lists the same links as the website's dashboard sidebar.
function makeTabs(member) {
  return function Tabs() {
    const insets = useSafeAreaInsets();
    return <Tab.Navigator
      initialRouteName={member ? 'Dashboard' : 'Home'}
      screenListeners={{ tabPress: () => { Haptics.selectionAsync().catch(() => {}); } }}
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: colors.panel },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        headerTintColor: colors.text,
        headerRight: () => <HeaderRight member={member} navigation={navigation} />,
        sceneStyle: { backgroundColor: colors.space },
        tabBarActiveTintColor: colors.holoCyan,
        tabBarInactiveTintColor: '#2a3550',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.panelBorder, height: 58 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6) },
        tabBarIcon: ({ color, focused }) => <Glyph name={TAB_ICONS[route.name] || 'home'} size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.2 : 1.8} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerTitle: () => <BrandTitle />, headerTitleAlign: 'left' }} />
      <Tab.Screen name="Shop" component={ShopScreen} options={{ title: 'Shop' }} />
      <Tab.Screen name="Magic Poster" component={MagicArtScreen} options={{ title: 'Magic Poster', tabBarLabel: 'Posters' }} />
      {member
        ? <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
        : <Tab.Screen name="Contact Us" component={ContactUsScreen} options={{ title: 'Contact Us', tabBarLabel: 'Contact' }} />}
      <Tab.Screen name="Menu" component={MenuScreen} options={{ title: 'Menu' }} />
    </Tab.Navigator>;
  };
}

const MemberTabs = makeTabs(true);
const PublicTabs = makeTabs(false);

// Pages opened on top of the tabs (with a native back button). The same set the website's
// dashboard sidebar and public menu link to.
const memberPages = <>
  <Stack.Screen name="Appointment Requests" component={AppointmentsScreen} />
  <Stack.Screen name="Profile" component={ProfileScreen} />
  <Stack.Screen name="Profile Settings" component={ProfileSettingsScreen} />
  <Stack.Screen name="Contacts" component={ContactsScreen} />
  <Stack.Screen name="AR Layout" component={ArLayoutScreen} />
  <Stack.Screen name="Magic Business Card" component={MagicBusinessCardScreen} />
  <Stack.Screen name="Track Orders" component={TrackScreen} />
  <Stack.Screen name="Settings" component={SettingsScreen} />
  <Stack.Screen name="Notifications" component={NotificationsScreen} />
  <Stack.Screen name="Device Protection Check" component={DeviceSafetyCheckScreen} />
  <Stack.Screen name="Contact Us" component={ContactUsScreen} />
</>;

const sharedPages = <>
  <Stack.Screen name="Magic Poster Cart" component={MagicPosterCartScreen} options={{ title: 'Cart' }} />
  <Stack.Screen name="Catalog" component={CatalogScreen} />
  <Stack.Screen name="About Us" component={AboutScreen} />
  <Stack.Screen name="What is HuntsWorld?" component={HuntsworldScreen} />
  <Stack.Screen name="FAQ" component={FaqScreen} />
  <Stack.Screen name="Chat Support" component={ChatScreen} />
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

  return <View style={styles.flex}>
    {restoring ? <View style={styles.blank} /> : (
      <NavigationContainer theme={navTheme} ref={navigationRef} linking={linking}>
        <Stack.Navigator screenOptions={stackOptions}>
          {!session ? <>
            <Stack.Screen name="Public" component={PublicTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset password' }} />
            {sharedPages}
          </> : session.mustChangePassword ? (
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Secure your account', headerBackVisible: false }} />
          ) : <>
            <Stack.Screen name="Main" component={MemberTabs} options={{ headerShown: false }} />
            {memberPages}
            {sharedPages}
          </>}
        </Stack.Navigator>
      </NavigationContainer>
    )}
    <SplashOverlay ready={!restoring} />
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  blank: { flex: 1, backgroundColor: "#eaf1ff" },
  brandTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandLogo: { width: 34, height: 22 },
  brandText: { color: colors.text, fontWeight: '900', fontSize: 19, letterSpacing: -0.4 },
  headerRight: { flexDirection: 'row', gap: 10, marginRight: 12 },
});
