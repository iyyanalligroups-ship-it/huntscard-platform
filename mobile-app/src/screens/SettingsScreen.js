import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Loading, Message, PasswordField, Pill, Screen, SectionTitle, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

function confirm(title, message, confirmLabel, onConfirm) {
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: confirmLabel, style: 'destructive', onPress: onConfirm }]);
}

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const [cardActive, setCardActive] = useState(null);
  const [cards, setCards] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [cardsError, setCardsError] = useState('');
  const [busyCard, setBusyCard] = useState(null);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    api.getProfile().then((p) => setCardActive(p.cardActive !== false)).catch(() => {});
    api.getMyCards().then(setCards).catch((err) => setCardsError(err.message));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setSaved(false); };

  async function submitPassword() {
    setError(''); setSaved(false);
    if (form.next !== form.confirm) return setError("New passwords don't match.");
    setSaving(true);
    try { await api.changePassword(form.current, form.next); setForm({ current: '', next: '', confirm: '' }); setSaved(true); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function togglePause() {
    setStatusError(''); setStatusBusy(true);
    try { if (cardActive) { await api.pauseCard(); setCardActive(false); } else { await api.unpauseCard(); setCardActive(true); } }
    catch (err) { setStatusError(err.message); } finally { setStatusBusy(false); }
  }

  async function toggleCard(card) {
    setCardsError(''); setBusyCard(card.cardNumber);
    try {
      const updated = card.active ? await api.pauseMyCard(card.cardNumber) : await api.unpauseMyCard(card.cardNumber);
      setCards((prev) => prev.map((c) => (c.cardNumber === card.cardNumber ? updated : c)));
    } catch (err) { setCardsError(err.message); } finally { setBusyCard(null); }
  }

  return <Screen refreshing={false} onRefresh={load}>
    <Title subtitle="Change your password whenever you like.">Settings</Title>
    <Card style={{ gap: 14 }}>
      <SectionTitle>Change password</SectionTitle>
      <Message>{error}</Message>
      {saved && !error ? <Message tone="success">Password updated.</Message> : null}
      <PasswordField label="Current password" value={form.current} onChangeText={set('current')} />
      <PasswordField label="New password" value={form.next} onChangeText={set('next')} hint="At least 8 characters." />
      <PasswordField label="Confirm new password" value={form.confirm} onChangeText={set('confirm')} />
      <Button title={saving ? 'Saving…' : 'Update password'} disabled={saving || !form.current || form.next.length < 8} onPress={submitPassword} />
    </Card>

    {cardActive === null ? <Loading /> : <Card style={{ gap: 12 }}>
      <SectionTitle>Card status</SectionTitle>
      <Text style={styles.dim}>{cardActive ? 'Your card is active. Anyone who taps or scans it sees your live profile.' : 'Your card is deactivated. Anyone who taps or scans it sees a "card deactivated" message -- your profile, vCard, and AR experience are all hidden until you reactivate it.'}</Text>
      <Message>{statusError}</Message>
      <Button kind={cardActive ? 'danger' : 'primary'} title={statusBusy ? 'Saving…' : cardActive ? 'Deactivate card' : 'Reactivate card'} disabled={statusBusy}
        onPress={() => (cardActive ? confirm('Deactivate your card?', 'Anyone who taps or scans it will see a "card deactivated" message until you turn it back on.', 'Deactivate', togglePause) : togglePause())} />
    </Card>}

    {cards?.length ? <Card style={{ gap: 12 }}>
      <SectionTitle hint="Each physical card you've been issued, listed separately -- deactivating one only affects that specific card, not the others.">Your cards</SectionTitle>
      <Message>{cardsError}</Message>
      {cards.map((card) => <View key={card.cardNumber} style={styles.cardRow}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={styles.name}>Card #{card.cardNumber}</Text>{!card.active ? <Pill tone="danger">Deactivated</Pill> : null}</View>
          <Text style={styles.dim}>{card.cardType || 'No plan set'} · {card.encoded ? 'Encoded' : 'Not yet encoded'}</Text>
        </View>
        <Button compact kind={card.active ? 'secondary' : 'primary'} title={busyCard === card.cardNumber ? 'Saving…' : card.active ? 'Deactivate' : 'Reactivate'} disabled={busyCard === card.cardNumber}
          onPress={() => (card.active ? confirm(`Deactivate card #${card.cardNumber}?`, 'Anyone who taps or scans THIS specific physical card will see a "card deactivated" message until you turn it back on.', 'Deactivate', () => toggleCard(card)) : toggleCard(card))} />
      </View>)}
    </Card> : null}

    <Button kind="danger" icon="logout" title="Log out" onPress={() => confirm('Log out?', 'You will need to sign in again to use your dashboard.', 'Log out', signOut)} />
  </Screen>;
}

const styles = StyleSheet.create({
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 }, name: { color: colors.text, fontWeight: '800' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder },
});
