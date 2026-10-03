import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Field, Message, Screen, Title } from '../components/ui.js';
import { onlyDigits } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

function validate(fields) {
  const errors = {};
  if (!fields.name.trim()) errors.name = 'Name is required';
  const phone = onlyDigits(fields.phone);
  if (!phone) errors.phone = 'Phone number is required';
  else if (phone.length !== 10) errors.phone = `Phone number must be exactly 10 digits (${phone.length}/10)`;
  const email = fields.email.trim().toLowerCase();
  if (!email) errors.email = 'Email address is required';
  else if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address (e.g. name@domain.com)';
  if (!fields.message.trim()) errors.message = 'Message cannot be empty';
  return errors;
}

export default function ContactUsScreen() {
  const { session } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!session) return;
    api.getProfile().then((p) => setForm((f) => ({
      ...f,
      name: f.name || p.fullName || '',
      phone: f.phone || onlyDigits(p.phone, 10),
      email: f.email || (p.loginEmail || '').toLowerCase(),
    }))).catch(() => {});
  }, [session]);

  const errors = validate(form);
  const set = (key, transform = (v) => v) => (value) => setForm((f) => ({ ...f, [key]: transform(value) }));
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const show = (key) => (touched[key] ? errors[key] : undefined);

  async function submit() {
    setTouched({ name: true, phone: true, email: true, message: true });
    if (Object.keys(errors).length) return setError('Please resolve the errors below before submitting.');
    setError(''); setSending(true);
    try {
      await api.submitContactForm({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim().toLowerCase(), message: form.message.trim() });
      setForm((f) => ({ ...f, message: '' })); setTouched({}); setSent(true);
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen>
      <Title subtitle="Questions about a plan, an order, or anything else — we'll get back to you.">Get in touch</Title>
      <Card><Text style={styles.addr}>Puducherry, India</Text><Text style={styles.addrSub}>Iyyanalli Groups</Text></Card>
      {sent ? <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 28 }}>
        <Text style={styles.sentTitle}>Message sent — thanks!</Text>
        <Text style={styles.addrSub}>We'll get back to you soon.</Text>
        <Button title="Send another message" kind="secondary" onPress={() => setSent(false)} />
      </Card> : <Card style={{ gap: 14 }}>
        <Message>{error}</Message>
        <Field label="Name" placeholder="Your full name" value={form.name} onChangeText={set('name')} onBlur={blur('name')} error={show('name')} />
        <Field label="Phone number (10 digits)" placeholder="e.g. 9876543210" keyboardType="number-pad" maxLength={10} value={form.phone} onChangeText={set('phone', (v) => onlyDigits(v, 10))} onBlur={blur('phone')} error={show('phone')} />
        <Field label="Email (lowercase)" placeholder="yourname@domain.com" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set('email', (v) => v.toLowerCase())} onBlur={blur('email')} error={show('email')} />
        <Field label="Message" placeholder="How can we help you?" multiline value={form.message} onChangeText={set('message')} onBlur={blur('message')} error={show('message')} />
        <Button title={sending ? 'Sending…' : 'Send message'} disabled={sending} onPress={submit} />
      </Card>}
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.space },
  addr: { color: colors.text, fontWeight: '800', fontSize: 15 }, addrSub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  sentTitle: { color: colors.holoCyan, fontWeight: '800', fontSize: 18 },
});
