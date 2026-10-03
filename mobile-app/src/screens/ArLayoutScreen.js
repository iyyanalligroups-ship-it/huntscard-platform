import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, publicUrl, resolveAssetUrl } from '../api/client.js';
import ArLayoutCanvas from '../components/ArLayoutCanvas.js';
import { Glyph } from '../components/Glyph.js';
import { Button, Card, Loading, Message, Screen, Stepper, Tabs, Title } from '../components/ui.js';
import { downloadAndShare } from '../lib/files.js';
import { cardAspect } from '../lib/format.js';
import { navigate } from '../navigation/navigationRef.js';
import { colors } from '../theme/colors.js';

const MODEL_SCALE_MIN = 0.3; const MODEL_SCALE_MAX = 2.5;
const VIDEO_SCALE_MIN = 0.3; const VIDEO_SCALE_MAX = 10;
const ROTATE_STEP = 5; const HEIGHT_STEP = 5; const SCALE_STEP = 0.1;
const clampHeight = (v) => Math.max(0, Math.min(100, v));
const round2 = (v) => Math.round(v * 100) / 100;

const BUILTIN = [['video', 'Video'], ['contact', 'Call'], ['portfolio', 'Portfolio'], ['social', 'Social'], ['huntsworld', 'Huntsworld'], ['model', '3D model']];

function Control({ label, value, onChange, step, min, max, display }) {
  return <View style={styles.control}>
    <Text style={styles.controlLabel}>{label}</Text>
    <Pressable2 onPress={() => onChange(Math.max(min, round2(value - step)))} disabled={value <= min} name="minus" />
    <Text style={styles.controlValue}>{display ?? value}</Text>
    <Pressable2 onPress={() => onChange(Math.min(max, round2(value + step)))} disabled={value >= max} name="plus" />
  </View>;
}

function Pressable2({ onPress, disabled, name }) {
  return <Button compact kind="secondary" onPress={onPress} disabled={disabled} title="" icon={name} style={{ minHeight: 30, width: 34, paddingHorizontal: 0 }} />;
}

