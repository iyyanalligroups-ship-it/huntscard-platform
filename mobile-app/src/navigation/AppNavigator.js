import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext.js';
import { colors } from '../theme/colors.js';
import { DashboardIcon, ShieldIcon } from '../components/Icons.js';
import LoginScreen from '../screens/LoginScreen.js';
import RegisterScreen from '../screens/RegisterScreen.js';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen.js';
import ChangePasswordScreen from '../screens/ChangePasswordScreen.js';
import DashboardScreen from '../screens/DashboardScreen.js';
import ProfileScreen from '../screens/ProfileScreen.js';
import ShopScreen from '../screens/ShopScreen.js';
import TrackScreen from '../screens/TrackScreen.js';
import ContactsScreen from '../screens/ContactsScreen.js';
import AppointmentsScreen from '../screens/AppointmentsScreen.js';
import ChatScreen from '../screens/ChatScreen.js';
import AccountScreen from '../screens/AccountScreen.js';
import DeviceSafetyCheckScreen from '../screens/DeviceSafetyCheckScreen.js';

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();
const dashboardDrawerIcon = ({ color, size }) => <DashboardIcon color={color} size={size} />;
const shieldDrawerIcon = ({ color, size }) => <ShieldIcon color={color} size={size} />;

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.space, card: colors.panel, text: colors.text, border: colors.panelBorder, primary: colors.holoCyan },
};

const drawerOptions = {
  headerStyle: { backgroundColor: colors.panel },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '800' },
  drawerStyle: { backgroundColor: colors.panel, width: 280 },
  drawerActiveTintColor: colors.holoCyan,
  drawerInactiveTintColor: colors.textDim,
  drawerActiveBackgroundColor: colors.panelRaised,
  drawerLabelStyle: { marginLeft: -10, fontWeight: '700' },
};

function MainDrawer() {
  return <Drawer.Navigator screenOptions={drawerOptions}>
    <Drawer.Screen name="Dashboard" component={DashboardScreen} options={{ drawerIcon: dashboardDrawerIcon }} />
    <Drawer.Screen name="Profile" component={ProfileScreen} />
    <Drawer.Screen name="Shop" component={ShopScreen} />
    <Drawer.Screen name="Track Orders" component={TrackScreen} />
    <Drawer.Screen name="Contacts" component={ContactsScreen} />
    <Drawer.Screen name="Appointments" component={AppointmentsScreen} />
    <Drawer.Screen name="Support Chat" component={ChatScreen} />
    <Drawer.Screen name="Account & Cards" component={AccountScreen} />
    <Drawer.Screen name="Device Protection Check" component={DeviceSafetyCheckScreen} options={{ drawerIcon: shieldDrawerIcon }} />
  </Drawer.Navigator>;
}

export default function AppNavigator() {
  const { session, restoring } = useAuth();
  if (restoring) return <View style={styles.splash}><Text style={styles.logo}>huntsTAG</Text><ActivityIndicator color={colors.holoCyan} /></View>;
  return <NavigationContainer theme={navTheme}>
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.panel }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.space } }}>
      {!session ? <>
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset password' }} />
      </> : session.mustChangePassword ? <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Secure your account', headerBackVisible: false }} />
        : <Stack.Screen name="Main" component={MainDrawer} options={{ headerShown: false }} />}
    </Stack.Navigator>
  </NavigationContainer>;
}

const styles = StyleSheet.create({ splash: { flex: 1, backgroundColor: colors.space, alignItems: 'center', justifyContent: 'center', gap: 18 }, logo: { color: colors.holoCyan, fontSize: 30, fontWeight: '900' } });
