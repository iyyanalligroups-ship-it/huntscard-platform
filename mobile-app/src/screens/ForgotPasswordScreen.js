import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { api } from '../api/client.js';
import { Button, Card, Field, Message, Screen, Title } from '../components/ui.js';

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function run() {
    setBusy(true); setError(''); setMessage('');
    try {
      if (step === 'email') {
        const result = await api.forgotPassword(email.trim());
        setMessage(result.message || 'If that account exists, a code has been sent.'); setStep('otp');
      } else if (step === 'otp') {
        const result = await api.verifyForgotPasswordOtp(email.trim(), otp.trim());
        setResetToken(result.token); setStep('password');
      } else {
        await api.resetPassword(resetToken, password); setMessage('Password updated. You can sign in now.');
        setTimeout(() => navigation.navigate('Login'), 700);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return <Screen><Card style={styles.form}>
    <Title subtitle="We’ll verify the code sent to your login email.">Reset password</Title>
    <Field label="Login email" value={email} onChangeText={setEmail} editable={step === 'email'} keyboardType="email-address" autoCapitalize="none" />
    {step === 'otp' && <Field label="Verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" />}
    {step === 'password' && <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry />}
    <Message>{error}</Message><Message tone="success">{message}</Message>
    <Button title={busy ? 'Please wait…' : step === 'email' ? 'Send code' : step === 'otp' ? 'Verify code' : 'Set new password'} disabled={busy} onPress={run} />
  </Card></Screen>;
}

const styles = StyleSheet.create({ form: { gap: 14 } });