export default function ArLayoutScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [cards, setCards] = useState(null);
  const [selected, setSelected] = useState(null);
  const [layout, setLayout] = useState(null);
  const [arComponents, setArComponents] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, list, attrs] = await Promise.all([api.getProfile(), api.getMyCards(), api.getAttributeDefinitions().catch(() => [])]);
      setProfile(p); setCards(list); setArComponents(attrs.filter((a) => a.arComponent));
      setSelected((current) => current ?? list[0]?.cardNumber ?? null);
    } catch (err) { setError(err.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const card = cards?.find((c) => c.cardNumber === selected) || null;

  useFocusEffect(useCallback(() => {
    if (!card?.arEnabled) { setLayout(null); return; }
    let cancelled = false;
    setLayout(null);
    api.getMyArLayout(selected).then((raw) => { if (!cancelled) setLayout({ ...raw, ...(raw.customElements || {}) }); }).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [selected, card?.arEnabled]));

  const set = (key) => (value) => setLayout((prev) => ({ ...prev, [key]: value }));
  const setPos = useCallback((key, pos) => setLayout((prev) => ({ ...prev, [key]: { ...(prev?.[key] || {}), ...pos } })), []);
  const setZ = (key) => (z) => setLayout((prev) => ({ ...prev, [key]: { ...(prev?.[key] || {}), z: clampHeight(z) } }));

  const hasVideo = Boolean(profile?.arBannerUrl || profile?.arVideoUrl);
  const hasModel = Boolean(profile?.arModelUrl);

  const items = useMemo(() => {
    if (!layout) return [];
    const visible = BUILTIN.filter(([key]) => (key === 'video' ? hasVideo : key === 'model' ? hasModel : true));
    const all = [...visible, ...arComponents.map((c) => [c.key, c.label])];
    return [
      { key: 'qr', label: 'QR', pos: { x: layout.qr?.x ?? 50, y: layout.qr?.y ?? 50 }, fixed: true },
      ...all.map(([key, label]) => ({ key, label, pos: { x: layout[key]?.x ?? 50, y: layout[key]?.y ?? 120 } })),
    ];
  }, [layout, hasVideo, hasModel, arComponents]);

  async function save() {
    setStatus('Saving...'); setError('');
    try {
      const { qr, video, contact, portfolio, social, huntsworld, model, modelRotationX, modelRotationY, modelRotationZ, modelScale, videoRotationX, videoRotationY, videoRotationZ, videoScaleX, videoScaleY } = layout;
      const customElements = {};
      for (const c of arComponents) if (layout[c.key]) customElements[c.key] = layout[c.key];
      const updated = await api.saveMyArLayout({ qr, video, contact, portfolio, social, huntsworld, model, modelRotationX, modelRotationY, modelRotationZ, modelScale, videoRotationX, videoRotationY, videoRotationZ, videoScaleX, videoScaleY, customElements }, selected);
      setLayout({ ...updated, ...(updated.customElements || {}) });
      if (qr) api.saveMyMagicCardQrPosition(qr.x, qr.y, selected).catch(() => {});
      setStatus('Saved -- this is how your card will look in HuntsAR World.');
    } catch (err) { setError(err.message); setStatus(''); }
  }

  async function downloadQr() {
    setBusy(true); setError('');
    try { await downloadAndShare({ url: publicUrl(`/api/public/qr/${profile.clientId}?type=ar&transparent=1&card=${selected}`), filename: `huntsTAG-ar-qr-${profile.clientId}.png`, mimeType: 'image/png', dialogTitle: 'AR QR' }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const picker = cards && cards.length > 1 ? <Tabs value={selected} onChange={setSelected} tabs={cards.map((c) => ({ key: c.cardNumber, label: `Card ${c.cardNumber}${c.label ? ` · ${c.label}` : c.variantName ? ` · ${c.variantName}` : ''}` }))} /> : null;

  if (error && !profile) return <Screen><Message>{error}</Message></Screen>;
  if (!profile || !cards) return <Screen><Loading /></Screen>;
  if (!cards.length) return <Screen><Title subtitle="You don't have a card yet -- pick a plan to get started.">AR Layout</Title><Button title="See plans" onPress={() => navigation.navigate('Shop')} /></Screen>;
  if (!card?.arEnabled) return <Screen>
    <Title>AR Layout</Title>{picker}
    <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 28 }}>
      <Text style={styles.text}>{card?.planName ? `AR isn't included in this card's plan (${card.planName}).` : "AR isn't included until you've got a card plan."}</Text>
      <Text style={styles.hint}>Upgrade to a plan with AR to get your own AR QR code and control how your video, contact info, and links float around it in HuntsAR World.</Text>
      <Button title="See plans with AR" onPress={() => navigation.navigate('Shop')} />
    </Card>
  </Screen>;
  if (!layout) return <Screen><Title>AR Layout</Title>{picker}<Loading /></Screen>;

  return <Screen>
    <Title subtitle={`Showing the ${card.qrSide === 'back' ? 'back' : 'front'} side where this card's QR is printed. The QR code is the anchor a phone locks onto when scanning -- its position is fixed. Drag anything else to where you want it to float relative to that QR.`}>AR Layout</Title>
    {picker}
    <Card style={{ gap: 10 }} >
      <Text style={styles.cardTitle}>Layout</Text>
      <Text style={styles.hint}>Drag an element to reposition it. Positions are percentages of the card, the same values the website editor uses.</Text>
      <ArLayoutCanvas cardUri={card.cardDesignUrl} aspect={cardAspect(card.shape)} items={items} onDragPosition={setPos} onDragStateChange={setDragging} />
      {dragging ? <Text style={styles.hint}>Moving…</Text> : null}
      <Button kind="secondary" icon="scan" title="Open scan preview (live AR)" onPress={() => navigate('AR Experience', { clientId: profile.clientId, cardNumber: selected })} />
    </Card>

    {hasModel ? <Card style={{ gap: 6 }}>
      <Text style={styles.cardTitle}>3D Model controls</Text>
      <Control label="Rotate left/right" value={layout.modelRotationY ?? 0} onChange={set('modelRotationY')} step={ROTATE_STEP} min={-180} max={180} display={`${Math.round(layout.modelRotationY ?? 0)}°`} />
      <Control label="Rotate up/down" value={layout.modelRotationX ?? 0} onChange={set('modelRotationX')} step={ROTATE_STEP} min={-90} max={90} display={`${Math.round(layout.modelRotationX ?? 0)}°`} />
      <Control label="Roll" value={layout.modelRotationZ ?? 0} onChange={set('modelRotationZ')} step={ROTATE_STEP} min={-180} max={180} display={`${Math.round(layout.modelRotationZ ?? 0)}°`} />
      <Control label="Height off card" value={layout.model?.z ?? 0} onChange={setZ('model')} step={HEIGHT_STEP} min={0} max={100} display={`${layout.model?.z ?? 0}%`} />
      <Control label="Size" value={layout.modelScale ?? 1} onChange={set('modelScale')} step={SCALE_STEP} min={MODEL_SCALE_MIN} max={MODEL_SCALE_MAX} display={(layout.modelScale ?? 1).toFixed(1)} />
    </Card> : null}

    {hasVideo ? <Card style={{ gap: 6 }}>
      <Text style={styles.cardTitle}>AR Video / Photo controls</Text>
      <Control label="Rotate left/right" value={layout.videoRotationY ?? 0} onChange={set('videoRotationY')} step={ROTATE_STEP} min={-180} max={180} display={`${Math.round(layout.videoRotationY ?? 0)}°`} />
      <Control label="Rotate up/down" value={layout.videoRotationX ?? 0} onChange={set('videoRotationX')} step={ROTATE_STEP} min={-90} max={90} display={`${Math.round(layout.videoRotationX ?? 0)}°`} />
      <Control label="Roll" value={layout.videoRotationZ ?? 0} onChange={set('videoRotationZ')} step={ROTATE_STEP} min={-180} max={180} display={`${Math.round(layout.videoRotationZ ?? 0)}°`} />
      <Control label="Height off card" value={layout.video?.z ?? 0} onChange={setZ('video')} step={HEIGHT_STEP} min={0} max={100} display={`${layout.video?.z ?? 0}%`} />
      <Control label="Width" value={layout.videoScaleX ?? 1} onChange={set('videoScaleX')} step={SCALE_STEP} min={VIDEO_SCALE_MIN} max={VIDEO_SCALE_MAX} display={(layout.videoScaleX ?? 1).toFixed(1)} />
      <Control label="Height" value={layout.videoScaleY ?? 1} onChange={set('videoScaleY')} step={SCALE_STEP} min={VIDEO_SCALE_MIN} max={VIDEO_SCALE_MAX} display={(layout.videoScaleY ?? 1).toFixed(1)} />
    </Card> : null}

    <View style={{ gap: 8 }}>
      <Button title="Save layout" onPress={save} />
      {status ? <Text style={[styles.hint, { color: colors.holoCyan }]}>{status}</Text> : null}
      <Message>{error}</Message>
    </View>
    <Card style={{ gap: 10 }}>
      <Button kind="secondary" icon="download" title={busy ? 'Preparing…' : 'Download AR QR'} disabled={busy} onPress={downloadQr} />
      <Text style={styles.hint}>To print or share separately from your NFC tap card -- your card's own design/color can be different from the QR's.</Text>
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 14, textAlign: 'center' }, hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }, controlLabel: { color: colors.textDim, fontSize: 12, flex: 1 }, controlValue: { color: colors.text, fontWeight: '700', width: 48, textAlign: 'center', fontSize: 12 },
});
