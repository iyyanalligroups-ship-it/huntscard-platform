import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, resolveAssetUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import AddressPicker from '../components/AddressPicker.js';
import { Glyph } from '../components/Glyph.js';
import { CardHistory, PosterOrders } from '../components/OrderHistory.js';
import { MagicArtGallery } from './MagicArtScreen.js';
import { usePayment } from '../payments/PaymentProvider.js';
import { Button, Card, Field, Loading, Message, Pill, Row, Screen, SectionTitle, Stepper, Tabs, Title } from '../components/ui.js';
import { rupees } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const PLAN_DISPLAY_ORDER = ['premium', 'elite', 'nova', 'custom', 'apex'];
const MAX_QUANTITY = 20;

const FEATURE_BADGES = [
  { key: 'arEnabled', icon: 'scan', label: 'AR feature', note: 'Anyone who scans your card can point their phone camera at it to unlock an AR experience.' },
  { key: 'zingEnabled', icon: 'zap', label: 'Zing', note: 'Share your contact card instantly from your dashboard with a tap — no app needed on their end.' },
  { key: 'requiresDesignUpload', icon: 'palette', label: 'Requires design upload', note: "You'll upload your own front and back artwork for this card during checkout." },
  { key: 'magicEnabled', icon: 'sparkles', label: 'Magic AR feature', note: 'Add your own photo or video effect that plays when someone scans your card in Magic Camera.' },
  { key: 'isSpecialEdition', icon: 'play', label: 'Special Edition (Sound)', note: 'Comes with a custom sound effect that plays when your card is scanned.' },
];

