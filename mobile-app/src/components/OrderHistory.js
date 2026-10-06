import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, resolveAssetUrl } from '../api/client.js';
import { downloadAndShare } from '../lib/files.js';
import { rupees } from '../lib/format.js';
import { colors } from '../theme/colors.js';
import { Glyph } from './Glyph.js';
import { Button, Empty, Loading, Message, Pill, Row } from './ui.js';

const POSTER_STATUS = { ordered: 'Ordered', shipping: 'Shipping', delivery: 'Out for delivery', completed: 'Completed' };

function Section({ icon, title, children }) {
  return <View style={styles.section}>
    <View style={styles.sectionHead}><Glyph name={icon} size={15} color={colors.holoCyan} /><Text style={styles.sectionTitle}>{title}</Text></View>
    {children}
  </View>;
}

function Address({ delivery }) {
  if (!delivery?.line1) return null;
  return <Section icon="pin" title="Delivery address">
    <Text style={styles.strong}>{delivery.name}{delivery.phone ? ` · ${delivery.phone}` : ''}</Text>
    <Text style={styles.dim}>{delivery.line1}{delivery.line2 ? `, ${delivery.line2}` : ''}</Text>
    <Text style={styles.dim}>{delivery.city}, {delivery.state} - {delivery.pincode}</Text>
    <Text style={styles.dim}>{delivery.country}</Text>
  </Section>;
}

export function CardHistory({ requests, plans }) {
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function invoice(request) {
    setBusyId(request._id); setError('');
    try { await downloadAndShare({ path: `/api/profile/requests/${request._id}/invoice`, filename: `invoice-${request.orderNumber || request._id}.pdf`, mimeType: 'application/pdf', dialogTitle: 'Invoice' }); }
    catch (err) { setError(err.message); } finally { setBusyId(null); }
  }

  if (!requests.length) return <Text style={styles.dim}>You haven't purchased a card yet.</Text>;
  return <View style={{ gap: 10 }}>
    <Message>{error}</Message>
    {requests.map((r) => {
      const plan = plans.find((p) => p.key === r.requestedPlan);
      const planName = plan?.name || r.requestedPlan;
      const open = expanded === r._id;
      const items = r.invoiceItems?.length ? r.invoiceItems : [{ name: planName, unitPrice: null, quantity: r.quantity }];
      const selectedVariants = (r.variantBreakdown || []).map((selection, index) => {
        const variant = plan?.variants?.find((item) => String(item._id) === String(selection.variantId));
        return { ...variant, ...selection, name: variant?.name || items[index]?.name || `Card style ${index + 1}` };
      });
      const primary = selectedVariants[0] || plan?.variants?.[0];
      const front = primary?.frontImageUrl || plan?.images?.[0];
      const back = primary?.backImageUrl || plan?.images?.[1];
      return <View key={r._id} style={styles.order}>
        <Pressable onPress={() => setExpanded(open ? null : r._id)} style={styles.orderHead}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.strong}>{planName}{r.quantity > 1 ? ` × ${r.quantity}` : ''}</Text>
            <Text style={styles.dim}>{r.orderNumber || 'No order number'}{r.paymentStatus === 'paid' ? ' · Paid' : ''}</Text>
            {r.couponCode ? <Pill tone="violet">{r.couponSource === 'huntsworld' ? 'HuntsWorld' : r.couponSource || 'Coupon'}</Pill> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Pill>{r.status}</Pill>
            <Glyph name={open ? 'chevronUp' : 'chevronDown'} size={16} color={colors.text} />
          </View>
        </Pressable>
        {r.paymentStatus === 'paid' ? <Button compact kind="secondary" icon="download" title={busyId === r._id ? 'Preparing…' : 'Invoice'} disabled={busyId === r._id} onPress={() => invoice(r)} style={{ alignSelf: 'flex-start' }} /> : null}
        {open ? <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {front ? <Image source={{ uri: resolveAssetUrl(front) }} style={[styles.face, primary?.shape === 'vertical' && styles.faceVertical]} resizeMode="cover" /> : null}
            {back ? <Image source={{ uri: resolveAssetUrl(back) }} style={[styles.face, primary?.shape === 'vertical' && styles.faceVertical]} resizeMode="cover" /> : null}
          </View>
          {plan?.description ? <Text style={styles.dim}>{plan.description}</Text> : null}
          <Section icon="bag" title="Order items">
            {(selectedVariants.length ? selectedVariants : items).map((item, i) => <Row key={item.variantId || i} label={`${item.name}${item.shape ? ` · ${item.shape}` : ''} × ${item.quantity}`} value={item.unitPrice != null ? rupees(item.unitPrice * item.quantity) : ''} />)}
          </Section>
          {r.amount != null ? <Section icon="card" title="Payment summary">
            <Row label="Card subtotal" value={rupees(r.subtotal)} /><Row label="Delivery" value={rupees(r.deliveryFee)} />
            <Row label={`GST (${r.gstPercent}%)`} value={rupees(r.gstAmount)} /><Row label="Total paid" value={rupees(r.amount)} strong />
          </Section> : null}
          <Address delivery={r.delivery} />
          <Section icon="truck" title="Fulfillment">
            <Row label="Tracking ID" value={r.trackingId || 'Not dispatched yet'} />
            <Row label="Dispatched" value={r.dispatchedAt ? new Date(r.dispatchedAt).toLocaleString() : 'Pending'} />
            <Row label="Delivered" value={r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : 'Pending'} />
          </Section>
          {r.createdAt ? <Row label="Order date" value={new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} /> : null}
        </View> : null}
      </View>;
    })}
  </View>;
}

