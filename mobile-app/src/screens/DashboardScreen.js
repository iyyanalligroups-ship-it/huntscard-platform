import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { api, publicUrl, resolveAssetUrl, WEB_URL } from '../api/client.js';
import CardPreview from '../components/CardPreview.js';
import { Glyph } from '../components/Glyph.js';
import { Button, Card, Loading, Message, Pill, Screen, SelectField } from '../components/ui.js';
import { downloadAndShare } from '../lib/files.js';
import { capitalize, cardAspect } from '../lib/format.js';
import { getDeviceSafetyStatus } from '../native/deviceSafety.js';
import { evaluateChecks } from '../lib/deviceSafetyChecks.js';
import { colors } from '../theme/colors.js';

const FIELD_GROUPS = [
  { label: 'Basics', color: '#4f8ef7', fields: ['fullName', 'jobTitle', 'bio', 'photoUrl'] },
  { label: 'Contact', color: '#22c58b', fields: ['phone', 'whatsapp', 'publicEmail'] },
  { label: 'Links & social', color: '#f5a524', fields: ['instagramUrl', 'twitterUrl', 'portfolioUrl', 'huntsworldUrl'] },
];
const ORDER_STAGES = ['Order placed', 'Card created', 'Shipping', 'Delivered'];
const TAP_COUNT_POLL_MS = 15000;

function orderStage(p) {
  if (!p?.paid) return -1;
  if (p.delivered) return 3;
  if (p.dispatched) return 2;
  if (p.chipEncoded) return 1;
  return 0;
}

