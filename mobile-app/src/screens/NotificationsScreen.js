import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Button, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { timeAgo } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const PAGE = 20;

// Every notification, newest first, with mark-read and delete (same as the website's Notifications page).
export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.getNotifications({ limit: PAGE, skip: 0 });
      setItems(r.notifications || []); setTotal(r.total || 0); setUnread(r.unreadCount || 0); setHasMore(Boolean(r.hasMore)); setError('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await api.getNotifications({ limit: PAGE, skip: items.length });
      setItems((cur) => { const have = new Set(cur.map((n) => n._id)); return [...cur, ...(r.notifications || []).filter((n) => !have.has(n._id))]; });
      setTotal(r.total || 0); setHasMore(Boolean(r.hasMore));
    } catch (err) { setError(err.message); } finally { setLoadingMore(false); }
  }

  async function markRead(n) {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try { await api.markNotificationRead(n._id); } catch { load(); }
  }

  async function open(n) {
    await markRead(n);
    // Links look like web paths (/dashboard/tickets...); only a few have a screen here, so we just mark read.
    if (n.link && /track/i.test(n.link)) navigation.navigate('Track');
  }

  async function remove(n) {
    setError('');
    try {
      await api.deleteNotification(n._id);
      setItems((cur) => cur.filter((x) => x._id !== n._id));
      setTotal((t) => Math.max(0, t - 1));
      if (!n.read) setUnread((u) => Math.max(0, u - 1));
      setNote('Notification deleted.');
    } catch (err) { setError(err.message); }
  }

  async function markAll() {
    setError('');
    try { await api.markAllNotificationsRead(); setItems((cur) => cur.map((n) => ({ ...n, read: true }))); setUnread(0); setNote('All notifications marked as read.'); }
    catch (err) { setError(err.message); }
  }

  function clear(scope) {
    const label = scope === 'all' ? 'all your notifications' : 'all the notifications you have already read';
    Alert.alert('Delete notifications?', `Delete ${label}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { const r = await api.clearNotifications(scope); setNote(`${r.deleted} notification${r.deleted === 1 ? '' : 's'} deleted.`); await load(); }
        catch (err) { setError(err.message); }
      } },
    ]);
  }

  return <Screen refreshing={false} onRefresh={load}>
    <Title subtitle={loading ? 'Loading…' : `${total} in total${unread ? ` · ${unread} unread` : ' · all read'}`}>Notifications</Title>
    <Message>{error}</Message><Message tone="success">{note}</Message>
    {!loading && total > 0 ? <View style={styles.actions}>
      <Button compact kind="secondary" title="Mark all read" disabled={!unread} onPress={markAll} />
      <Button compact kind="secondary" title="Delete read" disabled={total - unread === 0} onPress={() => clear('read')} />
      <Button compact kind="danger" title="Delete all" onPress={() => clear('all')} />
    </View> : null}
    {loading ? <Loading /> : !items.length ? <Empty>No notifications yet.</Empty> : items.map((n) => (
      <Pressable key={n._id} onPress={() => open(n)} style={[styles.item, !n.read && styles.unread]}>
        <View style={{ flex: 1, gap: 4 }}><Text style={styles.msg}>{n.message}</Text><Text style={styles.time}>{timeAgo(n.createdAt)}</Text></View>
        {!n.read ? <View style={styles.dot} /> : null}
        <Pressable hitSlop={10} onPress={() => remove(n)} accessibilityLabel="Delete notification"><Text style={styles.del}>Delete</Text></Pressable>
      </Pressable>
    ))}
    {hasMore ? <Button kind="secondary" title={loadingMore ? 'Loading…' : `Load more (${total - items.length} left)`} disabled={loadingMore} onPress={loadMore} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel },
  unread: { backgroundColor: 'rgba(79,142,247,0.10)', borderColor: 'rgba(79,142,247,0.35)' },
  msg: { color: colors.text, lineHeight: 20 }, time: { color: colors.textDim, fontSize: 11 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.holoCyan },
  del: { color: colors.danger, fontSize: 12, fontWeight: '700' },
});
