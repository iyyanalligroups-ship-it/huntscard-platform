import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Glyph } from './Glyph.js';
import { colors, radius } from '../theme/colors.js';

export function Screen({ children, refreshing, onRefresh, contentStyle, scroll = true }) {
  if (!scroll) return <SafeAreaView style={styles.safe} edges={['bottom']}>{children}</SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.safe}
        contentContainerStyle={[styles.screen, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.holoCyan} colors={[colors.holoCyan]} /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children, subtitle, eyebrow }) {
  return (
    <View style={styles.titleWrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, hint }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Field({ label, multiline, style, hint, error, right, ...props }) {
  return (
    <View style={[styles.fieldWrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View>
        <TextInput
          placeholderTextColor={colors.textDim}
          style={[styles.input, multiline && styles.multiline, error && styles.inputError, right && { paddingRight: 46 }]}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...props}
        />
        {right ? <View style={styles.inputRight}>{right}</View> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PasswordField({ label, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={label}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      right={<Pressable hitSlop={10} onPress={() => setVisible((v) => !v)}><Glyph name={visible ? 'eyeOff' : 'eye'} color={colors.textDim} size={18} /></Pressable>}
      {...props}
    />
  );
}

export function Button({ title, onPress, disabled, kind = 'primary', compact = false, style, icon, loading }) {
  const iconColor = kind === 'primary' ? '#ffffff' : kind === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, styles[`button_${kind}`], compact && styles.compact, pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}
    >
      {loading ? <ActivityIndicator size="small" color={iconColor} /> : icon ? <Glyph name={icon} size={compact ? 15 : 17} color={iconColor} /> : null}
      <Text style={[styles.buttonText, kind === 'secondary' && styles.secondaryText, kind === 'ghost' && styles.secondaryText, kind === 'danger' && styles.dangerText]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, color = colors.text, size = 18, style, badge, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && styles.disabled, style]}>
      <Glyph name={name} color={color} size={size} />
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
    </Pressable>
  );
}

export function Message({ children, tone = 'error' }) {
  if (!children) return null;
  return <Text style={[styles.message, tone === 'success' && styles.success, tone === 'info' && styles.info]}>{children}</Text>;
}

export function Loading({ label = 'Loading…' }) {
  return <View style={styles.loading}><ActivityIndicator color={colors.holoCyan} /><Text style={styles.subtitle}>{label}</Text></View>;
}

export function Empty({ children, action }) {
  return <Card><Text style={styles.empty}>{children}</Text>{action}</Card>;
}

export function Pill({ children, tone = 'cyan', style }) {
  const tones = { cyan: colors.holoCyan, violet: colors.holoViolet, danger: colors.danger, warning: colors.warning, dim: colors.textDim };
  const color = tones[tone] || tone;
  return <Text style={[styles.pill, { color, borderColor: color }, style]}>{children}</Text>;
}

export function Tabs({ tabs, value, onChange, style }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={{ gap: 8 }}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={[styles.tab, active && styles.tabActive]}>
            {tab.icon ? <Glyph name={tab.icon} size={14} color={active ? '#ffffff' : colors.textDim} /> : null}
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Avatar({ uri, name, size = 44, style }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return uri ? (
    <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.panelRaised }, style]} />
  ) : (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: colors.holoCyan, fontWeight: '900', fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, disabledPlus }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} disabled={value <= min} style={[styles.stepBtn, value <= min && styles.disabled]}><Glyph name="minus" size={14} /></Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} disabled={value >= max || disabledPlus} style={[styles.stepBtn, (value >= max || disabledPlus) && styles.disabled]}><Glyph name="plus" size={14} /></Pressable>
    </View>
  );
}