function PlanMedia({ plan, variants, focus, onFocus }) {
  const variant = variants[focus] || variants[0];
  const hasVariantImages = variants.some((v) => v.frontImageUrl || v.backImageUrl);
  if (hasVariantImages) {
    return <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[['Front', variant?.frontImageUrl], ['Back', variant?.backImageUrl]].map(([tag, url]) => (
          <View key={tag} style={[styles.face, variant?.shape === 'vertical' && styles.faceVertical]}>
            {url ? <Image source={{ uri: resolveAssetUrl(url) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Text style={styles.faceEmpty}>No {tag.toLowerCase()} photo yet</Text>}
            <Text style={styles.faceTag}>{tag}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>{variant?.name}{variant?.shape ? ` · ${variant.shape === 'vertical' ? 'Vertical' : 'Horizontal'}` : ''}</Text>
      {variants.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {variants.map((v, i) => <Pressable key={v._id} onPress={() => onFocus(i)} style={[styles.thumb, i === focus && styles.thumbOn]}>
          {v.frontImageUrl ? <Image source={{ uri: resolveAssetUrl(v.frontImageUrl) }} style={{ width: '100%', height: '100%' }} /> : <Text style={styles.caption}>{i + 1}</Text>}
        </Pressable>)}
      </ScrollView> : null}
    </View>;
  }
  if (plan.images?.length) {
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {plan.images.map((image) => <Image key={image} source={{ uri: resolveAssetUrl(image) }} style={styles.gallery} resizeMode="contain" />)}
    </ScrollView>;
  }
  return null;
}

export default function ShopScreen({ navigation, route }) {
  const { session } = useAuth();
  const loggedIn = Boolean(session);
  const { pay } = usePayment();
  const [plans, setPlans] = useState([]);
  const [profile, setProfile] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [focus, setFocus] = useState(0);
  const [variantQty, setVariantQty] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [designFront, setDesignFront] = useState('');
  const [designBack, setDesignBack] = useState('');
  const [uploading, setUploading] = useState(null);
  const [address, setAddress] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [tab, setTab] = useState(route.params?.tab === 'poster' ? 'poster' : 'card');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponMode, setCouponMode] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planList, prof, reqs, cards] = await Promise.all([
        api.listPlans(),
        loggedIn ? api.getProfile() : null,
        loggedIn ? api.listMyRequests() : [],
        loggedIn ? api.getMyCards() : [],
      ]);
      setPlans(planList); setProfile(prof); setRequests(reqs.filter((r) => r.type === 'upgrade')); setMyCards(cards);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [loggedIn]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { if (route.params?.tab) setTab(route.params.tab === 'poster' ? 'poster' : 'card'); }, [route.params?.tab]);

  const visiblePlans = useMemo(() => [...plans].sort((a, b) => {
    const rank = (p) => { const i = PLAN_DISPLAY_ORDER.findIndex((k) => p.name.toLowerCase().includes(k)); return i === -1 ? PLAN_DISPLAY_ORDER.length : i; };
    return rank(a) - rank(b);
  }), [plans]);
  const ownedKeys = useMemo(() => new Set(myCards.map((c) => c.cardType).filter(Boolean)), [myCards]);
  const hasCard = myCards.length > 0;
  const selectedPlan = visiblePlans.find((p) => p.key === selectedKey);

  function selectPlan(key) {
    setSelectedKey(key); setVariantQty({}); setFocus(0); setDesignFront(''); setDesignBack(''); setQuantity(1); setError(''); setSuccess('');
  }

  useEffect(() => {
    if (!visiblePlans.length) return;
    const wanted = route.params?.plan;
    if (wanted && visiblePlans.some((p) => p.key === wanted) && selectedKey !== wanted) { selectPlan(wanted); return; }
    if (selectedKey) return;
    const current = loggedIn && hasCard ? visiblePlans.find((p) => ownedKeys.has(p.key)) : null;
    setSelectedKey((current || visiblePlans[0]).key);
  }, [visiblePlans, route.params?.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasVariants = Boolean(selectedPlan?.variants?.length);
  const variantEntries = Object.entries(variantQty).filter(([, qty]) => qty > 0).map(([variantId, qty]) => ({ variantId, quantity: qty }));
  const variantTotal = variantEntries.reduce((sum, e) => sum + e.quantity, 0);
  const effectiveQuantity = hasVariants ? variantTotal : quantity;
  const subtotal = selectedPlan?.chargeAmount ? selectedPlan.chargeAmount * effectiveQuantity : 0;
  const variantOk = !hasVariants || variantTotal > 0;
  const designOk = !selectedPlan?.requiresDesignUpload || Boolean(designFront && designBack);

  useEffect(() => {
    if (!loggedIn || !selectedPlan?.chargeAmount) return;
    api.getCardCheckoutPricing(address?.state).then(setPricing).catch(() => setPricing(null));
  }, [loggedIn, selectedPlan?.key, address?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliveryFee = pricing?.deliveryFee ?? 0;
  const gstPercent = pricing?.gstPercent ?? 0;
  const gstAmount = Math.round(subtotal * (gstPercent / 100));
  const total = subtotal + deliveryFee + gstAmount;

  function adjustVariant(id, delta) {
    if (couponMode) { setVariantQty(delta > 0 ? { [id]: 1 } : {}); return; }
    setVariantQty((prev) => {
      const current = prev[id] || 0;
      const others = variantTotal - current;
      return { ...prev, [id]: Math.max(0, Math.min(MAX_QUANTITY - others, current + delta)) };
    });
  }

  async function pickDesign(side) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Photo library permission is required.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.92 });
    if (result.canceled) return;
    setUploading(side); setError('');
    try {
      const { url } = await api.uploadDesign(result.assets[0]);
      side === 'front' ? setDesignFront(url) : setDesignBack(url);
    } catch (err) { setError(err.message); } finally { setUploading(null); }
  }

  async function checkCoupon() {
    const code = couponInput.trim();
    if (!code) return setCouponError('Enter a coupon code.');
    if (!loggedIn) return navigation.navigate('Register');
    setCouponChecking(true); setCouponError('');
    try { const result = await api.previewCoupon(code); selectPlan(result.plan.key); setCouponMode({ code, plan: result.plan }); }
    catch (err) { setCouponError(err.message); } finally { setCouponChecking(false); }
  }
  function removeCoupon() { setCouponMode(null); setCouponInput(''); setCouponError(''); setVariantQty({}); setDesignFront(''); setDesignBack(''); }

  async function claimCoupon() {
    if (!variantOk) return setError('Choose a card style before claiming.');
    if (!designOk) return setError('Upload both a front and back design before claiming.');
    if (!address) return setError('Choose or add a delivery address before claiming.');
    setError(''); setClaiming(true);
    try {
      await api.claimCoupon({ code: couponMode.code, variantId: hasVariants ? variantEntries[0]?.variantId : undefined, deliveryAddressId: address._id, designFrontUrl: designFront || undefined, designBackUrl: designBack || undefined });
      setSuccess(`Your free ${couponMode.plan.name} card has been claimed!`);
      removeCoupon(); await load();
    } catch (err) { setError(err.message); } finally { setClaiming(false); }
  }

  async function checkout() {
    if (!selectedPlan) return;
    if (!loggedIn) return navigation.navigate('Register');
    if (!selectedPlan.chargeAmount) return setError("This plan isn't available for instant checkout yet — please contact us to order it.");
    if (!variantOk) return setError('Choose at least one card style and quantity before checking out.');
    if (!designOk) return setError('Upload both a front and back design before checking out.');
    if (!address) return setError('Choose or add a delivery address before checking out.');
    setError(''); setSubmitting(true);
    try {
      const order = await api.createUpgradeOrder(selectedKey, quantity, hasVariants ? variantEntries : undefined, address._id);
      const response = await pay({
        order,
        description: `${selectedPlan.name} card${effectiveQuantity > 1 ? ` × ${effectiveQuantity}` : ''}`,
        prefill: { name: address.name || profile?.fullName, email: profile?.loginEmail, contact: address.phone || profile?.phone },
      });
      const result = await api.confirmUpgradePayment({
        requestedPlan: selectedKey, designFrontUrl: designFront || undefined, designBackUrl: designBack || undefined,
        razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature,
      });
      setSuccess(`Payment successful — your card is ${hasCard ? 'updated' : 'ready'}!${(result.quantity || 1) > 1 ? ` You're getting ${result.quantity} physical cards, all with your profile.` : ''}`);
      setSelectedKey(''); setVariantQty({}); setDesignFront(''); setDesignBack(''); setQuantity(1);
      await load();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  }

  if (loading) return <Screen><Loading label="Loading plans…" /></Screen>;

  const heading = loggedIn ? (hasCard ? 'Upgrade your card' : 'Get your card') : 'Choose your card';
  const subheading = loggedIn
    ? hasCard ? `You're currently on ${[...ownedKeys].map((key) => visiblePlans.find((p) => p.key === key)?.name || key).join(', ')}.` : "You don't have a card yet — pick a plan below."
    : "Browse freely — you'll need an account to actually buy.";
  const activeBadges = selectedPlan ? FEATURE_BADGES.filter((f) => selectedPlan[f.key]) : [];
  const buttonLabel = couponMode
    ? (claiming ? 'Claiming…' : !variantOk ? 'Choose a card style' : !designOk ? 'Upload front & back design' : !address ? 'Choose delivery address' : 'Claim free card')
    : submitting ? 'Waiting for payment…' : !loggedIn ? 'Create an account to buy' : !selectedPlan?.chargeAmount ? 'Not available for instant checkout'
      : !variantOk ? 'Choose a card style' : !designOk ? 'Upload front & back design' : !address ? 'Choose delivery address' : `Pay ${rupees(total)}`;
  const buttonDisabled = couponMode ? claiming || !variantOk || !designOk || !address : submitting || (loggedIn && (!selectedPlan?.chargeAmount || !variantOk || !designOk || !address));

  return <Screen refreshing={false} onRefresh={load}>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'card', label: 'Card Shop', icon: 'card' }, { key: 'poster', label: 'Magic Poster Shop', icon: 'image' }]} />

    {tab === 'card' ? <>
      <Title subtitle={subheading}>{heading}</Title>
      {success && !error ? <Message tone="success">{success}</Message> : null}

      {!couponMode ? <Card style={{ gap: 10 }}>
        {!couponOpen ? <Button compact kind="secondary" icon="ticket" title="Have a coupon code?" onPress={() => setCouponOpen(true)} style={{ alignSelf: 'flex-start' }} /> : <>
          <Field label="Coupon code" placeholder="Enter your HuntsWorld coupon code" value={couponInput} onChangeText={(v) => setCouponInput(v.toUpperCase())} autoCapitalize="characters" editable={!couponChecking} />
          <Button title={couponChecking ? 'Checking…' : 'Apply'} disabled={couponChecking} onPress={checkCoupon} />
        </>}
        <Message>{couponError}</Message>
      </Card> : <Card style={{ gap: 10 }}>
        <Text style={styles.text}>🎟 Coupon <Text style={styles.code}>{couponMode.code}</Text> applied — claiming your <Text style={{ fontWeight: '800' }}>{couponMode.plan.name}</Text>, free.</Text>
        <Button compact kind="secondary" title="Remove coupon" onPress={removeCoupon} style={{ alignSelf: 'flex-start' }} />
      </Card>}

      {!visiblePlans.length ? <Text style={styles.dim}>No other plans available right now.</Text> : <>
        {!couponMode && visiblePlans.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {visiblePlans.map((p) => <Pressable key={p.key} onPress={() => selectPlan(p.key)} style={[styles.pill, selectedKey === p.key && styles.pillOn]}>
            <Text style={[styles.pillText, selectedKey === p.key && { color: '#06120f' }]}>{p.name}</Text>
            {loggedIn && ownedKeys.has(p.key) ? <Glyph name="badgeCheck" size={13} color={selectedKey === p.key ? '#06120f' : colors.holoCyan} /> : null}
          </Pressable>)}
        </ScrollView> : null}

        {selectedPlan ? <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            {loggedIn && ownedKeys.has(selectedPlan.key) ? <Pill>Current plan</Pill> : null}
            <Text style={styles.planName}>{selectedPlan.name}</Text>
            {selectedPlan.chargeAmount ? <Text style={styles.price}>{rupees(selectedPlan.chargeAmount)} <Text style={styles.dim}>/ card</Text></Text> : null}
            <Text style={styles.dim}>{selectedPlan.description || 'A HuntsTAG smart card, tap-to-share ready.'}</Text>
            {activeBadges.length ? <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {activeBadges.map((f) => <View key={f.key} style={styles.badge}><Glyph name={f.icon} size={13} color={colors.holoCyan} /><Text style={styles.badgeText}>{f.label}</Text></View>)}
              </View>
              {activeBadges.map((f) => <Text key={f.key} style={styles.dim}><Text style={{ color: colors.text, fontWeight: '800' }}>{f.label}</Text> — {f.note}</Text>)}
            </> : null}
          </View>

          <Message>{error}</Message>
          <PlanMedia plan={selectedPlan} variants={selectedPlan.variants || []} focus={focus} onFocus={setFocus} />

          {hasVariants ? <View style={{ gap: 10 }}>
            <SectionTitle>Card style{variantTotal > 0 ? ` (${variantTotal} card${variantTotal > 1 ? 's' : ''} total)` : ''}</SectionTitle>
            {selectedPlan.variants.map((v, i) => {
              const qty = variantQty[v._id] || 0;
              return <View key={v._id} style={[styles.variant, qty > 0 && styles.variantOn]}>
                <Pressable onPress={() => setFocus(i)} style={{ flexDirection: 'row', gap: 6 }}>
                  {[v.frontImageUrl, v.backImageUrl].map((url, idx) => <View key={idx} style={styles.vPhoto}>{url ? <Image source={{ uri: resolveAssetUrl(url) }} style={{ width: '100%', height: '100%' }} /> : <Text style={styles.caption}>{idx ? 'Back' : 'Front'}</Text>}</View>)}
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}><Text style={styles.strong}>{v.name}</Text><Text style={styles.dim}>{v.shape === 'vertical' ? 'Vertical' : 'Horizontal'}</Text></View>
                <Stepper value={qty} min={0} max={MAX_QUANTITY} onChange={(value) => adjustVariant(v._id, value - qty)} disabledPlus={couponMode ? qty > 0 : variantTotal >= MAX_QUANTITY} />
              </View>;
            })}
            {variantTotal === 0 ? <Text style={styles.dim}>{couponMode ? 'Pick a card style above.' : 'Pick at least one style and quantity above.'}</Text>
              : couponMode ? <Text style={[styles.dim, { color: colors.holoCyan, fontWeight: '700' }]}>Free with your coupon</Text>
                : selectedPlan.chargeAmount ? <Text style={styles.dim}>{rupees(selectedPlan.chargeAmount)} × {variantTotal} = <Text style={{ color: colors.text, fontWeight: '800' }}>{rupees(subtotal)}</Text></Text> : null}
          </View> : null}

          {selectedPlan.requiresDesignUpload ? <View style={{ gap: 10 }}>
            <SectionTitle hint="We'll print this artwork on your card exactly as uploaded.">Your card artwork</SectionTitle>
            {[['front', 'Front design', designFront], ['back', 'Back design', designBack]].map(([side, label, url]) => <View key={side} style={{ gap: 8 }}>
              <Button compact kind="secondary" icon="upload" title={uploading === side ? 'Uploading…' : url ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`} disabled={uploading === side} onPress={() => pickDesign(side)} style={{ alignSelf: 'flex-start' }} />
              {url ? <Image source={{ uri: resolveAssetUrl(url) }} style={{ width: 120, height: 80, borderRadius: 6 }} resizeMode="cover" /> : null}
            </View>)}
          </View> : null}

          {selectedPlan.chargeAmount && !hasVariants && !couponMode ? <View style={{ gap: 8 }}>
            <SectionTitle hint="Extra physical copies of the same profile.">How many cards?</SectionTitle>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Stepper value={quantity} min={1} max={MAX_QUANTITY} onChange={setQuantity} />
              {quantity > 1 ? <Text style={styles.dim}>{rupees(selectedPlan.chargeAmount)} × {quantity} = <Text style={{ color: colors.text, fontWeight: '800' }}>{rupees(subtotal)}</Text></Text> : null}
            </View>
          </View> : null}

          {loggedIn && selectedPlan.chargeAmount && variantOk ? <View style={{ gap: 10 }}>
            <SectionTitle hint="Your invoice and physical card will use this address.">Delivery address</SectionTitle>
            <AddressPicker profile={profile} selectedId={address?._id} onSelect={(id, a) => setAddress(a)} />
          </View> : null}

          {couponMode ? <View style={styles.summary}>
            <Row label="Card" value={selectedPlan.chargeAmount ? `${rupees(selectedPlan.chargeAmount)}` : '₹0'} />
            <Row label="Total" value="FREE — coupon applied" strong />
          </View> : selectedPlan.chargeAmount && loggedIn && variantOk ? <View style={styles.summary}>
            <Row label="Card subtotal" value={rupees(subtotal)} /><Row label="Delivery" value={rupees(deliveryFee)} />
            <Row label={`GST (${gstPercent}%)`} value={rupees(gstAmount)} /><Row label="Total" value={rupees(total)} strong />
          </View> : null}

          <Button icon={loggedIn ? 'card' : 'login'} title={buttonLabel} disabled={buttonDisabled} loading={couponMode ? claiming : submitting} onPress={couponMode ? claimCoupon : checkout} />
          {!couponMode && !selectedPlan.chargeAmount ? <Button kind="ghost" title="This plan needs manual setup — contact us to order it" onPress={() => navigation.navigate('Contact Us')} /> : null}
        </Card> : null}
      </>}
    </> : <>
      <Title>Magic Poster Shop</Title>
      <MagicArtGallery navigation={navigation} embedded />
    </>}

    {loggedIn ? <View style={{ gap: 10, marginTop: 16 }}>
      <SectionTitle>{tab === 'poster' ? 'Your Magic Poster purchase history' : 'Your card purchase history'}</SectionTitle>
      {tab === 'poster' ? <PosterOrders onBrowse={() => setTab('poster')} /> : <CardHistory requests={requests} plans={visiblePlans} />}
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  text: { color: colors.text, lineHeight: 21 }, code: { fontWeight: '800', color: colors.holoCyan }, dim: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  strong: { color: colors.text, fontWeight: '800', fontSize: 14 }, caption: { color: colors.textDim, fontSize: 10, textAlign: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 38, borderRadius: 19, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder },
  pillOn: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan }, pillText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  planName: { color: colors.text, fontSize: 24, fontWeight: '900' }, price: { color: colors.holoCyan, fontSize: 24, fontWeight: '900' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(94,234,212,0.4)' }, badgeText: { color: colors.holoCyan, fontSize: 11, fontWeight: '700' },
  face: { flex: 1, aspectRatio: 85 / 55, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  faceVertical: { aspectRatio: 55 / 85 }, faceEmpty: { color: colors.textDim, fontSize: 11, textAlign: 'center', padding: 8 },
  faceTag: { position: 'absolute', top: 6, left: 6, color: '#fff', fontSize: 10, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  thumb: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, thumbOn: { borderColor: colors.holoCyan },
  gallery: { width: 260, height: 195, borderRadius: 10, backgroundColor: colors.panelRaised },
  variant: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panelRaised }, variantOn: { borderColor: colors.holoCyan },
  vPhoto: { width: 40, height: 54, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  summary: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.panelRaised },
});
