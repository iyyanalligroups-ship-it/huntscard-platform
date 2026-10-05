import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator.js';
import { colors } from './src/theme/colors.js';
import { AuthProvider } from './src/auth/AuthContext.js';
import { CartProvider } from './src/cart/CartContext.js';
import { PaymentProvider } from './src/payments/PaymentProvider.js';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.panel} />
        <AuthProvider>
          <CartProvider>
            <PaymentProvider>
              <AppNavigator />
            </PaymentProvider>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
