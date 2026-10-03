import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Button, Card, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function AppointmentsScreen() {
  const [received, setReceived] = useState([]); const [sent, setSent] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [incoming, outgoing] = await Promise.all([api.getReceivedAppointments(), api.getSentAppointments()]); setReceived(incoming); setSent(outgoing); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function respond(item, status) { try { await api.respondToAppointment(item._id, status); await load(); } catch (err) { setError(err.message); } }
  function remove(item) { Alert.alert('Remove appointment?', 'This removes it for both people.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { try { await api.deleteAppointment(item._id); await load(); } catch (err) { setError(err.message); } } }]); }
  return <Screen refreshing={loading} onRefresh={load}><Title subtitle="Meeting requests sent through huntsTAG contacts.">Appointments</Title><Message>{error}</Message>
    {loading && !received.length && !sent.length ? <Loading /> : <><Text style={styles.heading}>Received</Text>{!received.length ? <Empty>No incoming requests.</Empty> : received.map((item) => <Appointment key={item._id} item={item} name={item.fromName} incoming onRespond={respond} onDelete={remove} />)}
    <Text style={styles.heading}>Sent</Text>{!sent.length ? <Empty>No sent requests.</Empty> : sent.map((item) => <Appointment key={item._id} item={item} name={item.toName || item.toPhone || 'Contact'} onDelete={remove} />)}</>}
  </Screen>;
}

function Appointment({ item, name, incoming, onRespond, onDelete }) {
  return <Card style={styles.card}><View style={styles.row}><Text style={styles.name}>{name || 'Contact'}</Text><Text style={[styles.status, styles[`status_${item.status}`]]}>{item.status}</Text></View>
    <Text style={styles.date}>{item.proposedAt ? new Date(item.proposedAt).toLocaleString() : 'Time not set'}</Text>{item.note ? <Text style={styles.note}>{item.note}</Text> : null}
    <View style={styles.actions}>{incoming && item.status === 'pending' && <><Button compact title="Accept" onPress={() => onRespond(item, 'accepted')} style={styles.flex} /><Button compact title="Decline" kind="secondary" onPress={() => onRespond(item, 'declined')} style={styles.flex} /></>}<Button compact title="Remove" kind="danger" onPress={() => onDelete(item)} style={styles.flex} /></View>
  </Card>;
}

const styles = StyleSheet.create({ heading: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 4 }, card: { gap: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, name: { color: colors.text, fontWeight: '800', flex: 1 }, status: { color: colors.holoCyan, textTransform: 'capitalize', fontWeight: '800', fontSize: 12 }, status_declined: { color: colors.danger }, date: { color: colors.holoViolet, fontSize: 13, fontWeight: '700' }, note: { color: colors.textDim, lineHeight: 18 }, actions: { flexDirection: 'row', gap: 8, marginTop: 5 }, flex: { flex: 1 } });
