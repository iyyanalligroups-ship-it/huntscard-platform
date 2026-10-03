import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Field, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', loginEmail: '', password: '', designation: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setBusy(true); setError('');
    try { await register({ ...form, loginEmail: form.loginEmail.trim().toLowerCase() }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen><Card style={styles.form}>
        <Title subtitle="Create the same client account used on the website.">Create account</Title>
        <Field label="Full name" value={form.fullName} onChangeText={set('fullName')} />
        <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field label="Email" value={form.loginEmail} onChangeText={set('loginEmail')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Designation (optional)" value={form.designation} onChangeText={set('designation')} />
        <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry />
        <Message>{error}</Message>
        <Button title={busy ? 'Creating…' : 'Create account'} disabled={busy || !form.fullName || !form.phone || !form.loginEmail || form.password.length < 8} onPress={submit} />
      </Card></Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: colors.space }, form: { gap: 14 } });