export default function DashboardScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [cards, setCards] = useState([]);
  const [selectedCardNumber, setSelectedCardNumber] = useState(null);
  const [magicCard, setMagicCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [zing, setZing] = useState('idle');
  const [toast, setToast] = useState('');
  const [device, setDevice] = useState(null);
  const zingTimer = useRef(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : null; setError('');
    try {
      const [profileData, cardData] = await Promise.all([api.getProfile(), api.getMyCards().catch(() => [])]);
      setProfile(profileData); setCards(cardData);
      setSelectedCardNumber((current) => current ?? profileData.primaryCardNumber ?? cardData[0]?.cardNumber ?? null);
    } catch (err) { setError(err.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // "Card taps" is the one number that changes without the client doing
  // anything, so poll for it exactly like the website's dashboard does.
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      api.getProfile().then((fresh) => setProfile((prev) => (prev ? { ...prev, tapCount: fresh.tapCount } : fresh))).catch(() => {});
    }, TAP_COUNT_POLL_MS);
    return () => clearInterval(timer);
  }, []));

  useEffect(() => {
    getDeviceSafetyStatus().then((status) => setDevice(evaluateChecks(status))).catch(() => setDevice(null));
  }, []);

  const selectedCard = cards.find((c) => c.cardNumber === selectedCardNumber) || null;

  // The hero preview shows the design with the AR QR baked in at its saved
  // position -- only for plans with the Magic Business Card feature.
  useEffect(() => {
    setMagicCard(null);
    if (!selectedCard?.magicEnabled || selectedCardNumber == null) return;
    let cancelled = false;
    api.getMyMagicCard(selectedCardNumber).then((card) => { if (!cancelled) setMagicCard(card); }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCardNumber, selectedCard?.magicEnabled]);

  useEffect(() => () => clearTimeout(zingTimer.current), []);

  function flashToast(message) { setToast(message); setTimeout(() => setToast(''), 2600); }

  async function handleZing() {
    if (!profile?.clientId || zing === 'busy') return;
    setZing('busy');
    const shareUrl = `${WEB_URL}/c/${profile.clientId}`;
    try {
      let shared = false;
      if (await Sharing.isAvailableAsync()) {
        try {
          await downloadAndShare({ url: publicUrl(`/api/public/vcard/${profile.clientId}`), filename: `${profile.fullName || 'contact'}.vcf`, mimeType: 'text/vcard', dialogTitle: `${profile.fullName} — HuntsTAG` });
          shared = true;
        } catch { /* fall back to sharing the link below */ }
      }
      if (!shared) await Share.share({ title: `${profile.fullName} — HuntsTAG`, message: `${profile.fullName} — HuntsTAG\n${shareUrl}`, url: shareUrl });
      setZing('success');
    } catch {
      flashToast('Could not share'); setZing('fail');
    }
    clearTimeout(zingTimer.current);
    zingTimer.current = setTimeout(() => setZing('idle'), 2500);
  }

  if (loading) return <Screen><Loading label="Loading your dashboard…" /></Screen>;
  if (error && !profile) return <Screen><Message>{error}</Message></Screen>;

  const firstName = (profile?.fullName || 'there').split(' ')[0];
  const groups = FIELD_GROUPS.map((g) => ({ ...g, filled: g.fields.filter((f) => Boolean(profile?.[f] && String(profile[f]).trim())).length, total: g.fields.length }));
  const totalFields = groups.reduce((s, g) => s + g.total, 0);
  const totalFilled = groups.reduce((s, g) => s + g.filled, 0);
  const pct = Math.round((totalFilled / totalFields) * 100);
  const stage = orderStage(profile);
  const planLabel = profile?.cardType ? capitalize(profile.cardType) : 'No card yet';
  const statusLabel = stage === -1 ? 'No order yet' : ORDER_STAGES[stage];
  const heroShape = selectedCard ? selectedCard.shape : profile?.cardShape;
  const heroDesign = selectedCard ? selectedCard.cardDesignUrl : profile?.cardFrontImageUrl;
  const heroLabel = selectedCard?.label || selectedCard?.variantName || planLabel;
  const designUri = resolveAssetUrl(magicCard?.imageUrl || heroDesign);
  const qrPos = magicCard?.qrPosition || { x: 82, y: 82 };
  const aspect = cardAspect(heroShape);
  const R = 84; const C = 2 * Math.PI * R;

  const kpis = [
    { label: 'Card taps', value: profile?.tapCount ?? 0, sub: 'Times your card was opened', icon: 'eye', color: colors.holoCyan, live: true },
    { label: 'Your plan', value: planLabel, sub: profile?.paid ? 'Paid' : 'Not purchased yet', icon: 'card', color: '#4f8ef7' },
    { label: 'Order status', value: statusLabel, sub: profile?.trackingId ? `Tracking ${profile.trackingId}` : 'Full details on Track', icon: 'truck', color: '#f5a524' },
    { label: 'Profile complete', value: `${pct}%`, sub: `${totalFilled} of ${totalFields} fields filled`, icon: 'badgeCheck', color: '#22c58b' },
  ];

  return <Screen refreshing={refreshing} onRefresh={() => load(true)}>
    {profile?.cardActive === false ? <Pressable onPress={() => navigation.navigate('Settings')}>
      <Message>Your card is currently deactivated -- visitors see a "card deactivated" message instead of your profile. Tap to reactivate it.</Message>
    </Pressable> : null}
    <Message>{error}</Message>

    <Card style={{ gap: 14 }}>
      <Text style={styles.h1}>Welcome, {firstName}</Text>
      <Text style={styles.dim}>
        {stage >= 1 ? 'Your HuntsTAG is live. Tap stats and order progress below.' : profile?.paid ? 'Your card is being prepared. Follow its progress below.' : 'Complete your profile, then grab a card from the Shop.'}
      </Text>
      <View style={styles.row}>
        <Button compact title="View my card" onPress={() => navigation.navigate('Profile')} />
        <Pill>{heroLabel}</Pill>
      </View>
      {cards.length > 1 ? <SelectField value={selectedCardNumber ?? ''} onChange={(value) => setSelectedCardNumber(Number(value))} options={cards.map((card) => ({ value: card.cardNumber, label: `Card ${card.cardNumber} · ${card.label || card.variantName || card.planName || 'Untitled'}` }))} /> : null}
      {designUri ? <CardPreview uri={designUri} aspect={aspect} style={{ maxHeight: 320 }} qrUri={magicCard?.imageUrl && profile?.clientId ? publicUrl(`/api/public/qr/${profile.clientId}?type=ar&card=${selectedCardNumber}&fg=000000&bg=ffffff`) : null} qrPos={qrPos} />
        : <View style={[styles.preview, { aspectRatio: aspect }]}><View style={styles.previewEmpty}><Text style={styles.brand}>huntsTAG</Text><Text style={styles.dim}>Your card design will appear here</Text></View></View>}
    </Card>

    <Card style={styles.zing}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.h2}>⚡ Zing</Text>
        <Text style={styles.dim}>{profile?.zingEnabled ? 'No card on you? Zing your contact straight to their phone.' : `Zing isn't included in your current plan${profile?.cardType ? ` (${profile.cardType})` : ''}.`}</Text>
      </View>
      {profile?.zingEnabled ? <View style={{ alignItems: 'center', gap: 6 }}>
        <Pressable onPress={handleZing} disabled={zing === 'busy'} style={[styles.zingBtn, zing === 'success' && { backgroundColor: '#22c58b' }, zing === 'fail' && { backgroundColor: colors.danger }]}>
          <Text style={styles.zingGlyph}>{zing === 'success' ? '✓' : zing === 'fail' ? '!' : zing === 'busy' ? '…' : '⚡'}</Text>
        </Pressable>
        <Text style={styles.caption}>{zing === 'success' ? 'Shared!' : zing === 'fail' ? 'Try again' : zing === 'busy' ? 'Sharing…' : 'Zing my contact'}</Text>
      </View> : <Button compact title="See plans" onPress={() => navigation.navigate('Shop')} />}
    </Card>
    {toast ? <Text style={styles.toast}>{toast}</Text> : null}

    <View style={styles.kpis}>
      {kpis.map((k) => <Card key={k.label} style={styles.kpi}>
        <View style={[styles.kpiChip, { backgroundColor: `${k.color}22` }]}><Glyph name={k.icon} size={18} color={k.color} /></View>
        <Text style={styles.kpiValue} numberOfLines={1}>{String(k.value)}</Text>
        <Text style={styles.kpiLabel}>{k.label}{k.live ? '  ●' : ''}</Text>
        <Text style={styles.caption} numberOfLines={2}>{k.sub}</Text>
      </Card>)}
    </View>

    <Card style={{ gap: 14 }}>
      <Text style={styles.h2}>Profile completeness</Text>
      <View style={styles.donutRow}>
        <Svg width={150} height={150} viewBox="0 0 200 200">
          <Defs><LinearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0%" stopColor="#4f8ef7" /><Stop offset="50%" stopColor="#22c58b" /><Stop offset="100%" stopColor="#f5a524" /></LinearGradient></Defs>
          <Circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
          <Circle cx="100" cy="100" r={R} fill="none" stroke="url(#donutGrad)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 100 100)" />
        </Svg>
        <View style={styles.donutCenter}><Text style={styles.pct}>{pct}%</Text><Text style={styles.caption}>complete</Text></View>
        <View style={{ flex: 1, gap: 10 }}>
          {groups.map((g) => <View key={g.label} style={styles.legend}><View style={[styles.legendDot, { backgroundColor: g.color }]} /><Text style={[styles.dim, { flex: 1 }]}>{g.label}</Text><Text style={styles.legendValue}>{g.filled}/{g.total}</Text></View>)}
        </View>
      </View>
      {pct < 100 ? <Button compact kind="ghost" title="Finish your profile →" onPress={() => navigation.navigate('Profile Settings')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} /> : null}
    </Card>

    <Card style={{ gap: 14 }}>
      <Text style={styles.h2}>Order progress</Text>
      {stage === -1 ? <View style={{ gap: 12 }}><Text style={styles.dim}>No card order yet.</Text><Button compact title="Browse the Shop" onPress={() => navigation.navigate('Shop')} style={{ alignSelf: 'flex-start' }} /></View> : <>
        {ORDER_STAGES.map((label, i) => <View key={label} style={styles.stage}>
          <View style={[styles.stageDot, i <= stage && styles.stageDotDone]}>{i <= stage ? <Glyph name="check" size={13} color="#06120f" strokeWidth={3} /> : <Text style={styles.stageNum}>{i + 1}</Text>}</View>
          <Text style={[styles.stageLabel, i > stage && { color: colors.textDim }]}>{label}</Text>
        </View>)}
        <Button compact kind="ghost" title="Full tracking details →" onPress={() => navigation.navigate('Track Orders')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </>}
    </Card>

    <Pressable onPress={() => navigation.navigate('Device Protection Check')}>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}><Glyph name="shield" size={18} color={colors.holoCyan} /><Text style={[styles.h2, { flex: 1 }]}>Device protection</Text>{device ? <Text style={styles.score}>{device.passCount} of {device.total} checks passed</Text> : null}</View>
        <Text style={styles.dim}>{device ? "A quick look at this phone's security settings — nothing is scanned, nothing leaves this device." : 'Open the Device Protection Check to review this phone\'s security settings (needs the Android development build).'}</Text>
        <Text style={styles.link}>Open the full check →</Text>
      </Card>
    </Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }, h2: { color: colors.text, fontSize: 17, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 }, caption: { color: colors.textDim, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  preview: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: colors.panelRaised, alignSelf: 'center', maxHeight: 320 },
  previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, brand: { color: colors.holoCyan, fontWeight: '900', fontSize: 24 },
  zing: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  zingBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' }, zingGlyph: { fontSize: 22, color: '#06120f', fontWeight: '900' },
  toast: { color: colors.text, backgroundColor: colors.panelRaised, padding: 10, borderRadius: 10, textAlign: 'center', overflow: 'hidden' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, kpi: { width: '48%', gap: 4, padding: 14 },
  kpiChip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kpiValue: { color: colors.text, fontSize: 20, fontWeight: '900' }, kpiLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, donutCenter: { position: 'absolute', left: 0, width: 150, alignItems: 'center' },
  pct: { color: colors.text, fontSize: 26, fontWeight: '900' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 }, legendDot: { width: 10, height: 10, borderRadius: 5 }, legendValue: { color: colors.text, fontWeight: '800', fontSize: 12 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stageDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised }, stageDotDone: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan },
  stageNum: { color: colors.textDim, fontSize: 11, fontWeight: '800' }, stageLabel: { color: colors.text, fontWeight: '700' },
  score: { color: colors.holoCyan, fontSize: 11, fontWeight: '800' }, link: { color: colors.holoCyan, fontWeight: '700', fontSize: 13 },
});
