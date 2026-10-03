import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Field, Message, Screen, Title } from '../components/ui.js';

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
    <Field label="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
    <Field label="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
    <Field label="Confirm new password" secureTextEntry value={confirm} onChangeText={setConfirm} />
    <Message>{error}</Message>
    <Button title={busy ? 'Saving…' : 'Save password'} disabled={busy || newPassword.length < 8} onPress={submit} />
    <Button title="Sign out" kind="secondary" onPress={signOut} />
  </Card></Screen>;
}

const styles = StyleSheet.create({ form: { gap: 14 } });
