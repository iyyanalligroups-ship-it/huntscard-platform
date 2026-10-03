import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useAuth } from '../auth/AuthContext.js';
import DateTimeField from '../components/DateTimeField.js';
import { Button, Card, Field, Message, PasswordField, Screen, SelectField, Title } from '../components/ui.js';
import { onlyDigits } from '../lib/format.js';
import { colors } from '../theme/colors.js';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', gender: '', loginEmail: '', password: '', designation: '' });
  const [dob, setDob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, fn = (v) => v) => (value) => setForm((c) => ({ ...c, [key]: fn(value) }));

  async function submit() {
    setBusy(true); setError('');
    try {
      const dateOfBirth = dob ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}` : undefined;
      await register({ fullName: form.fullName, phone: form.phone, gender: form.gender || undefined, dateOfBirth, loginEmail: form.loginEmail.trim().toLowerCase(), password: form.password, designation: form.designation || undefined });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen><Card style={styles.form}>
      <Title subtitle="Free to sign up — pick and pay for your card once you're in.">Create your account</Title>
      <Field label="Full name" value={form.fullName} onChangeText={set('fullName')} />
      <Field label="Contact number" value={form.phone} onChangeText={set('phone', (v) => onlyDigits(v, 10))} keyboardType="number-pad" maxLength={10} hint="Enter exactly 10 digits." />
      <SelectField label="Gender (optional)" value={form.gender} onChange={set('gender')} options={[{ value: '', label: 'Prefer not to say' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
      <DateTimeField label="Date of birth (optional)" value={dob} onChange={setDob} maximumDate={new Date()} clearable placeholder="Select date" />
      <Field label="Email" value={form.loginEmail} onChangeText={set('loginEmail', (v) => v.toLowerCase())} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Designation (optional)" placeholder="e.g. Software Engineer, Manager" value={form.designation} onChangeText={set('designation')} />
      <PasswordField label="Password" value={form.password} onChangeText={set('password')} hint="At least 8 characters." />
      <Message>{error}</Message>
      <Button title={busy ? 'Creating account…' : 'Create account'} disabled={busy || !form.fullName || form.phone.length !== 10 || !form.loginEmail || form.password.length < 8} onPress={submit} />
      <Button kind="ghost" title="Already have an account? Log in" onPress={() => navigation.navigate('Login')} />
    </Card></Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: colors.space }, form: { gap: 14 } });
