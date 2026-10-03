import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Glyph } from '../components/Glyph.js';
import { Button, Card, Empty, Loading, Message, Screen, SelectField, Tabs, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const POSTER_STATUS_ORDER = ['ordered', 'shipping', 'delivery', 'completed'];

function cardSteps(order, profile) {
  const hasOrderShipment = Boolean(order?.trackingId || order?.dispatchedAt || order?.deliveredAt);
  const trackingId = hasOrderShipment ? order?.trackingId : profile?.trackingId;
  const dispatchedAt = hasOrderShipment ? order?.dispatchedAt : profile?.dispatchedAt;
  const deliveredAt = hasOrderShipment ? order?.deliveredAt : profile?.deliveredAt;
  const dispatched = hasOrderShipment ? Boolean(order?.dispatchedAt) : Boolean(profile?.dispatched);
  const delivered = hasOrderShipment ? Boolean(order?.deliveredAt) : Boolean(profile?.delivered);
  return [
    { title: 'Order placed', detail: 'Payment confirmed.', done: true },
    { title: 'Card created', detail: profile?.chipEncoded ? `Encoded${profile.encodedAt ? ` on ${new Date(profile.encodedAt).toLocaleDateString()}` : ''}.` : 'Waiting for our team to physically create your card.', done: Boolean(profile?.chipEncoded) },
    { title: 'Shipping', detail: dispatched ? `On its way${trackingId ? ` — tracking ID ${trackingId}` : ''}${dispatchedAt ? `, dispatched ${new Date(dispatchedAt).toLocaleDateString()}` : ''}.` : 'Not shipped yet.', done: dispatched },
    { title: 'Delivered', detail: delivered ? `Delivered${deliveredAt ? ` on ${new Date(deliveredAt).toLocaleDateString()}` : ''}.` : 'Not delivered yet.', done: delivered },
  ];
}

function posterSteps(order) {
  const index = POSTER_STATUS_ORDER.indexOf(order.status);
  return [
    { title: 'Order placed', detail: `Payment confirmed${order.createdAt ? ` on ${new Date(order.createdAt).toLocaleDateString()}` : ''}.`, done: true },
    { title: 'Shipping', detail: order.trackingId ? `On its way — tracking ID ${order.trackingId}.` : 'Preparing your order for shipment.', done: index >= 1 },
    { title: 'Out for delivery', detail: index >= 2 ? 'Out for delivery to your address.' : 'Not out for delivery yet.', done: index >= 2 },
    { title: 'Completed', detail: index >= 3 ? 'Delivered — order completed.' : 'Not completed yet.', done: index >= 3 },
  ];
}

function Steps({ steps }) {
  const current = steps.findIndex((step) => !step.done);
  return <View style={{ gap: 0 }}>
    {steps.map((step, index) => {
      const isCurrent = index === current;
      return <View key={step.title} style={styles.step}>
        <View style={{ alignItems: 'center' }}>
          <View style={[styles.dot, step.done && styles.dotDone, isCurrent && styles.dotCurrent]}>
            {step.done ? <Glyph name="check" size={14} color="#06120f" strokeWidth={3} /> : <Text style={[styles.dotText, isCurrent && { color: colors.holoCyan }]}>{index + 1}</Text>}
          </View>
          {index < steps.length - 1 ? <View style={[styles.line, step.done && { backgroundColor: colors.holoCyan }]} /> : null}
        </View>
        <View style={{ flex: 1, paddingBottom: 18 }}>
          <Text style={[styles.stepTitle, !step.done && !isCurrent && { color: colors.textDim }]}>{step.title}</Text>
          <Text style={styles.stepDetail}>{step.detail}</Text>
        </View>
      </View>;
    })}
  </View>;
}

const cardLabel = (order) => `${(order.invoiceItems || []).map((item) => item.name).filter(Boolean).join(', ') || order.requestedPlan || 'Physical card'} — ${order.orderNumber || 'No order number'}`;
const posterLabel = (order) => `${(order.items || []).map((item) => item.name || 'Poster').join(', ') || 'Magic Poster'} — ${order.orderNumber || 'No order number'}`;

export default function TrackScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [cardOrders, setCardOrders] = useState([]);
  const [posterOrders, setPosterOrders] = useState([]);
  const [tab, setTab] = useState('card');
  const [selectedId, setSelectedId] = useState({ card: '', poster: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [profileData, requestData, posterData] = await Promise.all([api.getProfile(), api.listMyRequests(), api.listMyMagicPosterOrders().catch(() => ({ orders: [] }))]);
      const cards = requestData.filter((order) => order.type === 'upgrade' && order.paymentStatus === 'paid' && order.status !== 'rejected');
      const posters = posterData.orders || [];
      setProfile(profileData); setCardOrders(cards); setPosterOrders(posters);
      setSelectedId((prev) => ({ card: prev.card || cards[0]?._id || '', poster: prev.poster || posters[0]?._id || '' }));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isCard = tab === 'card';
  const orders = isCard ? cardOrders : posterOrders;
  const selected = orders.find((order) => order._id === selectedId[tab]) || orders[0];

  return <Screen refreshing={false} onRefresh={load}>
    <Title eyebrow="All purchases" subtitle="Pick a card or Magic Poster order to see its shipment progress.">Track an order</Title>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'card', label: 'Card track', icon: 'card' }, { key: 'poster', label: 'Magic Poster track', icon: 'image' }]} />
    <Message>{error}</Message>
    {loading ? <Loading /> : !orders.length ? <Empty action={<Button kind="secondary" title={isCard ? 'Browse cards' : 'Browse Magic Posters'} onPress={() => navigation.navigate(isCard ? 'Shop' : 'Magic Poster')} style={{ marginTop: 12 }} />}>{isCard ? "You haven't bought a card yet." : "You haven't ordered a Magic Poster yet."}</Empty> : <>
      <SelectField label={isCard ? 'Select a card order' : 'Select a Magic Poster order'} value={selected._id} options={orders.map((order) => ({ value: order._id, label: isCard ? cardLabel(order) : posterLabel(order) }))} onChange={(value) => setSelectedId((prev) => ({ ...prev, [tab]: value }))} />
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={styles.typeIcon}><Glyph name={isCard ? 'card' : 'image'} size={18} color={colors.holoCyan} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{isCard ? 'Card purchase' : 'Magic Poster purchase'}</Text>
            <Text style={styles.title}>{isCard ? selected.requestedPlan || 'Physical card' : 'Magic Poster'}</Text>
            <Text style={styles.dim}>{isCard ? (selected.invoiceItems || []).map((item) => `${item.quantity}× ${item.name}`).join(', ') : (selected.items || []).map((item) => `${item.quantity}× ${item.name || 'Poster'}`).join(', ')}</Text>
          </View>
        </View>
        <View style={styles.ids}>
          <Text style={styles.dim}>Order</Text><Text style={styles.idValue}>{selected.orderNumber || 'Not available'}</Text>
          <Text style={styles.dim}>Tracking ID</Text><Text style={styles.idValue}>{selected.trackingId || 'Not assigned'}</Text>
        </View>
        <Steps steps={isCard ? cardSteps(selected, profile) : posterSteps(selected)} />
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Glyph name="truck" size={13} color={colors.textDim} />
          <Text style={styles.dim}>{selected.trackingId ? `Shipment ${selected.trackingId}` : 'Shipment is being prepared'}</Text>
        </View>
        <Button kind="secondary" compact title="View purchase history" onPress={() => navigation.navigate('Shop', { tab: isCard ? 'card' : 'poster' })} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 14 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  dotDone: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan }, dotCurrent: { borderColor: colors.holoCyan }, dotText: { color: colors.textDim, fontWeight: '800', fontSize: 12 },
  line: { width: 2, flex: 1, backgroundColor: colors.panelBorder, marginVertical: 2 },
  stepTitle: { color: colors.text, fontWeight: '800', fontSize: 15 }, stepDetail: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 2 },
  typeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.holoViolet, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, title: { color: colors.text, fontWeight: '800', fontSize: 17, textTransform: 'capitalize' }, dim: { color: colors.textDim, fontSize: 12 },
  ids: { gap: 3, padding: 12, borderRadius: 12, backgroundColor: colors.panelRaised }, idValue: { color: colors.text, fontWeight: '800', marginBottom: 6 },
});
