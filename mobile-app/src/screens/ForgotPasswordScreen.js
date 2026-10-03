import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { api } from '../api/client.js';
import { Button, Card, Field, Message, PasswordField, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const COOLDOWN = 45;

const COPY = {
  email: ['Forgot your password?', "Enter your account email and we'll send a secure 6-digit verification code."],
  otp: ['Enter your code', 'Enter the 6-digit code we emailed you to continue.'],
  password: ['Create a new password', 'Choose a strong password with at least 8 characters.'],
  done: ['Password updated', 'Your password has been changed successfully. You can now sign in with it.'],
};

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  function startCooldown() {
    setCooldown(COOLDOWN); clearInterval(timer.current);
    timer.current = setInterval(() => setCooldown((s) => { if (s <= 1) { clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  }

  const run = (fn) => async () => { setBusy(true); setError(''); try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); } };

  const sendCode = run(async () => { await api.forgotPassword(email.trim()); setStep('otp'); startCooldown(); });
  const resend = run(async () => { await api.forgotPassword(email.trim()); setOtp(''); startCooldown(); });
  const verify = run(async () => { const r = await api.verifyForgotPasswordOtp(email.trim(), otp.trim()); setToken(r.token); setStep('password'); clearInterval(timer.current); });
  const reset = run(async () => {
    if (password !== confirm) throw new Error('Passwords do not match');
    await api.resetPassword(token, password); setStep('done');
  });

  const [title, description] = COPY[step];
  return <Screen><Card style={styles.form}>
    <Text style={styles.step}>{step === 'done' ? 'Recovery complete' : `Step ${step === 'email' ? 1 : step === 'otp' ? 2 : 3} of 3`}</Text>
    <Title subtitle={step === 'otp' ? `We sent a 6-digit code to ${email}. Enter it below to continue.` : description}>{title}</Title>
    <Message>{error}</Message>
    {step === 'email' ? <>
      <Field label="Account email" placeholder="name@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button title={busy ? 'Sending…' : 'Send verification code'} disabled={busy || !email.trim()} onPress={sendCode} />
    </> : null}
    {step === 'otp' ? <>
      <Field label="Verification code" placeholder="Enter 6-digit code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
      <Button title={busy ? 'Verifying…' : 'Verify code'} disabled={busy || otp.length < 4} onPress={verify} />
      <Button kind="secondary" title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'} disabled={busy || cooldown > 0} onPress={resend} />
      <Button kind="ghost" title="Change email" onPress={() => { setStep('email'); setOtp(''); setError(''); clearInterval(timer.current); setCooldown(0); }} />
    </> : null}
    {step === 'password' ? <>
      <PasswordField label="New password" placeholder="Minimum 8 characters" value={password} onChangeText={setPassword} />
      <PasswordField label="Confirm new password" placeholder="Repeat your new password" value={confirm} onChangeText={setConfirm} />
      <Button title={busy ? 'Resetting…' : 'Reset password'} disabled={busy || password.length < 8} onPress={reset} />
    </> : null}
    {step === 'done' ? <Button title="Continue to login" onPress={() => navigation.navigate('Login')} /> : <Button kind="ghost" title="Back to login" onPress={() => navigation.navigate('Login')} />}
  </Card></Screen>;
}

const styles = StyleSheet.create({ form: { gap: 14 }, step: { color: colors.holoCyan, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 } });
