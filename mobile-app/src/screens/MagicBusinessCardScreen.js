import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { api, publicUrl, resolveAssetUrl } from '../api/client.js';
import CardPreview from '../components/CardPreview.js';
import { Glyph } from '../components/Glyph.js';
import { NativeVideo } from '../components/Media.js';
import { pickMedia } from '../components/MediaUploader.js';
import { downloadAndShare } from '../lib/files.js';
import { Button, Card, Field, Loading, Message, Pill, Screen, Tabs, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_MODEL_BYTES = 50 * 1024 * 1024;
const CARD_MM = { width: 85, height: 55 };
const CARD_UPLOAD_SIZES = { horizontal: { width: 1004, height: 650 }, vertical: { width: 650, height: 1004 } };
const COMPONENT_DEFS = [{ key: 'contact', label: 'Call' }, { key: 'portfolio', label: 'Portfolio' }, { key: 'social', label: 'Social' }, { key: 'huntsworld', label: 'Huntsworld' }];
const QR_SWATCHES = ['#000000', '#ffffff', '#0d9394', '#7367f0', '#e58a16', '#111827'];
const HEX = /^#[0-9a-fA-F]{6}$/;

// Same math as MagicBusinessCard.jsx's initialCropForAspect: the largest
// centred crop of the picked video that matches the card image's aspect.
function initialCropForAspect(naturalWidth, naturalHeight, aspectRatio) {
  const heightIfFullWidth = naturalWidth / (naturalHeight * aspectRatio);
  if (heightIfFullWidth <= 1) return { x: 0, y: (1 - heightIfFullWidth) / 2, width: 1, height: heightIfFullWidth };
  const widthIfFullHeight = (naturalHeight * aspectRatio) / naturalWidth;
  return { x: (1 - widthIfFullHeight) / 2, y: 0, width: widthIfFullHeight, height: 1 };
}

function Step({ label, value, display, onMinus, onPlus, minDisabled, plusDisabled }) {
  return <View style={styles.step}>
    <Text style={styles.stepLabel}>{label}</Text>
    <Pressable style={[styles.stepBtn, minDisabled && { opacity: 0.4 }]} disabled={minDisabled} onPress={onMinus}><Glyph name="minus" size={13} /></Pressable>
    <Text style={styles.stepValue}>{display ?? value}</Text>
    <Pressable style={[styles.stepBtn, plusDisabled && { opacity: 0.4 }]} disabled={plusDisabled} onPress={onPlus}><Glyph name="plus" size={13} /></Pressable>
  </View>;
}

export default function MagicBusinessCardScreen({ navigation }) {
  const [cards, setCards] = useState(null);
  const [selected, setSelected] = useState(null);
  const [card, setCard] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [magicComponents, setMagicComponents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [imageDims, setImageDims] = useState(null);
  const [qrFg, setQrFg] = useState('#000000');
  const [qrBg, setQrBg] = useState('#ffffff');
  const [qrTransparent, setQrTransparent] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const previewRef = useRef(null);

  useFocusEffect(useCallback(() => {
    api.getMyCards().then((list) => { setCards(list); setSelected((c) => c ?? list[0]?.cardNumber ?? null); }).catch((err) => setError(err.message));
    api.getProfile().then((p) => setClientId(p.clientId)).catch(() => {});
    api.getAttributeDefinitions().then((all) => setMagicComponents(all.filter((a) => a.magicComponent))).catch(() => {});
  }, []));

  const selectedCard = cards?.find((c) => c.cardNumber === selected) || null;

  useFocusEffect(useCallback(() => {
    setCard(null);
    if (!selected || !selectedCard?.magicEnabled) return undefined;
    let cancelled = false;
    api.getMyMagicCard(selected).then((c) => !cancelled && setCard(c)).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [selected, selectedCard?.magicEnabled]));

  useFocusEffect(useCallback(() => {
    if (!card?.imageUrl) { setImageDims(null); return undefined; }
    let cancelled = false;
    Image.getSize(resolveAssetUrl(card.imageUrl), (width, height) => !cancelled && setImageDims({ width, height }), () => !cancelled && setImageDims(null));
    return () => { cancelled = true; };
  }, [card?.imageUrl]));

  const merge = (updated) => setCard((prev) => ({ ...prev, ...updated }));
  const guard = (key, fn) => async () => { setError(''); setBusy(key); try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(''); } };

  const allComponents = useMemo(() => [...COMPONENT_DEFS, ...magicComponents.map((c) => ({ key: c.key, label: c.label }))], [magicComponents]);
  const isBuiltin = (key) => COMPONENT_DEFS.some((d) => d.key === key);
  const getPos = (key) => card?.componentPositions?.[key] || card?.magicElements?.[key] || { x: 50, y: 120, z: 0, rotation: 0 };
  function setPos(key, patch) {
    setCard((prev) => (isBuiltin(key)
      ? { ...prev, componentPositions: { ...prev.componentPositions, [key]: { ...prev.componentPositions?.[key], ...patch } } }
      : { ...prev, magicElements: { ...prev.magicElements, [key]: { ...prev.magicElements?.[key], ...patch } } }));
    setSaveStatus('');
  }

  const chooseImage = guard('image', async () => {
    const target = CARD_UPLOAD_SIZES[card?.cardType === 'vertical' ? 'vertical' : 'horizontal'];
    const asset = await pickMedia({ kind: 'image', editing: true, aspect: [target.width, target.height], quality: 1 });
    if (!asset) return;
    const resized = await manipulateAsync(asset.uri, [{ resize: { width: target.width, height: target.height } }], { compress: 0.92, format: SaveFormat.JPEG });
    merge(await api.uploadMyMagicCardImage({ uri: resized.uri, mimeType: 'image/jpeg', fileName: 'card.jpg' }, target.width, target.height, selected));
  });

  const chooseVideo = guard('video', async () => {
    if (!imageDims) throw new Error('This card has no design image to match yet.');
    const asset = await pickMedia({ kind: 'video' });
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_VIDEO_BYTES) throw new Error('That video is over 80MB -- pick a smaller one.');
    const crop = asset.width && asset.height ? initialCropForAspect(asset.width, asset.height, imageDims.width / imageDims.height) : { x: 0, y: 0, width: 1, height: 1 };
    merge(await api.uploadMyMagicCardVideo(asset, crop, selected));
  });

  const chooseModel = guard('model', async () => {
    const asset = await pickMedia({ kind: 'model' });
    if (!asset) return;
    if (asset.size && asset.size > MAX_MODEL_BYTES) throw new Error('That 3D model is over 50MB -- pick a smaller one.');
    merge(await api.uploadMyMagicCardModel(asset, selected));
  });

  const toggleActive = guard('active', async () => merge(card?.active ? await api.deactivateMyMagicCard(selected) : await api.activateMyMagicCard(selected)));
  const removeVideo = guard('rmVideo', async () => merge(await api.removeMyMagicCardVideo(selected)));
  const removeImage = guard('rmImage', async () => merge(await api.removeMyMagicCardImage(selected)));
  const removeModel = guard('rmModel', async () => merge(await api.removeMyMagicCardModel(selected)));

  const savePositions = guard('save', async () => {
    setSaveStatus('Saving...');
    try {
      await Promise.all(allComponents.map(({ key }) => { const pos = getPos(key); return api.saveMyMagicCardComponentPosition(key, pos.x ?? 50, pos.y ?? 120, pos.z ?? 0, pos.rotation ?? 0, selected); }));
      setSaveStatus('Saved.');
    } catch (err) { setSaveStatus(''); throw err; }
  });

  const downloadCard = guard('download', async () => {
    const target = CARD_UPLOAD_SIZES[card?.cardType === 'vertical' ? 'vertical' : 'horizontal'];
    const uri = await captureRef(previewRef, { format: 'png', quality: 1, width: target.width, height: target.height, result: 'tmpfile' });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Magic Business Card' });
  });

  const downloadQrOnly = guard('qr', async () => {
    await downloadAndShare({ url: qrUrl, filename: `huntsTAG-ar-qr-${clientId}.png`, mimeType: 'image/png', dialogTitle: 'AR QR' });
  });

  const picker = cards && cards.length > 1 ? <Tabs value={selected} onChange={setSelected} tabs={cards.map((c) => ({ key: c.cardNumber, label: `Card ${c.cardNumber}${c.label ? ` · ${c.label}` : c.variantName ? ` · ${c.variantName}` : ''}` }))} /> : null;

  if (!cards) return <Screen><Title>Magic Business Card</Title><Message>{error}</Message>{!error ? <Loading /> : null}</Screen>;
  if (!cards.length) return <Screen><Title subtitle="You don't have a card yet -- pick a plan to get started.">Magic Business Card</Title><Button title="See plans" onPress={() => navigation.navigate('Shop')} /></Screen>;
  if (!selectedCard?.magicEnabled) return <Screen>
    <Title>Magic Business Card</Title>{picker}
    <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 28 }}>
      <Text style={styles.text}>{selectedCard?.planName ? `Magic Business Card isn't included in this card's plan (${selectedCard.planName}).` : "Magic Business Card isn't included until you've got a card plan."}</Text>
      <Button title="See plans" onPress={() => navigation.navigate('Shop')} />
    </Card>
  </Screen>;
  if (!card && !error) return <Screen><Title>Magic Business Card</Title>{picker}<Loading /></Screen>;

  const canActivate = Boolean(card?.available && card?.videoUrl);
  const qrParams = `fg=${qrFg.slice(1)}&bg=${qrBg.slice(1)}${qrTransparent ? '&transparent=1' : ''}`;
  const qrUrl = clientId ? publicUrl(`/api/public/qr/${clientId}?type=ar&card=${selected}&${qrParams}`) : null;
  const qrPos = card?.qrPosition || { x: 78, y: 80 };
  const aspect = imageDims ? imageDims.width / imageDims.height : card?.cardType === 'vertical' ? CARD_MM.height / CARD_MM.width : CARD_MM.width / CARD_MM.height;

  return <Screen>
    <Title subtitle={card?.available ? "Your card's design, an AR video that plays on it, and where the AR buttons float." : "Magic Business Card isn't available for this card yet."}>Magic Business Card</Title>
    {picker}
    <Message>{error}</Message>

    {qrUrl ? <Card style={{ gap: 12 }}>
      <Text style={styles.cardTitle}>Scan QR</Text>
      <Text style={styles.hint}>The same QR as your AR Layout page -- scanning it lets people choose between this Magic effect and your HuntsAR World AR components. Pick colors that stay readable against your card.</Text>
      <Text style={styles.label}>Foreground</Text>
      <View style={styles.swatches}>{QR_SWATCHES.map((c) => <Pressable key={c} onPress={() => setQrFg(c)} style={[styles.swatch, { backgroundColor: c }, qrFg === c && styles.swatchOn]} />)}</View>
      <Field label="Foreground hex" value={qrFg} onChangeText={(v) => setQrFg(v.startsWith('#') ? v : `#${v}`)} autoCapitalize="none" maxLength={7} />
      <Text style={styles.label}>Background</Text>
      <View style={[styles.swatches, qrTransparent && { opacity: 0.4 }]}>{QR_SWATCHES.map((c) => <Pressable key={c} disabled={qrTransparent} onPress={() => setQrBg(c)} style={[styles.swatch, { backgroundColor: c }, qrBg === c && styles.swatchOn]} />)}</View>
      <Button compact kind={qrTransparent ? 'primary' : 'secondary'} icon={qrTransparent ? 'check' : undefined} title="Transparent background" onPress={() => setQrTransparent((v) => !v)} style={{ alignSelf: 'flex-start' }} />
      <Image source={{ uri: HEX.test(qrFg) && HEX.test(qrBg) ? qrUrl : publicUrl(`/api/public/qr/${clientId}?type=ar&card=${selected}`) }} style={styles.qr} />
      <Button compact kind="secondary" icon="download" title={busy === 'qr' ? 'Preparing…' : 'Download QR only'} disabled={busy === 'qr'} onPress={downloadQrOnly} style={{ alignSelf: 'flex-start' }} />
    </Card> : null}

    <Card style={{ gap: 14 }}>
      <View style={styles.between}>
        {card?.active ? <Pill>Live -- visible now</Pill> : <Pill tone="dim">Draft -- not live yet</Pill>}
        {!card?.active ? <Button compact kind="secondary" title="Go live" disabled={busy === 'active' || !canActivate} onPress={toggleActive} /> : null}
      </View>
      {!card?.active && !canActivate ? <Text style={styles.hint}>Add both an image and a video first to go live.</Text> : null}
      <View><Text style={styles.cardTitle}>Card type</Text><Text style={styles.hint}>Real business card size either way (85 x 55mm) -- locked to whatever you actually purchased for this card.</Text><Text style={[styles.text, { textTransform: 'capitalize', textAlign: 'left', fontWeight: '800' }]}>{card?.cardType || '—'}</Text></View>

      <Text style={styles.hint}>Card preview{card?.videoUrl ? ' -- video below' : ''}</Text>
      {card?.imageUrl ? <View ref={previewRef} collapsable={false} style={{ borderRadius: 14, overflow: 'hidden' }}>
        <CardPreview uri={resolveAssetUrl(card.imageUrl)} aspect={aspect} fit="cover" qrUri={qrUrl} qrPos={qrPos} style={{ maxHeight: 360 }} />
      </View> : <View style={[styles.empty, { aspectRatio: aspect }]}><Text style={styles.hint}>Add a card image below to see your Magic Business Card.</Text></View>}
      {card?.imageUrl ? <Button compact kind="secondary" icon="download" title={busy === 'download' ? 'Preparing…' : 'Download card (with QR)'} disabled={busy === 'download'} onPress={downloadCard} style={{ alignSelf: 'flex-start' }} /> : null}

      <View style={styles.divider} />
      <Text style={styles.cardTitle}>Card image</Text>
      <View style={styles.btnRow}>
        <Button compact kind="secondary" icon="upload" title={busy === 'image' ? 'Uploading…' : card?.imageUrl ? 'Replace image' : 'Upload image'} disabled={busy === 'image'} onPress={chooseImage} />
        {card?.imageUrl ? <Button compact kind="danger" icon="trash" title="Remove" disabled={busy === 'rmImage'} onPress={removeImage} /> : null}
      </View>
      <Text style={styles.hint}>Cropped to {card?.cardType === 'vertical' ? '650×1004' : '1004×650'} for printing. JPEG/PNG/WEBP up to 50MB.</Text>

      <View style={styles.divider} />
      <Text style={styles.cardTitle}>AR video</Text>
      {card?.videoUrl ? <NativeVideo uri={card.videoUrl} style={{ width: '100%', aspectRatio: aspect, backgroundColor: '#000', borderRadius: 12 }} muted /> : null}
      <View style={styles.btnRow}>
        <Button compact kind="secondary" icon="upload" title={busy === 'video' ? 'Uploading…' : card?.videoUrl ? 'Replace video' : 'Upload video'} disabled={busy === 'video' || !card?.imageUrl} onPress={chooseVideo} />
        {card?.videoUrl ? <Button compact kind="danger" icon="trash" title="Remove" disabled={busy === 'rmVideo'} onPress={removeVideo} /> : null}
      </View>
      <Text style={styles.hint}>{card?.imageUrl ? 'The video is centre-cropped to match your card image. MP4/MOV up to 80MB.' : 'Add the card image first -- the video is cropped to match it.'}</Text>

      <View style={styles.divider} />
      <Text style={styles.cardTitle}>3D model (optional)</Text>
      {card?.modelUrl ? <View style={styles.modelBox}><Glyph name="box" size={26} color={colors.holoCyan} /><Text style={styles.text}>3D model uploaded ({card.modelType || 'model'})</Text></View> : null}
      <View style={styles.btnRow}>
        <Button compact kind="secondary" icon="upload" title={busy === 'model' ? 'Uploading…' : card?.modelUrl ? 'Replace model' : 'Upload .glb / .fbx'} disabled={busy === 'model'} onPress={chooseModel} />
        {card?.modelUrl ? <Button compact kind="danger" icon="trash" title="Remove" disabled={busy === 'rmModel'} onPress={removeModel} /> : null}
      </View>
    </Card>

    {card?.imageUrl ? <Card style={{ gap: 12 }}>
      <Text style={styles.cardTitle}>AR components</Text>
      <Text style={styles.hint}>Call, Portfolio, Social, and any extra fields admin has marked for Magic -- shown as rectangular buttons that float with your card when someone scans it in Magic mode. Set where each sits (X across, Y down, as % of the card), how high it floats off the card toward the viewer, and its rotation, then save.</Text>
      {allComponents.map(({ key, label }) => {
        const pos = getPos(key);
        return <View key={key} style={styles.component}>
          <Text style={styles.componentName}>{label}</Text>
          <Step label="Across (X)" value={pos.x ?? 50} display={`${Math.round(pos.x ?? 50)}%`} onMinus={() => setPos(key, { x: Math.max(-50, (pos.x ?? 50) - 5) })} onPlus={() => setPos(key, { x: Math.min(150, (pos.x ?? 50) + 5) })} minDisabled={(pos.x ?? 50) <= -50} plusDisabled={(pos.x ?? 50) >= 150} />
          <Step label="Down (Y)" value={pos.y ?? 120} display={`${Math.round(pos.y ?? 120)}%`} onMinus={() => setPos(key, { y: Math.max(0, (pos.y ?? 120) - 5) })} onPlus={() => setPos(key, { y: Math.min(180, (pos.y ?? 120) + 5) })} minDisabled={(pos.y ?? 120) <= 0} plusDisabled={(pos.y ?? 120) >= 180} />
          <Step label="Height" value={pos.z ?? 0} display={`${pos.z ?? 0}%`} onMinus={() => setPos(key, { z: Math.max(0, (pos.z ?? 0) - 5) })} onPlus={() => setPos(key, { z: Math.min(100, (pos.z ?? 0) + 5) })} minDisabled={(pos.z ?? 0) <= 0} plusDisabled={(pos.z ?? 0) >= 100} />
          <Step label="Rotation" value={pos.rotation ?? 0} display={`${pos.rotation ?? 0}°`} onMinus={() => setPos(key, { rotation: ((((pos.rotation ?? 0) - 15 + 180) % 360) + 360) % 360 - 180 })} onPlus={() => setPos(key, { rotation: ((((pos.rotation ?? 0) + 15 + 180) % 360) + 360) % 360 - 180 })} />
        </View>;
      })}
      <Button icon="check" title={busy === 'save' ? 'Saving…' : 'Save positions'} disabled={busy === 'save'} onPress={savePositions} />
      {saveStatus ? <Text style={[styles.hint, { color: colors.holoCyan }]}>{saveStatus}</Text> : null}
    </Card> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 14, textAlign: 'center' }, hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  swatches: { flexDirection: 'row', gap: 10 }, swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.panelBorder }, swatchOn: { borderColor: colors.holoCyan, borderWidth: 3 },
  qr: { width: 150, height: 150, backgroundColor: '#fff', borderRadius: 8 }, divider: { height: 1, backgroundColor: colors.panelBorder }, btnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  empty: { width: '100%', backgroundColor: '#000', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 12 },
  modelBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.panelRaised },
  component: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: colors.panelRaised }, componentName: { color: colors.holoCyan, fontWeight: '800', marginBottom: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }, stepLabel: { color: colors.textDim, fontSize: 12, flex: 1 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' }, stepValue: { color: colors.text, width: 48, textAlign: 'center', fontWeight: '700', fontSize: 12 },
});
