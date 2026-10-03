import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { api, resolveAssetUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useCart } from '../cart/CartContext.js';
import AddressPicker from '../components/AddressPicker.js';
import { usePayment } from '../payments/PaymentProvider.js';
import { Button, Card, Empty, Message, Row, Screen, SectionTitle, Stepper, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function MagicPosterCartScreen({ navigation }) {
  const { session } = useAuth();
  const cart = useCart();
  const { pay } = usePayment();
  const [profile, setProfile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    if (session) api.getProfile().then(setProfile).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const items = cart.items.map((item) => ({ magicArtId: item.magicArtId, quantity: item.quantity }));
    api.getMagicPosterPricing(items, selected?.state).then(setPricing).catch(() => {});
  }, [session, selected?.state, cart.items]);

  if (!session) {
    return <Screen>
      <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 30 }}>
        <Text style={styles.gateTitle}>Log in to view your cart</Text>
        <Text style={styles.dim}>Your Magic Poster cart and delivery details are saved to your account.</Text>
        <Button title="Log in" onPress={() => navigation.navigate('Login')} style={{ alignSelf: 'stretch' }} />
      </Card>
    </Screen>;
  }

  if (placed) {
    return <Screen>
      <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 30 }}>
        <Text style={styles.gateTitle}>Order placed 🎉</Text>
        <Text style={[styles.dim, { textAlign: 'center' }]}>Thanks! Your payment of ₹{placed.amount} went through and your order is now Pending. We'll get it on its way soon.</Text>
        <Button title="View order history" onPress={() => navigation.navigate('Shop', { tab: 'poster' })} style={{ alignSelf: 'stretch' }} />
      </Card>
    </Screen>;
  }

  const subtotal = cart.totalAmount;
  const deliveryFee = pricing?.deliveryFee ?? 0;
  const gstPercent = pricing?.gstPercent ?? 0;
  const gstAmount = Math.round(subtotal * (gstPercent / 100));
  const total = subtotal + gstAmount + deliveryFee;

  async function handlePay() {
    if (!cart.items.length) return;
    if (!selected) return setError('Choose or add a delivery address first.');
    setError(''); setSubmitting(true);
    try {
      const order = await api.createMagicPosterOrder(
        cart.items.map((item) => ({ magicArtId: item.magicArtId, quantity: item.quantity })),
        { name: selected.name, phone: selected.phone, line1: selected.line1, line2: selected.line2, country: selected.country, state: selected.state, city: selected.city, pincode: selected.pincode },
      );
      const response = await pay({ order, description: `${cart.totalCount} Magic Poster item${cart.totalCount > 1 ? 's' : ''}`, prefill: { name: selected.name, contact: selected.phone } });
      const result = await api.confirmMagicPosterPayment({ mongoOrderId: order.mongoOrderId, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature });
      setPlaced({ amount: result.amountPaid });
      cart.clear();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  }

  return <Screen>
    <Title>Your cart</Title>
    <Message>{error}</Message>
    {!cart.items.length ? <Empty action={<Button title="Browse Magic Posters" kind="secondary" onPress={() => navigation.navigate('Magic Poster')} style={{ marginTop: 12 }} />}>Your cart is empty.</Empty> : <>
      <Card style={{ gap: 14 }}>
        {cart.items.map((item) => <View key={item.magicArtId} style={styles.item}>
          {item.imageUrl ? <Image source={{ uri: resolveAssetUrl(item.imageUrl) }} style={styles.img} /> : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.dim}>₹{item.unitPrice} each · ₹{item.unitPrice * item.quantity}</Text>
            <View style={styles.itemActions}>
              <Stepper value={item.quantity} min={0} onChange={(value) => cart.updateQuantity(item.magicArtId, value)} />
              <Button compact kind="danger" title="Remove" onPress={() => cart.removeItem(item.magicArtId)} />
            </View>
          </View>
        </View>)}
      </Card>
      <Card style={{ gap: 12 }}>
        <SectionTitle>Deliver to</SectionTitle>
        <AddressPicker profile={profile} selectedId={selected?._id} onSelect={(id, address) => setSelected(address)} />
      </Card>
      <Card style={{ gap: 6 }}>
        <Row label="Subtotal" value={`₹${subtotal}`} />
        <Row label="Delivery" value={`₹${deliveryFee}`} />
        <Row label={`GST (${gstPercent}%)`} value={`₹${gstAmount}`} />
        <Row label="Total" value={`₹${total}`} strong />
        <Button title={submitting ? 'Processing…' : `Pay ₹${total}`} icon="card" disabled={submitting || !selected} onPress={handlePay} style={{ marginTop: 10 }} />
      </Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  gateTitle: { color: colors.text, fontWeight: '800', fontSize: 20 }, dim: { color: colors.textDim, fontSize: 12 },
  item: { flexDirection: 'row', gap: 12 }, img: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.panelRaised },
  itemName: { color: colors.text, fontWeight: '800' }, itemActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
