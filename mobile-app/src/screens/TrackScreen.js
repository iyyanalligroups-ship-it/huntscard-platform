import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Card, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function TrackScreen() {
  const [data, setData] = useState({ profile: null, cards: [], posters: [] }); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [profile, requests, posterResult] = await Promise.all([api.getProfile(), api.listMyRequests(), api.listMyMagicPosterOrders().catch(() => ({ orders: [] }))]);
      setData({ profile, cards: requests.filter((item) => item.type === 'upgrade' && item.paymentStatus === 'paid' && item.status !== 'rejected'), posters: posterResult.orders || [] });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const orders = useMemo(() => [...data.cards.map((item) => ({ ...item, kind: 'Card' })), ...data.posters.map((item) => ({ ...item, kind: 'Magic Poster' }))], [data]);
  return <Screen refreshing={loading} onRefresh={load}><Title subtitle="Card and Magic Poster purchases in one timeline.">Track orders</Title><Message>{error}</Message>
    {loading && !orders.length ? <Loading /> : !orders.length ? <Empty>No paid orders yet.</Empty> : orders.map((order) => <Order key={order._id} order={order} profile={data.profile} />)}
  </Screen>;
}

function Order({ order, profile }) {
  const isPoster = order.kind === 'Magic Poster';
  const status = isPoster
    ? order.status
    : (order.deliveredAt || profile?.delivered)
      ? 'delivered'
      : (order.dispatchedAt || profile?.dispatched)
        ? 'shipping'
        : profile?.chipEncoded
          ? 'card created'
          : 'ordered';
  return <Card style={styles.card}><View style={styles.row}><Text style={styles.kind}>{order.kind}</Text><Text style={styles.status}>{status}</Text></View>
    <Text style={styles.title}>{order.planName || order.requestedPlan || order.items?.map((item) => item.name).join(', ') || 'huntsTAG order'}</Text>
    <Text style={styles.dim}>Order {order.orderNumber || order._id}</Text>
    {order.trackingId ? <Text style={styles.tracking}>Tracking ID: {order.trackingId}</Text> : <Text style={styles.dim}>Tracking details will appear after dispatch.</Text>}
  </Card>;
}

const styles = StyleSheet.create({ card: { gap: 7 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, kind: { color: colors.holoViolet, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }, status: { color: colors.holoCyan, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, title: { color: colors.text, fontSize: 16, fontWeight: '800' }, dim: { color: colors.textDim, fontSize: 12 }, tracking: { color: colors.text, fontSize: 13, marginTop: 5 } });
