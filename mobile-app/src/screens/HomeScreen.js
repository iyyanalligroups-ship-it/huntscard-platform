import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Glyph } from '../components/Glyph.js';
import { Accordion, Button, Card, Screen } from '../components/ui.js';
import { rupees } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const SAMPLE_NAME = 'Alex Chen';
const SAMPLE_ROLE = 'Founder, Studio Nine';

const FLOW_CHECKS = ['Tap the card on any phone', 'Your profile opens instantly', 'They save your contact in one tap'];
const CAPABILITIES = ['Tap to share', 'QR code backup', 'Augmented reality', 'Update anytime', 'Password-locked chip', 'No app needed', 'Save contact', 'Magic Poster', 'Public profile page', 'Order tracking'];

const BENEFITS = [
  { icon: 'nfc', title: 'Tap to share', text: 'One tap opens your full profile on any phone.' },
  { icon: 'qr', title: 'QR code backup', text: 'Every card also carries a QR code that opens the same page.' },
  { icon: 'refresh', title: 'Update anytime', text: 'Change your details online; the card never needs reprinting.' },
  { icon: 'lock', title: 'Password-locked chip', text: 'Nobody can overwrite your card link but us.' },
  { icon: 'phoneDevice', title: 'No app needed', text: 'The person you meet installs nothing.' },
  { icon: 'palette', title: 'Your own design', text: 'Pick a banner, add your photo, bio and social links.' },
];

const FEATURES = [
  { icon: 'nfc', title: 'Tap to share instantly', desc: 'One tap on any phone opens your profile — no app required for the person receiving it. Save Contact works everywhere, natively.' },
  { icon: 'refresh', title: 'Update anytime, card never changes', desc: 'Your physical card only stores a link. Change your phone number or add a new social link from your dashboard — it reflects immediately, no reprinting.' },
  { icon: 'lock', title: 'Locked against tampering', desc: "Every card is password-protected at the chip level the moment it's made. Nobody can overwrite your card's link but us." },
  { icon: 'palette', title: 'Your page, your design', desc: 'Pick a banner design, add your photo and bio, and link out to Instagram, Twitter, your portfolio, and more.' },
];

const STEPS = [
  { title: 'Choose your card', desc: 'Pick a tier that fits — Basic to Apex.' },
  { title: 'Set up your profile', desc: 'Add your photo, links, and details in minutes.' },
  { title: 'Tap to connect', desc: 'Hand someone your card, they tap, done.' },
];

const WHY = [
  { icon: 'zap', title: 'Innovation Over Payment', desc: 'Our revolutionary Trend Points System ranks products based on genuine user interest and engagement, not payment capacity. Quality products rise to the top naturally.' },
  { icon: 'tag', title: 'Affordable Excellence', desc: 'We offer comprehensive B2B marketplace features at a fraction of competitor pricing, making professional business tools accessible to startups, SMEs, and established companies.' },
  { icon: 'sparkles', title: 'Rewards That Matter', desc: "From our unique viewpoint earnings system to student benefits and referral programs, we've created multiple ways for our community to grow and prosper together." },
];

