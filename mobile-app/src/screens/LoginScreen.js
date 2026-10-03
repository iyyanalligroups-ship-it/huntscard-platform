import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext.js';
import { api } from '../api/client.js';
import { Button, Card, Field, Message, Screen, Title, ui } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function LoginScreen({ navigation }) {
  const { signIn, signInWithOtp } = useAuth();
  const [mode, setMode] = useState('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submitPassword() {
    setBusy(true); setError('');
    try { await signIn(identifier.trim(), password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function requestOtp() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await api.requestLoginOtp(phone.trim());
      setOtpSent(true);
      setMessage(response.message || 'OTP sent.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function verifyOtp() {
    setBusy(true); setError('');
    try { await signInWithOtp(phone.trim(), otp.trim()); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={styles.content}>
        <View style={styles.brand}><Text style={styles.logo}>huntsTAG</Text><Text style={styles.tagline}>Your smart identity, in your pocket.</Text></View>
        <Card style={styles.form}>
          <Title subtitle="Use the same account as the huntsTAG client website.">Welcome back</Title>
          <View style={styles.tabs}>
            <Button compact title="Password" kind={mode === 'password' ? 'primary' : 'secondary'} onPress={() => setMode('password')} style={styles.tab} />
            <Button compact title="Phone OTP" kind={mode === 'otp' ? 'primary' : 'secondary'} onPress={() => setMode('otp')} style={styles.tab} />
          </View>
          {mode === 'password' ? <>
            <Field label="Email or phone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
            <Button title={busy ? 'Signing in…' : 'Sign in'} disabled={busy || !identifier.trim() || !password} onPress={submitPassword} />
          </> : <>
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            {otpSent && <Field label="6-digit OTP" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />}
            <Button title={busy ? 'Please wait…' : otpSent ? 'Verify OTP' : 'Send OTP'} disabled={busy || !phone.trim() || (otpSent && otp.length < 4)} onPress={otpSent ? verifyOtp : requestOtp} />
          </>}
          <Message>{error}</Message><Message tone="success">{message}</Message>
          <Button title="Create an account" kind="secondary" onPress={() => navigation.navigate('Register')} />
          <Button title="Forgot password?" kind="secondary" onPress={() => navigation.navigate('ForgotPassword')} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.space },
  content: { flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 10 },
  logo: { color: colors.holoCyan, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  tagline: { ...ui.subtitle, textAlign: 'center' },
  form: { gap: 14 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1 },
});
