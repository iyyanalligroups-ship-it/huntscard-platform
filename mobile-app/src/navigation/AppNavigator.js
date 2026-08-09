import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { colors } from '../theme/colors.js';
import { DashboardIcon, ShieldIcon } from '../components/Icons.js';
import DashboardScreen from '../screens/DashboardScreen.js';
import DeviceSafetyCheckScreen from '../screens/DeviceSafetyCheckScreen.js';

const Drawer = createDrawerNavigator();

// Same holographic dark palette as client-app -- react-navigation's own
// DarkTheme covers everything not explicitly overridden below (dividers,
// default text, etc.) so unstyled corners still look intentional rather
// than falling back to stock Material colors.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.space,
    card: colors.panel,
    text: colors.text,
    border: colors.panelBorder,
    primary: colors.holoCyan,
  },
};

export default function AppNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Drawer.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.panel },
          headerTintColor: colors.text,
          drawerStyle: { backgroundColor: colors.panel, width: 260 },
          drawerActiveTintColor: colors.holoCyan,
          drawerInactiveTintColor: colors.textDim,
          drawerActiveBackgroundColor: colors.panelRaised,
        }}
      >
        {/* Order matters here -- Device Protection Check sits directly
            below Dashboard in the drawer, as asked for. */}
        <Drawer.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            drawerIcon: ({ color, size }) => <DashboardIcon color={color} size={size} />,
          }}
        />
        <Drawer.Screen
          name="Device Protection Check"
          component={DeviceSafetyCheckScreen}
          options={{
            drawerIcon: ({ color, size }) => <ShieldIcon color={color} size={size} />,
          }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