export default function HomeScreen({ navigation }) {
  const { session } = useAuth();
  const [plans, setPlans] = useState(null);
  const [faqs, setFaqs] = useState(null);
  const [card, setCard] = useState({ name: SAMPLE_NAME, role: SAMPLE_ROLE });

  useEffect(() => {
    api.listPlans().then((list) => setPlans(Array.isArray(list) ? list.slice(0, 4) : [])).catch(() => setPlans([]));
    api.getPublicFaq().then((list) => setFaqs(Array.isArray(list) ? list.slice(0, 6) : [])).catch(() => setFaqs([]));
  }, []);

  useFocusEffect(useCallback(() => {
    if (!session) { setCard({ name: SAMPLE_NAME, role: SAMPLE_ROLE }); return; }
    api.getProfile().then((p) => setCard({ name: p.fullName || SAMPLE_NAME, role: p.jobTitle || SAMPLE_ROLE })).catch(() => {});
  }, [session]));

  const go = (name, params) => () => navigation.navigate(name, params);

  return <Screen contentStyle={{ padding: 0, gap: 0, paddingBottom: 0 }}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>NFC · NTAG216 · PASSWORD-LOCKED</Text>
      <Text style={styles.h1}>Your identity,</Text>
      <Text style={[styles.h1, { color: colors.holoCyan }]}>broadcast on tap.</Text>
      <Text style={styles.lead}>One tap transmits your full profile over near-field induction — no app on their end, no battery, no signal drop. Update your details anytime; every card in the world reflects it instantly, without a reprint.</Text>
      <View style={styles.row}>
        <Button title="Shop Cards" onPress={go('Shop')} style={styles.flex} />
        <Button title="Contact Us" kind="secondary" onPress={go('Contact Us')} style={styles.flex} />
      </View>
      <View style={styles.holoCard}>
        <View style={styles.holoGlowA} /><View style={styles.holoGlowB} />
        <View style={styles.chip} />
        <View>
          <Text style={styles.holoName}>{card.name}</Text>
          <Text style={styles.holoRole}>{card.role}</Text>
        </View>
      </View>
    </View>

    <View style={styles.specRow}>
      <Spec value="13.56 MHz" label="NFC frequency" /><Spec value="888 bytes" label="NDEF capacity" /><Spec value="Zero" label="battery required" />
    </View>

    <Section title="One tap. Everything shared.">
      {FLOW_CHECKS.map((text) => <View key={text} style={styles.check}><View style={styles.checkDot}><Glyph name="check" size={14} color="#06120f" strokeWidth={3} /></View><Text style={styles.checkText}>{text}</Text></View>)}
      <Button title="Get your card" onPress={go('Shop')} />
    </Section>

    <View style={styles.marquee}>
      {CAPABILITIES.map((c) => <Text key={c} style={styles.capChip}>{c}</Text>)}
    </View>

    {plans && plans.length > 0 ? <Section title="Pick the card that fits you" sub="Every card comes with your own profile page, QR backup and lifetime updates.">
      <View style={styles.planGrid}>
        {plans.map((plan) => {
          const variant = plan.variants?.[0];
          const image = variant?.frontImageUrl || plan.images?.[0];
          return <Pressable key={plan._id || plan.key} style={styles.plan} onPress={go('Shop', { plan: plan.key })}>
            {image ? <Image source={{ uri: resolveAssetUrl(image) }} style={styles.planImage} resizeMode="cover" /> : <View style={[styles.planImage, { alignItems: 'center', justifyContent: 'center' }]}><Glyph name="card" size={30} color={colors.textDim} /></View>}
            <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
            {(plan.priceAmount || plan.price) ? <Text style={styles.planPrice}>{typeof (plan.priceAmount || plan.price) === 'number' ? rupees(plan.priceAmount || plan.price) : `₹${plan.priceAmount || plan.price}`}</Text> : null}
            <Text style={styles.link}>View card →</Text>
          </Pressable>;
        })}
      </View>
    </Section> : null}

    <Section title="A card actually being tapped" sub="Watch how a HuntsTAG card opens a full profile in a second, with nothing to install.">
      <Button title="Browse the catalog" kind="secondary" icon="play" onPress={go('Catalog')} />
    </Section>

    <Section title="Everything your card does">
      <View style={styles.benefitGrid}>
        {BENEFITS.map((b) => <Card key={b.title} style={styles.benefit}>
          <View style={styles.benefitIcon}><Glyph name={b.icon} size={22} color={colors.holoCyan} /></View>
          <Text style={styles.cardTitle}>{b.title}</Text><Text style={styles.cardText}>{b.text}</Text>
        </Card>)}
      </View>
    </Section>

    <Section title="Why HuntsTAG">
      {FEATURES.map((f) => <Card key={f.title} style={{ gap: 8 }}>
        <View style={styles.benefitIcon}><Glyph name={f.icon} size={22} color={colors.holoViolet} /></View>
        <Text style={styles.cardTitle}>{f.title}</Text><Text style={styles.cardText}>{f.desc}</Text>
      </Card>)}
    </Section>

    <Section title="How it works" sub="From order to first tap in three steps.">
      {STEPS.map((s, i) => <View key={s.title} style={styles.step}>
        <View style={styles.stepNo}><Text style={styles.stepNoText}>{i + 1}</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{s.title}</Text><Text style={styles.cardText}>{s.desc}</Text></View>
      </View>)}
      <Button title="Browse card plans" onPress={go('Shop')} />
    </Section>

    <Section title="What is HuntsWorld and why">
      <Text style={styles.cardText}>Huntsworld is India's most affordable B2B marketplace, designed to democratize business connections for companies of all sizes. We believe that every business, regardless of budget, deserves access to powerful marketplace tools and genuine growth opportunities.</Text>
      <Text style={[styles.cardTitle, { marginTop: 4 }]}>What Makes Us Different</Text>
      {WHY.map((w) => <Card key={w.title} style={{ gap: 8 }}>
        <View style={styles.benefitIcon}><Glyph name={w.icon} size={22} color={colors.holoMagenta} /></View>
        <Text style={styles.cardTitle}>{w.title}</Text><Text style={styles.cardText}>{w.desc}</Text>
      </Card>)}
      <Button title="Learn more about HuntsWorld" kind="secondary" onPress={go('What is HuntsWorld?')} />
    </Section>

    {faqs && faqs.length > 0 ? <Section title="Frequently asked questions" sub="Everything about your card, in one place.">
      {faqs.map((item, i) => <Accordion key={item._id || i} title={item.question} defaultOpen={i === 0}><Text style={styles.cardText}>{item.answer}</Text></Accordion>)}
      <Button title="See all questions →" kind="ghost" onPress={go('FAQ')} />
    </Section> : null}

    <View style={[styles.section, { alignItems: 'center' }]}>
      <Text style={[styles.h2, { textAlign: 'center' }]}>Ready for a card that says more?</Text>
      <Text style={[styles.cardText, { textAlign: 'center' }]}>Pick your card, set up your profile in minutes and start sharing with a single tap.</Text>
      <View style={[styles.row, { alignSelf: 'stretch' }]}>
        <Button title="Shop cards" onPress={go('Shop')} style={styles.flex} />
        <Button title="Catalog" kind="secondary" onPress={go('Catalog')} style={styles.flex} />
      </View>
    </View>

    <View style={styles.footer}>
      <Text style={styles.footBrand}>HuntsTAG</Text>
      <Text style={styles.cardText}>A smart card for a smarter first impression.</Text>
      <View style={styles.footLinks}>
        {[['About Us', 'About Us'], ['What is HuntsWorld?', 'What is HuntsWorld?'], ['Shop', 'Shop'], ['Catalog', 'Catalog'], ['Magic Poster', 'Magic Poster'], ['FAQ', 'FAQ'], ['Chat Support', 'Chat Support'], ['Contact Us', 'Contact Us']].map(([label, route]) => <Pressable key={label} onPress={go(route)}><Text style={styles.footLink}>{label}</Text></Pressable>)}
        <Pressable onPress={() => Linking.openURL('mailto:info@huntsworld.com')}><Text style={styles.footLink}>info@huntsworld.com</Text></Pressable>
      </View>
      <Text style={styles.copy}>© {new Date().getFullYear()} HuntsTAG. All rights reserved.</Text>
    </View>
  </Screen>;
}

