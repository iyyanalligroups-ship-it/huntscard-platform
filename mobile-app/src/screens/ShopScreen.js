import { useCallback, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl, WEB_URL } from '../api/client.js';
import { Button, Card, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

export default function ShopScreen() {
  const [plans, setPlans] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setPlans(await api.listPlans()); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <Screen refreshing={loading} onRefresh={load}>
    <Title subtitle="Live plans and prices come from the same huntsTAG API.">Card shop</Title><Message>{error}</Message>
    {loading && !plans.length ? <Loading /> : !plans.length ? <Empty>No active card plans are available.</Empty> : plans.map((plan) => <Card key={plan._id || plan.name} style={styles.plan}>
      {(plan.imageUrl || plan.frontImageUrl || plan.variants?.[0]?.imageUrl) ? <Image source={{ uri: resolveAssetUrl(plan.imageUrl || plan.frontImageUrl || plan.variants?.[0]?.imageUrl) }} style={styles.image} resizeMode="cover" /> : null}
      <View style={styles.heading}><Text style={styles.name}>{plan.name}</Text><Text style={styles.price}>₹{Number(plan.chargeAmount ?? plan.price ?? 0).toLocaleString('en-IN')}</Text></View>
      {plan.description ? <Text style={styles.description}>{plan.description}</Text> : null}
      {Array.isArray(plan.features) && plan.features.slice(0, 5).map((feature, index) => <Text key={`${feature}-${index}`} style={styles.feature}>• {feature}</Text>)}
      <Button title="Continue to secure checkout" onPress={() => Linking.openURL(`${WEB_URL}/dashboard/upgrade`)} />
    </Card>)}
    <Text style={styles.note}>Checkout currently opens the existing web payment flow so Razorpay verification and address handling stay identical.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  plan: { gap: 11 }, image: { width: '100%', height: 180, borderRadius: 10, backgroundColor: colors.panelRaised },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  name: { color: colors.text, fontSize: 19, fontWeight: '800', flex: 1 }, price: { color: colors.holoCyan, fontSize: 18, fontWeight: '900' },
  description: { color: colors.textDim, lineHeight: 20 }, feature: { color: colors.text, fontSize: 13 }, note: { color: colors.textDim, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
