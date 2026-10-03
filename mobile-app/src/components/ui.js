import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/colors.js';

export function Screen({ children, refreshing, onRefresh, contentStyle }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.safe}
        contentContainerStyle={[styles.screen, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children, subtitle }) {
  return (
    <View style={styles.titleWrap}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({ label, multiline, style, ...props }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        style={[styles.input, multiline && styles.multiline]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...props}
      />
    </View>
  );
}

export function Button({ title, onPress, disabled, kind = 'primary', compact = false, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, styles[`button_${kind}`], compact && styles.compact, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Text style={[styles.buttonText, kind === 'danger' && styles.dangerText]}>{title}</Text>
    </Pressable>
  );
}

export function Message({ children, tone = 'error' }) {
  if (!children) return null;
  return <Text style={[styles.message, tone === 'success' && styles.success]}>{children}</Text>;
}

export function Loading({ label = 'Loading…' }) {
  return <View style={styles.loading}><ActivityIndicator color={colors.holoCyan} /><Text style={styles.subtitle}>{label}</Text></View>;
}

export function Empty({ children }) {
  return <Card><Text style={styles.empty}>{children}</Text></Card>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.space },
  screen: { padding: 18, paddingBottom: 42, gap: 14 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius, padding: 16 },
  titleWrap: { marginBottom: 4 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 5 },
  fieldWrap: { gap: 7 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { color: colors.text, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 10, minHeight: 48, paddingHorizontal: 13, fontSize: 15 },
  multiline: { minHeight: 105, paddingTop: 12 },
  button: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.holoCyan },
  button_secondary: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder },
  button_danger: { backgroundColor: 'rgba(244,116,106,0.12)', borderWidth: 1, borderColor: colors.danger },
  buttonText: { color: '#06120f', fontSize: 14, fontWeight: '800' },
  dangerText: { color: colors.danger },
  compact: { minHeight: 36, paddingHorizontal: 12 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  message: { color: colors.danger, backgroundColor: 'rgba(244,116,106,0.10)', borderRadius: 9, padding: 11, lineHeight: 18 },
  success: { color: colors.holoCyan, backgroundColor: 'rgba(94,234,212,0.08)' },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  empty: { color: colors.textDim, textAlign: 'center', lineHeight: 20 },
});

export const ui = styles;
