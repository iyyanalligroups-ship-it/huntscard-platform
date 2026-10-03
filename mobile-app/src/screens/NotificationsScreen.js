import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { timeAgo } from '../lib/format.js';
import { colors } from '../theme/colors.js';

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const data = await api.getNotifications(); setItems(data.notifications || []); setError(''); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function markRead(id) {
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    try { await api.markNotificationRead(id); } catch { load(); }
  }

  return <Screen refreshing={false} onRefresh={load}>
    <Title subtitle="Shown when someone shares their contact with you or your card is used.">Notifications</Title>
    <Message>{error}</Message>
    {loading ? <Loading /> : !items.length ? <Empty>No notifications yet.</Empty> : items.map((n) => (
      <Pressable key={n._id} onPress={() => !n.read && markRead(n._id)} style={[styles.item, !n.read && styles.unread]}>
        <View style={{ flex: 1, gap: 4 }}><Text style={styles.msg}>{n.message}</Text><Text style={styles.time}>{timeAgo(n.createdAt)}</Text></View>
        {!n.read ? <View style={styles.dot} /> : null}
      </Pressable>
    ))}
  </Screen>;
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel },
  unread: { backgroundColor: 'rgba(79,142,247,0.10)', borderColor: 'rgba(79,142,247,0.35)' },
  msg: { color: colors.text, lineHeight: 20 }, time: { color: colors.textDim, fontSize: 11 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.holoCyan },
});