// Bottom sheet used for every "modal card" the website renders with
// .auth-modal-backdrop -- forms, previews, confirmations.
export function Sheet({ visible, onClose, title, children, footer }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={[styles.title, { fontSize: 19, flex: 1 }]} numberOfLines={1}>{title}</Text>
            <IconButton name="close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>{children}</ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Searchable select -- stands in for the web's ThemedSelect / GeoSelect.
export function SelectField({ label, value, options, onChange, placeholder = 'Select…', searchable = false, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find((option) => String(option.value) === String(value));
  const filtered = query ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())) : options;
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable disabled={disabled} onPress={() => { setQuery(''); setOpen(true); }} style={[styles.input, styles.select, disabled && styles.disabled]}>
        <Text style={{ color: current ? colors.text : colors.textDim, fontSize: 15, flex: 1 }} numberOfLines={1}>{current ? current.label : placeholder}</Text>
        <Glyph name="chevronDown" size={16} color={colors.textDim} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '75%' }]}>
            <Text style={[styles.title, { fontSize: 18 }]}>{label || placeholder}</Text>
            {searchable ? <Field value={query} onChangeText={setQuery} placeholder="Search…" autoCapitalize="none" /> : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.value)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>Nothing found.</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => { onChange(item.value, item); setOpen(false); }} style={styles.option}>
                  <Text style={{ color: String(item.value) === String(value) ? colors.holoCyan : colors.text, fontSize: 15, flex: 1 }}>{item.label}</Text>
                  {String(item.value) === String(value) ? <Glyph name="check" size={16} color={colors.holoCyan} /> : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function Accordion({ title, children, defaultOpen = false, index }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.accordion}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.accordionHead}>
        {index != null ? <Text style={styles.accordionIndex}>{String(index + 1).padStart(2, '0')}</Text> : null}
        <Text style={[styles.accordionTitle, { flex: 1 }]}>{title}</Text>
        <Glyph name={open ? 'chevronUp' : 'chevronDown'} size={16} color={colors.textDim} />
      </Pressable>
      {open ? <View style={{ paddingTop: 10 }}>{children}</View> : null}
    </View>
  );
}

export function Row({ label, value, strong }) {
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { color: colors.holoCyan, fontWeight: '900', fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.panelBorder, marginVertical: 4 }} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.space },
  screen: { padding: 18, paddingBottom: 42, gap: 14 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius, padding: 16 },
  titleWrap: { marginBottom: 4 },
  eyebrow: { color: colors.holoCyan, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 5 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  fieldWrap: { gap: 7 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { color: colors.text, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 10, minHeight: 48, paddingHorizontal: 13, fontSize: 15 },
  inputError: { borderColor: colors.danger },
  inputRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 46, alignItems: 'center', justifyContent: 'center' },
  fieldError: { color: colors.danger, fontSize: 12 },
  multiline: { minHeight: 105, paddingTop: 12 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.holoCyan, flexDirection: 'row', gap: 8 },
  button_secondary: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: 'rgba(220,38,38,0.12)', borderWidth: 1, borderColor: colors.danger },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  secondaryText: { color: colors.text },
  dangerText: { color: colors.danger },
  compact: { minHeight: 36, paddingHorizontal: 12 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  message: { color: colors.danger, backgroundColor: 'rgba(220,38,38,0.10)', borderRadius: 9, padding: 11, lineHeight: 18, overflow: 'hidden' },
  success: { color: colors.holoCyan, backgroundColor: 'rgba(21,101,255,0.08)' },
  info: { color: colors.textDim, backgroundColor: colors.panelRaised },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  empty: { color: colors.textDim, textAlign: 'center', lineHeight: 20 },
  pill: { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, textTransform: 'uppercase', overflow: 'hidden', alignSelf: 'flex-start' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder },
  tabActive: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#ffffff' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: colors.text, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(11,22,48,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.panelBorder },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.panelBorder },
  accordion: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius, padding: 14 },
  accordionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accordionIndex: { color: colors.holoCyan, fontWeight: '900', fontSize: 12 },
  accordionTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  rowLabel: { color: colors.textDim, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
});

export const ui = styles;
