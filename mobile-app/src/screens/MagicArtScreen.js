import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { api, publicUrl, resolveAssetUrl } from '../api/client.js';
import { useCart } from '../cart/CartContext.js';
import { TapToPlayMedia } from '../components/Media.js';
import { Button, Card, Empty, Loading, Message, Screen, Sheet, Stepper, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export function MagicArtGallery({ navigation, embedded = false }) {
  const cart = useCart();
  const [pieces, setPieces] = useState(null);
  const [error, setError] = useState('');
  const [qrTarget, setQrTarget] = useState(null);
  const [qty, setQty] = useState({});
  const [addedId, setAddedId] = useState('');

  useEffect(() => { api.getPublicMagicArt().then(setPieces).catch((err) => setError(err.message)); }, []);

  const getQty = (id) => qty[id] || 1;
  function add(piece) {
    cart.addItem(piece, getQty(piece._id));
    setAddedId(piece._id);
    setTimeout(() => setAddedId((id) => (id === piece._id ? '' : id)), 1500);
  }

  return <>
    <View style={styles.head}>
      <Text style={styles.sub}>Open Magic Camera -- no login needed -- and point it at one of the images below to see it come alive.</Text>
      {cart.totalCount > 0 ? <Button compact kind="secondary" icon="cart" title={`Cart (${cart.totalCount}) · ₹${cart.totalAmount}`} onPress={() => navigation.navigate('Magic Poster Cart')} style={{ alignSelf: 'flex-start' }} /> : null}
      <Button compact icon="magic" title="Open Magic Camera" onPress={() => navigation.navigate('Magic Camera')} style={{ alignSelf: 'flex-start' }} />
    </View>
    <Message>{error}</Message>
    {!pieces && !error ? <Loading /> : null}
    {pieces && pieces.length === 0 ? <Empty>Nothing here yet — check back soon.</Empty> : null}
    {pieces?.map((piece, i) => (
      <Card key={piece._id} style={{ gap: 10 }}>
        <TapToPlayMedia imageUrl={piece.imageUrl} videoUrl={piece.overlays?.[0]?.videoUrl} style={{ aspectRatio: piece.imageWidth && piece.imageHeight ? piece.imageWidth / piece.imageHeight : 1 }} />
        <Text style={styles.name}>{piece.name || `Art ${i + 1}`}</Text>
        <Button compact kind="ghost" icon="magic" title="Open Magic Camera →" onPress={() => setQrTarget(piece)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        {piece.description ? <Text style={styles.desc}>{piece.description}</Text> : null}
        {piece.chargeAmount ? <View style={styles.buy}>
          <Text style={styles.price}>₹{piece.chargeAmount}{piece.discountPriceAmount > 0 && piece.priceAmount > piece.discountPriceAmount ? <Text style={styles.strike}>  ₹{piece.priceAmount}</Text> : null}</Text>
          <Stepper value={getQty(piece._id)} min={1} onChange={(value) => setQty((q) => ({ ...q, [piece._id]: value }))} />
          <Button compact kind="secondary" title={addedId === piece._id ? 'Added ✓' : 'Add to cart'} onPress={() => add(piece)} />
        </View> : null}
        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>How it works</Text>
          <Text style={styles.desc}>1. On your mobile phone, open Magic Camera -- no login needed.</Text>
          <Text style={styles.desc}>2. Point your phone's camera at this image.</Text>
          <Text style={styles.desc}>3. Watch the video come alive on it.</Text>
        </View>
      </Card>
    ))}
    <Sheet visible={Boolean(qrTarget)} onClose={() => setQrTarget(null)} title="Scan the image with Magic Camera">
      {qrTarget ? <View style={{ alignItems: 'center', gap: 12 }}>
        <Image source={{ uri: resolveAssetUrl(qrTarget.imageUrl) }} style={{ width: 220, height: 220, borderRadius: 10 }} resizeMode="contain" />
        <Text style={styles.desc}>Open Magic Camera right here, then point the camera at this image on another screen or a printed poster.</Text>
        <Button title="Open Magic Camera" icon="magic" onPress={() => { setQrTarget(null); navigation.navigate('Magic Camera'); }} style={{ alignSelf: 'stretch' }} />
        <Image source={{ uri: publicUrl('/api/public/qr/magic-camera') }} style={{ width: 140, height: 140, borderRadius: 8, backgroundColor: '#fff' }} />
        <Text style={styles.desc}>Or scan this with another phone's camera to open Magic Camera in its browser.</Text>
      </View> : null}
    </Sheet>
  </>;
}

export default function MagicArtScreen({ navigation }) {
  return <Screen>
    <Title>Magic Poster</Title>
    <MagicArtGallery navigation={navigation} />
  </Screen>;
}

const styles = StyleSheet.create({
  head: { gap: 10 }, sub: { color: colors.textDim, lineHeight: 20, fontSize: 13 },
  name: { color: colors.text, fontWeight: '800', fontSize: 18 }, desc: { color: colors.textDim, lineHeight: 19, fontSize: 13 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { color: colors.text, fontWeight: '800', fontSize: 17 }, strike: { color: colors.textDim, fontSize: 12, textDecorationLine: 'line-through', fontWeight: '400' },
  steps: { gap: 4, borderTopWidth: 1, borderTopColor: colors.panelBorder, paddingTop: 10 }, stepsTitle: { color: colors.text, fontWeight: '800', fontSize: 13 },
});
