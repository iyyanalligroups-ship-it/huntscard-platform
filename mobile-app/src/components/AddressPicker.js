import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client.js';
import { onlyDigits } from '../lib/format.js';
import { colors } from '../theme/colors.js';
import { Glyph } from './Glyph.js';
import { Button, Field, Loading, Message, SelectField } from './ui.js';

const COUNTRY_ISO = 'IN';
const COUNTRY_NAME = 'India';

const emptyForm = { label: '', name: '', phone: '', line1: '', line2: '', stateIso: '', stateName: '', cityName: '', pincode: '' };

// Saved delivery addresses + "add new address" form -- shared by the card
// checkout (Shop) and the Magic Poster cart, like the website's two inline
// copies of this block.
export default function AddressPicker({ profile, selectedId, onSelect, onAddressesChange }) {
  const [addresses, setAddresses] = useState(null);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listAddresses(), api.getStates(COUNTRY_ISO).catch(() => [])])
      .then(([list, stateList]) => {
        if (cancelled) return;
        setAddresses(list);
        setStates(stateList);
        onAddressesChange?.(list);
        const preferred = list.find((address) => address.isDefault) || list[0];
        if (preferred) onSelect(preferred._id, preferred);
        else setShowForm(true);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile) return;
    setForm((current) => ({ ...current, name: current.name || profile.fullName || '', phone: current.phone || onlyDigits(profile.phone, 10) }));
  }, [profile]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  function pickState(iso, option) {
    setForm((current) => ({ ...current, stateIso: iso, stateName: option.label, cityName: '' }));
    setCities([]);
    api.getCities(COUNTRY_ISO, iso).then(setCities).catch(() => {});
  }

  async function save() {
    setError('');
    if (!form.name.trim() || !form.line1.trim()) return setError('Enter the delivery name and street address.');
    if (form.phone.length !== 10) return setError('Enter a valid 10-digit phone number.');
    if (form.pincode.length !== 6) return setError('Enter a valid 6-digit pincode.');
    if (!form.stateName || !form.cityName) return setError('Choose a state and city.');
    setSaving(true);
    try {
      const created = await api.createAddress({
        label: form.label, name: form.name, phone: form.phone, line1: form.line1, line2: form.line2,
        country: COUNTRY_NAME, state: form.stateName, city: form.cityName, pincode: form.pincode,
        isDefault: (addresses?.length || 0) === 0,
      });
      const next = [created, ...(addresses || [])];
      setAddresses(next);
      onAddressesChange?.(next);
      onSelect(created._id, created);
      setShowForm(false);
      setForm((current) => ({ ...emptyForm, name: current.name, phone: current.phone }));
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  if (addresses === null && !error) return <Loading label="Loading your addresses…" />;

  return (
    <View style={{ gap: 10 }}>
      {(addresses || []).map((address) => {
        const selected = selectedId === address._id;
        return (
          <Pressable key={address._id} onPress={() => { onSelect(address._id, address); setShowForm(false); }} style={[styles.address, selected && styles.addressSelected]}>
            <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Glyph name="check" size={12} color="#ffffff" strokeWidth={3} /> : null}</View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.addressName}>{address.label ? `${address.label} — ` : ''}{address.name} · {address.phone}</Text>
              <Text style={styles.addressLine}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state}, {address.country} - {address.pincode}</Text>
            </View>
          </Pressable>
        );
      })}
      <Message>{error}</Message>
      <Button compact kind="secondary" icon={showForm ? 'close' : 'plus'} title={showForm ? 'Cancel' : 'Add new address'} onPress={() => setShowForm((v) => !v)} style={{ alignSelf: 'flex-start' }} />
      {showForm ? (
        <View style={styles.form}>
          <Field label="Label (optional)" value={form.label} onChangeText={set('label')} placeholder="Home" />
          <Field label="Full name" value={form.name} onChangeText={set('name')} />
          <Field label="Phone" value={form.phone} onChangeText={(v) => set('phone')(onlyDigits(v, 10))} keyboardType="number-pad" maxLength={10} />
          <Field label="Address line 1" value={form.line1} onChangeText={set('line1')} />
          <Field label="Address line 2 (optional)" value={form.line2} onChangeText={set('line2')} />
          <SelectField label="Country" value={COUNTRY_ISO} options={[{ value: COUNTRY_ISO, label: COUNTRY_NAME }]} onChange={() => {}} disabled />
          <SelectField label="State" value={form.stateIso} options={states.map((state) => ({ value: state.isoCode, label: state.name }))} onChange={pickState} placeholder="Select state" searchable />
          <SelectField label="City" value={form.cityName} options={cities.map((city) => ({ value: city, label: city }))} onChange={(value) => set('cityName')(value)} placeholder="Select city" searchable disabled={!form.stateIso} />
          <Field label="Pincode" value={form.pincode} onChangeText={(v) => set('pincode')(onlyDigits(v, 6))} keyboardType="number-pad" maxLength={6} />
          <Button icon="badgeCheck" title={saving ? 'Saving…' : 'Save address'} disabled={saving} onPress={save} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  address: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panelRaised },
  addressSelected: { borderColor: colors.holoCyan },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioOn: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan },
  addressName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  addressLine: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  form: { gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder },
});