const PAGE_SIZE = 10;

export function PosterOrders({ onBrowse }) {
  const [orders, setOrders] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const first = useCallback(async () => {
    setLoading(true); setError('');
    try { const res = await api.listMyMagicPosterOrdersPage({ limit: PAGE_SIZE }); setOrders(res.orders); setHasMore(res.hasMore); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { first(); }, [first]);

  async function more() {
    setLoadingMore(true); setError('');
    try { const res = await api.listMyMagicPosterOrdersPage({ skip: orders.length, limit: PAGE_SIZE }); setOrders((list) => [...list, ...res.orders]); setHasMore(res.hasMore); }
    catch (err) { setError(err.message); } finally { setLoadingMore(false); }
  }

  async function invoice(order) {
    setBusyId(order._id);
    try { await downloadAndShare({ path: `/api/profile/magic-poster/orders/${order._id}/invoice`, filename: `invoice-${order.orderNumber || order._id}.pdf`, mimeType: 'application/pdf', dialogTitle: 'Invoice' }); }
    catch (err) { Alert.alert('Invoice', err.message); } finally { setBusyId(null); }
  }

  if (loading) return <Loading />;
  return <View style={{ gap: 10 }}>
    <Message>{error}</Message>
    {!orders.length ? <Empty action={onBrowse ? <Button kind="secondary" title="Browse Magic Posters →" onPress={onBrowse} style={{ marginTop: 12 }} /> : null}>You haven't ordered a Magic Poster yet.</Empty> : orders.map((o) => {
      const open = expanded === o._id;
      const items = o.items || [];
      const title = items[0] ? items[0].name || '(deleted poster)' : 'Magic Poster';
      const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const status = POSTER_STATUS[o.status] || POSTER_STATUS.ordered;
      return <View key={o._id} style={styles.order}>
        <Pressable onPress={() => setExpanded(open ? null : o._id)} style={styles.orderHead}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.strong}>{title}{items.length > 1 ? ` + ${items.length - 1} more` : totalQty > 1 ? ` × ${totalQty}` : ''}</Text>
            <Text style={styles.dim}>{o.orderNumber} · Paid</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}><Pill>{status}</Pill><Glyph name={open ? 'chevronUp' : 'chevronDown'} size={16} color={colors.text} /></View>
        </Pressable>
        <Button compact kind="secondary" icon="download" title={busyId === o._id ? 'Preparing…' : 'Invoice'} disabled={busyId === o._id} onPress={() => invoice(o)} style={{ alignSelf: 'flex-start' }} />
        {open ? <View style={{ gap: 12 }}>
          <Section icon="bag" title="Order items">
            {items.map((item, i) => <Row key={i} label={`${item.name || '(deleted poster)'} × ${item.quantity}`} value={item.unitPrice != null ? rupees(item.unitPrice * item.quantity) : ''} />)}
          </Section>
          <Section icon="card" title="Payment summary">
            {o.subtotal != null ? <Row label="Poster subtotal" value={rupees(o.subtotal)} /> : null}
            {o.deliveryFee != null ? <Row label="Delivery" value={rupees(o.deliveryFee)} /> : null}
            {o.gstAmount != null ? <Row label={`GST (${o.gstPercent}%)`} value={rupees(o.gstAmount)} /> : null}
            <Row label="Total paid" value={rupees(o.amountPaid ?? o.amount)} strong />
          </Section>
          <Address delivery={o.delivery} />
          <Section icon="truck" title="Fulfillment"><Row label="Status" value={status} /><Row label="Tracking ID" value={o.trackingId || 'Not dispatched yet'} /></Section>
          {o.createdAt ? <Row label="Order date" value={new Date(o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} /> : null}
        </View> : null}
      </View>;
    })}
    {hasMore ? <Button kind="secondary" title={loadingMore ? 'Loading…' : 'Load more'} disabled={loadingMore} onPress={more} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  order: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel },
  orderHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  strong: { color: colors.text, fontWeight: '800', fontSize: 14 }, dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  section: { gap: 5, padding: 12, borderRadius: 12, backgroundColor: colors.panelRaised },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }, sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 13 },
  face: { flex: 1, aspectRatio: 85 / 55, borderRadius: 10, backgroundColor: colors.panelRaised }, faceVertical: { aspectRatio: 55 / 85 },
});
