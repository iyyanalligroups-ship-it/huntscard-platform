import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Field, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function AccountScreen() {
  const { signOut } = useAuth(); const [profile, setProfile] = useState(null); const [cards, setCards] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [p, c] = await Promise.all([api.getProfile(), api.getMyCards()]); setProfile(p); setCards(c); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function toggleAccount() { setBusy(true); setError(''); try { profile.cardActive === false ? await api.unpauseCard() : await api.pauseCard(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function toggleCard(card) { setBusy(true); setError(''); try { await (card.active === false ? api.unpauseMyCard(card.cardNumber) : api.pauseMyCard(card.cardNumber)); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function changePassword() { setBusy(true); setError(''); setSaved(''); try { await api.changePassword(passwords.current, passwords.next); setPasswords({ current: '', next: '' }); setSaved('Password changed.'); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  if (loading || !profile) return <Screen><Loading /></Screen>;
  return <Screen><Title subtitle={profile.loginEmail}>Account & cards</Title><Message>{error}</Message><Message tone="success">{saved}</Message>
    <Card style={styles.card}><View style={styles.row}><View style={styles.flex}><Text style={styles.heading}>Public profile</Text><Text style={styles.dim}>{profile.cardActive === false ? 'Paused — visitors cannot open it' : 'Active and visible to visitors'}</Text></View><Text style={[styles.badge, profile.cardActive === false && styles.off]}>{profile.cardActive === false ? 'Paused' : 'Active'}</Text></View><Button title={profile.cardActive === false ? 'Reactivate public profile' : 'Pause public profile'} kind={profile.cardActive === false ? 'primary' : 'danger'} disabled={busy} onPress={() => Alert.alert('Confirm', profile.cardActive === false ? 'Reactivate your public card?' : 'Pause your public card for all visitors?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: toggleAccount }])} /></Card>
    <Text style={styles.section}>Physical cards</Text>{cards.map((card) => <Card key={card.cardNumber} style={styles.card}><View style={styles.row}><View style={styles.flex}><Text style={styles.heading}>Card {card.cardNumber} · {card.label || card.variantName || card.planName || 'huntsTAG'}</Text><Text style={styles.dim}>{card.cardType || profile.cardType}</Text></View><Text style={[styles.badge, card.active === false && styles.off]}>{card.active === false ? 'Paused' : 'Active'}</Text></View><Button compact title={card.active === false ? 'Activate card' : 'Pause card'} kind="secondary" disabled={busy} onPress={() => toggleCard(card)} /></Card>)}
    <Card style={styles.card}><Text style={styles.heading}>Change password</Text><Field label="Current password" secureTextEntry value={passwords.current} onChangeText={(value) => setPasswords((p) => ({ ...p, current: value }))} /><Field label="New password" secureTextEntry value={passwords.next} onChangeText={(value) => setPasswords((p) => ({ ...p, next: value }))} /><Button title={busy ? 'Saving…' : 'Change password'} disabled={busy || passwords.next.length < 8} onPress={changePassword} /></Card>
    <Button title="Sign out" kind="danger" onPress={signOut} />
  </Screen>;
}

const styles = StyleSheet.create({ card: { gap: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1 }, heading: { color: colors.text, fontWeight: '800', fontSize: 15 }, dim: { color: colors.textDim, fontSize: 12, marginTop: 4 }, badge: { color: colors.holoCyan, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' }, off: { color: colors.danger }, section: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 3 } });
