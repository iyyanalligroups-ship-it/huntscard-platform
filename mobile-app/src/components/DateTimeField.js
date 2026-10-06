import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors.js';
import { Glyph } from './Glyph.js';
import { Button } from './ui.js';

// Date / date+time picker -- stands in for the web's ThemeDatePicker and
// <input type="datetime-local">. `value` / `onChange` use JS Date objects
// (or null when empty).
export default function DateTimeField({ label, value, onChange, mode = 'date', minimumDate, maximumDate, placeholder = 'Select…', clearable = false }) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(value || new Date());

  const text = value
    ? mode === 'datetime'
      ? value.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  function open() {
    const base = value || new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: base, mode: 'date', minimumDate, maximumDate,
        onChange: (event, picked) => {
          if (event.type !== 'set' || !picked) return;
          if (mode === 'date') return onChange(picked);
          DateTimePickerAndroid.open({
            value: picked, mode: 'time', is24Hour: false,
            onChange: (timeEvent, time) => {
              if (timeEvent.type !== 'set' || !time) return;
              const merged = new Date(picked);
              merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(merged);
            },
          });
        },
      });
    } else {
      setDraft(base);
      setIosOpen(true);
    }
  }

  return (
    <View style={{ gap: 7 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={open} style={styles.input}>
        <Glyph name="calendar" size={16} color={colors.text} />
        <Text style={{ color: text ? colors.text : colors.textDim, fontSize: 15, flex: 1 }}>{text || placeholder}</Text>
        {clearable && value ? <Pressable hitSlop={10} onPress={() => onChange(null)}><Glyph name="close" size={16} color={colors.text} /></Pressable> : null}
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <DateTimePicker value={draft} mode={mode === 'datetime' ? 'datetime' : 'date'} display="spinner" themeVariant="dark" minimumDate={minimumDate} maximumDate={maximumDate} onChange={(_, picked) => picked && setDraft(picked)} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Cancel" kind="secondary" onPress={() => setIosOpen(false)} style={{ flex: 1 }} />
                <Button title="Done" onPress={() => { onChange(draft); setIosOpen(false); }} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panelRaised },
  overlay: { flex: 1, backgroundColor: 'rgba(11,22,48,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.panel, padding: 18, gap: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
});
