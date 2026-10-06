import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { api, resolveAssetUrl } from '../api/client.js';
import { VideoClip, TapToPlayMedia } from '../components/Media.js';
import { Glyph } from '../components/Glyph.js';
import { Button, Card, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

function EntryCard({ entry, onShop }) {
  const specs = [
    ['Printing Type', entry.printingType], ['Material', entry.material], ['NFC Chip Size', entry.nfcChipSize],
    ['Engraved Text Color', entry.engravedTextColor], ['Durability', entry.durability], ['Color options', entry.colorCount],
  ].filter(([, value]) => value);
  const vertical = entry.viewLayout === 'vertical';
  return <Card style={{ gap: 12 }}>
    <Text style={styles.name}>{entry.name}</Text>
    {entry.price ? <Text style={styles.price}>₹{entry.price} <Text style={styles.note}>(Inclusive of all features)</Text></Text> : <Text style={styles.note}>Contact us for pricing</Text>}
    {entry.frontImageUrl || entry.backImageUrl ? (
      <View style={vertical ? styles.mediaRow : { gap: 10 }}>
        {entry.frontImageUrl ? <TapToPlayMedia imageUrl={entry.frontImageUrl} videoUrl={entry.videoUrl} style={vertical ? { flex: 1, aspectRatio: 3 / 4.24 } : { aspectRatio: 8 / 5 }} /> : null}
        {entry.backImageUrl ? <Image source={{ uri: resolveAssetUrl(entry.backImageUrl) }} style={[{ borderRadius: 12, backgroundColor: colors.panelRaised }, vertical ? { flex: 1, aspectRatio: 3 / 4.24 } : { width: '100%', aspectRatio: 8 / 5 }]} resizeMode="cover" /> : null}
      </View>
    ) : <View style={styles.nophoto}><Glyph name="card" size={32} color={colors.text} /><Text style={styles.note}>No photo yet</Text></View>}
    {specs.length ? <View style={{ gap: 4 }}>
      <Text style={styles.label}>Printing & Material Details:</Text>
      {specs.map(([label, value]) => <Text key={label} style={styles.spec}><Text style={{ color: colors.textDim }}>{label}: </Text>{value}</Text>)}
    </View> : null}
    {(entry.features || []).length ? <View style={{ gap: 4 }}>
      <Text style={styles.label}>Digital Features Included</Text>
      {entry.features.map((feature, i) => <Text key={i} style={styles.spec}>• {feature}</Text>)}
    </View> : null}
    <Button title="Get free design preview" onPress={() => onShop(entry.linkedPlanKey)} />
  </Card>;
}

export default function CatalogScreen({ navigation }) {
  const [tiers, setTiers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCatalogEntries().then(setTiers).catch(() => setTiers([]));
    api.getCatalog().then(setEntries).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  return <Screen>
    <Title eyebrow="Card variants" subtitle="Photos, pricing, and what's included at each level -- pick the one that fits, then see it in motion below.">Every tier, explained.</Title>
    {tiers.map((entry) => <EntryCard key={entry.key} entry={entry} onShop={(plan) => navigation.navigate('Shop', plan ? { plan } : undefined)} />)}
    <View style={{ gap: 6, marginTop: 8 }}>
      <Text style={styles.eyebrow}>SEE IT IN MOTION</Text>
      <Text style={styles.h2}>A card actually being tapped</Text>
      <Text style={styles.note}>A short clip of each card type in use, so you know exactly what you're getting.</Text>
    </View>
    {loading ? <Loading /> : null}
    <Message>{error}</Message>
    {!loading && !error && entries.length === 0 ? <Empty>No catalog videos yet -- check back soon.</Empty> : null}
    {entries.map((entry) => <View key={entry._id} style={{ gap: 6 }}>
      <VideoClip url={entry.videoUrl} />
      {entry.title ? <Text style={styles.clipTitle}>{entry.title}</Text> : null}
    </View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  price: { color: colors.holoCyan, fontSize: 20, fontWeight: '900' }, note: { color: colors.textDim, fontSize: 12, fontWeight: '400' },
  mediaRow: { flexDirection: 'row', gap: 10 },
  nophoto: { aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { color: colors.text, fontWeight: '800', fontSize: 13 }, spec: { color: colors.text, fontSize: 13, lineHeight: 19 },
  eyebrow: { color: colors.holoCyan, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, h2: { color: colors.text, fontSize: 21, fontWeight: '800' },
  clipTitle: { color: colors.text, fontWeight: '700' },
});