function Section({ title, sub, children }) {
  return <View style={styles.section}>
    <Text style={styles.h2}>{title}</Text>
    {sub ? <Text style={styles.cardText}>{sub}</Text> : null}
    {children}
  </View>;
}

function Spec({ value, label }) {
  return <View style={{ flex: 1, alignItems: 'center' }}><Text style={styles.specValue}>{value}</Text><Text style={styles.specLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { padding: 22, paddingTop: 28, gap: 12, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.panelBorder },
  eyebrow: { color: colors.holoCyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  h1: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 38 },
  h2: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  lead: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
  holoCard: { height: 190, borderRadius: 18, padding: 18, justifyContent: 'space-between', backgroundColor: '#10131c', borderWidth: 1, borderColor: 'rgba(94,234,212,0.35)', overflow: 'hidden', marginTop: 8 },
  holoGlowA: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(94,234,212,0.18)', top: -90, right: -60 },
  holoGlowB: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(167,139,250,0.20)', bottom: -100, left: -50 },
  chip: { width: 40, height: 30, borderRadius: 7, backgroundColor: 'rgba(237,239,243,0.85)' },
  holoName: { color: colors.text, fontSize: 22, fontWeight: '800' }, holoRole: { color: colors.textDim, marginTop: 3 },
  specRow: { flexDirection: 'row', padding: 18, backgroundColor: colors.panelRaised },
  specValue: { color: colors.holoCyan, fontWeight: '900', fontSize: 16 }, specLabel: { color: colors.textDim, fontSize: 11, marginTop: 3, textAlign: 'center' },
  section: { padding: 22, gap: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: colors.text, fontSize: 15, flex: 1 },
  marquee: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 22, paddingVertical: 10 },
  capChip: { color: colors.textDim, fontSize: 12, fontWeight: '600', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  plan: { width: '47.5%', backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.panelBorder, padding: 10, gap: 6 },
  planImage: { width: '100%', height: 110, borderRadius: 10, backgroundColor: colors.panelRaised },
  planName: { color: colors.text, fontWeight: '800', fontSize: 15 }, planPrice: { color: colors.holoCyan, fontWeight: '900' },
  link: { color: colors.holoCyan, fontSize: 12, fontWeight: '700' },
  benefitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  benefit: { width: '47.5%', gap: 6, padding: 14 },
  benefitIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 }, cardText: { color: colors.textDim, lineHeight: 20, fontSize: 13 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  stepNo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: '#06120f', fontWeight: '900', fontSize: 18 },
  footer: { padding: 22, gap: 10, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.panelBorder },
  footBrand: { color: colors.holoCyan, fontWeight: '900', fontSize: 22 },
  footLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 }, footLink: { color: colors.text, fontSize: 13 },
  copy: { color: colors.textDim, fontSize: 11, marginTop: 8 },
});
