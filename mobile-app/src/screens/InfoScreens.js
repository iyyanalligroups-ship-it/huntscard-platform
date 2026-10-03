import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client.js';
import { Glyph } from '../components/Glyph.js';
import { Accordion, Button, Card, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const FEATURES = [
  { icon: 'nfc', title: 'NFC Tap Technology', desc: 'Just tap your HuntsTAG on any NFC enabled smartphone and your complete profile transfers instantly. No app required. No WiFi needed. Just tap and connect.' },
  { icon: 'phoneDevice', title: 'Phone to Phone Sync', desc: 'Share your information directly from phone to phone in seconds. Fast, smooth and completely wireless -- networking has never been this effortless.' },
  { icon: 'layers', title: 'Augmented Reality', desc: 'Experience networking like never before. HuntsTAG brings your profile to life through stunning Augmented Reality -- making you unforgettable in every meeting and event.' },
  { icon: 'qr', title: 'QR Scanner', desc: 'Not every phone supports NFC? No problem. Every HuntsTAG comes with a built-in QR code -- scan and connect in an instant from any smartphone.' },
];

const HUNTSWORLD_POINTS = [
  { title: 'How it connects to your card', body: 'HuntsWorld is a business listing platform, separate from HuntsTAG itself. If your business has a listing there, you can add that link to your profile — it then shows up as its own "Huntsworld" section on your public card page, and (if you\'re on a plan with AR features) as its own block in the AR layout too.' },
  { title: 'Adding your listing', body: "Add your HuntsWorld listing URL from your dashboard's Profile Settings. Once it's set, anyone who taps or scans your card can jump straight to your listing in one tap." },
  { title: "Don't have a listing yet?", body: "That's fine — this section simply won't show on your card until you add one. Questions about getting listed on HuntsWorld itself? Reach out and we'll point you in the right direction.", cta: true },
];

export function FaqScreen({ navigation }) {
  const [faqs, setFaqs] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getPublicFaq().then(setFaqs).catch((err) => setError(err.message)); }, []);
  return <Screen>
    <Title subtitle="Everything about your card, in one place.">Frequently asked questions</Title>
    <Message>{error}</Message>
    {faqs === null && !error ? <Loading /> : null}
    {faqs?.length === 0 ? <Empty>No questions posted yet.</Empty> : null}
    {faqs?.map((item, i) => <Accordion key={item._id} index={i} title={item.question} defaultOpen={i === 0}><Text style={styles.body}>{item.answer}</Text></Accordion>)}
    <Button title="Contact us →" kind="secondary" onPress={() => navigation.navigate('Contact Us')} />
  </Screen>;
}

export function AboutScreen({ navigation }) {
  return <Screen>
    <Title eyebrow="HuntsTAG" subtitle="HuntsTAG is a next generation smart business card powered by NFC technology -- designed to replace traditional visiting cards with a seamless, futuristic and powerful networking experience.">The Future of Networking is Here.</Title>
    <Text style={styles.accent}>One Tap. Infinite Connections.</Text>
    <Card style={{ gap: 10 }}>
      <Text style={styles.h2}>What is HuntsTAG</Text>
      <Text style={styles.body}>In a world that moves at the speed of technology, your business card should too. HuntsTAG is a revolutionary smart card that connects people instantly with just a single tap. No more paper cards. No more manual typing. No more lost contacts.</Text>
      <Text style={styles.body}>Simply tap your HuntsTAG card on any smartphone and share your complete business profile, portfolio, social media, contact details and more -- instantly, effortlessly and unforgettably.</Text>
      <Text style={styles.statement}>HuntsTAG is not just a card. It is your digital identity.</Text>
    </Card>
    <Text style={styles.h2}>Key Features</Text>
    {FEATURES.map((f) => <Card key={f.title} style={{ gap: 8 }}>
      <View style={styles.icon}><Glyph name={f.icon} size={22} color={colors.holoCyan} /></View>
      <Text style={styles.h3}>{f.title}</Text><Text style={styles.body}>{f.desc}</Text>
    </Card>)}
    <Card style={{ gap: 10 }}>
      <Text style={styles.h2}>Get in touch</Text>
      <Text style={styles.body}>Questions about a plan, an order, or anything else -- we'd like to hear from you.</Text>
      <Button title="Contact us →" onPress={() => navigation.navigate('Contact Us')} />
    </Card>
  </Screen>;
}

export function HuntsworldScreen({ navigation }) {
  return <Screen>
    <Title subtitle="A business listing platform your card can link straight to.">What is HuntsWorld?</Title>
    {HUNTSWORLD_POINTS.map((point, i) => <Card key={point.title} style={{ gap: 8 }}>
      <Text style={styles.stepNo}>{String(i + 1).padStart(2, '0')}</Text>
      <Text style={styles.h3}>{point.title}</Text><Text style={styles.body}>{point.body}</Text>
      {point.cta ? <Button title="Contact us →" onPress={() => navigation.navigate('Contact Us')} /> : null}
    </Card>)}
  </Screen>;
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 20, fontWeight: '800' }, h3: { color: colors.text, fontSize: 16, fontWeight: '800' },
  body: { color: colors.textDim, lineHeight: 21, fontSize: 14 },
  accent: { color: colors.holoCyan, fontWeight: '800', fontSize: 18 },
  statement: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 4 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  stepNo: { color: colors.holoCyan, fontWeight: '900', fontSize: 22 },
});
