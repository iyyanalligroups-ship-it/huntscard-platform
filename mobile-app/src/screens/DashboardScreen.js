import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors.js';

// Placeholder -- the real huntsTAG dashboard (profile preview, appointment
// requests, etc., mirroring client-app's own Dashboard.jsx) isn't built
// into this RN project yet. This exists purely as the anchor screen the
// nav is organized around, since Device Protection Check was asked for
// specifically as "below Dashboard".
export default function DashboardScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>The rest of your huntsTAG dashboard will live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.space,
    padding: 18,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 6,
  },
});
