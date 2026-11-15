import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Message, PasswordField, Screen, Title } from '../components/ui.js';
import { MIN_PASSWORD_LENGTH, newPasswordError, confirmError } from '../lib/passwordRules.js';

export default function ChangePasswordScreen() {
  const { completePasswordChange, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (newPassword !== confirm) return setError('New passwords do not match.');
    setBusy(true); setError('');
    try { await api.changePassword(currentPassword, newPassword); await completePasswordChange(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <Screen><Card style={styles.form}>
    <Title subtitle="Your temporary password must be replaced before continuing.">Choose a new password</Title>
    <PasswordField label="Temporary password" placeholder="Enter your temporary password" value={currentPassword} onChangeText={setCurrentPassword} />
    <PasswordField label="New password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} value={newPassword} onChangeText={setNewPassword} error={newPasswordError(newPassword, currentPassword)} />
    <PasswordField label="Confirm new password" placeholder="Re-enter the new password" value={confirm} onChangeText={setConfirm} error={confirmError(newPassword, confirm)} />
    <Message>{error}</Message>
    <Button title={busy ? 'Saving…' : 'Save password'} disabled={busy || !currentPassword || newPassword.length < MIN_PASSWORD_LENGTH || newPassword === currentPassword || newPassword !== confirm} onPress={submit} />
    <Button title="Sign out" kind="secondary" onPress={signOut} />
  </Card></Screen>;
}

const styles = StyleSheet.create({ form: { gap: 14 } });
