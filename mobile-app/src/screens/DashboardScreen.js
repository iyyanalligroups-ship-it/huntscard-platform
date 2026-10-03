import { useCallback, useState } from 'react';
import { Image, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl, WEB_URL } from '../api/client.js';
import { Button, Card, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const completenessFields = ['fullName', 'jobTitle', 'bio', 'photoUrl', 'phone', 'whatsapp', 'publicEmail', 'instagramUrl', 'twitterUrl', 'portfolioUrl', 'huntsworldUrl'];

function orderStatus(profile) {
  if (!profile?.paid) return 'No order yet';
  if (profile.delivered) return 'Delivered';
  if (profile.dispatched) return 'Shipping';
  if (profile.chipEncoded) return 'Card created';
  return 'Order placed';
}

export default function DashboardScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try {
      const [profileData, cardData] = await Promise.all([api.getProfile(), api.getMyCards().catch(() => [])]);
      setProfile(profileData); setCards(cardData);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (loading) return <Screen><Loading label="Loading your dashboard…" /></Screen>;

  const filled = completenessFields.filter((key) => String(profile?.[key] || '').trim()).length;
  const complete = Math.round((filled / completenessFields.length) * 100);
  const design = resolveAssetUrl(cards.find((card) => card.cardNumber === profile?.primaryCardNumber)?.cardDesignUrl || profile?.cardFrontImageUrl);

  async function shareProfile() {
    await Share.share({ message: `${profile.fullName} on huntsTAG\n${WEB_URL}/c/${profile.clientId}`, url: `${WEB_URL}/c/${profile.clientId}` });
  }

  return <Screen refreshing={refreshing} onRefresh={() => load(true)}>
    <Title subtitle="Your card, profile and orders at a glance.">Welcome, {(profile?.fullName || 'there').split(' ')[0]}</Title>
    <Message>{error}</Message>
    {profile?.cardActive === false && <Message>Your public card is paused. Open Account & Cards to reactivate it.</Message>}
    <Card style={styles.hero}>
      {design ? <Image source={{ uri: design }} style={styles.cardImage} resizeMode="contain" /> : <View style={styles.cardPlaceholder}><Text style={styles.brand}>huntsTAG</Text><Text style={styles.dim}>Your card design will appear here</Text></View>}
      <View style={styles.row}><Button compact title="Edit profile" onPress={() => navigation.navigate('Profile')} style={styles.flex} /><Button compact title="Zing / Share" kind="secondary" onPress={shareProfile} style={styles.flex} /></View>
    </Card>
    <View style={styles.stats}>
      <Stat label="Card taps" value={profile?.tapCount ?? 0} />
      <Stat label="Your plan" value={profile?.cardType || 'None'} />
      <Stat label="Order" value={orderStatus(profile)} />
      <Stat label="Profile" value={`${complete}%`} />
    </View>
    <Card><Text style={styles.sectionTitle}>Quick actions</Text><View style={styles.actionList}>
      <Button title="Browse card plans" kind="secondary" onPress={() => navigation.navigate('Shop')} />
      <Button title="Track my orders" kind="secondary" onPress={() => navigation.navigate('Track Orders')} />
      <Button title="Chat with support" kind="secondary" onPress={() => navigation.navigate('Support Chat')} />
    </View></Card>
  </Screen>;
}

function Stat({ label, value }) {
  return <Card style={styles.stat}><Text style={styles.statValue} numberOfLines={1}>{String(value)}</Text><Text style={styles.dim}>{label}</Text></Card>;
}

const styles = StyleSheet.create({
  hero: { gap: 15 },
  cardImage: { width: '100%', height: 205, borderRadius: 12 },
  cardPlaceholder: { height: 190, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', gap: 8 },
  brand: { color: colors.holoCyan, fontWeight: '900', fontSize: 24 },
  dim: { color: colors.textDim, fontSize: 12, textTransform: 'capitalize' },
  row: { flexDirection: 'row', gap: 9 }, flex: { flex: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', minHeight: 92, justifyContent: 'center' },
  statValue: { color: colors.text, fontSize: 19, fontWeight: '800', marginBottom: 5, textTransform: 'capitalize' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  actionList: { gap: 9 },
});
