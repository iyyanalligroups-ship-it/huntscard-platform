import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, resolveAssetUrl } from '../api/client.js';
import { Button, Card, Field, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const fields = [
  ['fullName', 'Full name'], ['jobTitle', 'Job title'],
  ['bio', 'Bio'], ['phone', 'Phone number'], ['whatsapp', 'WhatsApp number'],
  ['publicEmail', 'Public email'], ['portfolioUrl', 'Portfolio URL'],
  ['instagramUrl', 'Instagram URL'], ['twitterUrl', 'Twitter / X URL'], ['huntsworldUrl', 'Huntsworld URL'],
];

export default function ProfileScreen() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setForm(await api.getProfile()); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (key) => (value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(''); };
  async function save() {
    setBusy(true); setError(''); setSaved('');
    try {
      const payload = Object.fromEntries(fields.map(([key]) => [key, form[key] || '']));
      const updated = await api.updateProfile(payload); setForm(updated); setSaved('Profile saved.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Photo library permission is required.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled) return;
    setBusy(true); setError('');
    try { setForm(await api.uploadPhoto(result.assets[0])); setSaved('Photo saved.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (loading || !form) return <Screen><Loading label="Loading profile…" /><Message>{error}</Message></Screen>;
  return <Screen>
    <Title subtitle="These details appear on your public huntsTAG profile.">Profile settings</Title>
    <Card style={styles.photoCard}>
      {form.photoUrl ? <Image source={{ uri: resolveAssetUrl(form.photoUrl) }} style={styles.photo} /> : <View style={styles.photoFallback}><Text style={styles.initial}>{(form.fullName || '?')[0]}</Text></View>}
      <Button compact title={busy ? 'Please wait…' : 'Change photo'} kind="secondary" onPress={choosePhoto} disabled={busy} />
    </Card>
    <Card style={styles.form}>
      {fields.map(([key, label]) => <Field key={key} label={label} value={String(form[key] || '')} onChangeText={set(key)} multiline={key === 'bio'} autoCapitalize={key.includes('Url') || key.includes('Email') ? 'none' : 'sentences'} keyboardType={key.includes('Email') ? 'email-address' : key === 'phone' || key === 'whatsapp' ? 'phone-pad' : 'default'} maxLength={key === 'bio' ? 280 : undefined} />)}
      <Message>{error}</Message><Message tone="success">{saved}</Message>
      <Button title={busy ? 'Saving…' : 'Save profile'} disabled={busy || !form.fullName?.trim()} onPress={save} />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  photoCard: { alignItems: 'center', gap: 13 },
  photo: { width: 108, height: 108, borderRadius: 54 },
  photoFallback: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.holoCyan, fontSize: 38, fontWeight: '900' },
  form: { gap: 15 },
});
