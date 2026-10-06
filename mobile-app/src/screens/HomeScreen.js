import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Glyph } from '../components/Glyph.js';
import { Accordion, Button, Screen } from '../components/ui.js';
import { rupees } from '../lib/format.js';
import { SITE, initialsOf, openWhatsApp, trackEvent, whatsappUrl } from '../lib/siteConfig.js';
import { colors } from '../theme/colors.js';

// Home screen, laid out like an app instead of a web page: a short hero, quick actions, swipeable
// feature cards, plan and poster carousels. Same offers and content as the website's homepage
// (client-app/src/pages/HomeV3.jsx); plans, posters and FAQ are read live from the API.

const INK = '#0b1630';
const BODY = '#27324d';

const QUICK = [
  { icon: 'bag', label: 'Shop', to: 'Shop' },
  { icon: 'image', label: 'Posters', to: 'Magic Poster' },
  { icon: 'magic', label: 'Magic Camera', to: 'Magic Camera' },
  { icon: 'truck', label: 'Track order', to: 'Track Orders', member: true },
  { icon: 'contacts', label: 'Contacts', to: 'Contacts', member: true },
  { icon: 'layers', label: 'AR Layout', to: 'AR Layout', member: true },
  { icon: 'chat', label: 'Support', to: 'Chat Support' },
  { icon: 'card', label: 'Catalog', to: 'Catalog' },
];

const FEATURES = [
  { key: 'ar', icon: 'layers', tint: ['#1565ff', '#4d8dff'], tag: 'Augmented reality', title: 'Your card floats off the page',
    points: ['Video or photo above your card', '3D model people can turn around', 'Tap-to-call, portfolio and social tiles'], cta: 'See AR-ready cards', to: 'Shop' },
  { key: 'zing', icon: 'zap', tint: ['#7c3aed', '#a78bfa'], tag: 'Zing', title: 'No card? Zing it',
    points: ['One tap sends your contact card', 'Works with WhatsApp, Messages, Mail', 'They save you in one tap, no app needed'], cta: 'Get a Zing-ready card', to: 'Shop' },
  { key: 'mbc', icon: 'scan', tint: ['#0891b2', '#22d3ee'], tag: 'Magic Business Card', title: 'The card image plays your video',
    points: ['Scan the QR to open Magic Camera', 'Camera locks onto your card artwork', 'Your video plays right on the card'], cta: 'Try Magic Camera', to: 'Magic Camera' },
  { key: 'bk', icon: 'contacts', tint: ['#059669', '#34d399'], tag: 'Contact backup', title: 'Switch phones, keep every contact',
    points: ['Import from your phone, Excel or CSV', 'Export anytime as an Excel file', 'Message anyone on WhatsApp in one tap'], cta: 'Open my contacts', to: 'Contacts', member: true },
  { key: 'trk', icon: 'truck', tint: ['#ea6a12', '#fb923c'], tag: 'Order tracking', title: 'Know where your order is',
    points: ['Order placed, created, shipped, delivered', 'A tracking ID appears once it ships', 'Cards and posters tracked separately'], cta: 'Track my orders', to: 'Track Orders', member: true },
  { key: 'dp', icon: 'shield', tint: ['#0f766e', '#2dd4bf'], tag: 'Device protection', title: 'A safety check for your phone',
    points: ['Checks secure connection and Wi-Fi', 'Reads Google Play Protect status', 'Opens the right Settings page to fix'], cta: 'Open Device Protection', to: 'Device Protection Check', member: true },
];

const WHY = [
  ['Paper card gets lost', 'Saved straight into their phone'],
  ['Details go out of date', 'Update anytime, no reprint'],
  ['Just a name and number', 'WhatsApp, portfolio, video, bookings'],
];

const STEPS = [['Order', 'Pick a plan and pay securely.'], ['Set up', 'Add photo, links and details.'], ['Tap', 'Their phone opens your profile.'], ['Grow', 'They save you. You get the enquiry.']];

const AUDIENCES = [
  { icon: 'user', title: 'Doctors', lead: 'Patients save you and book in a tap.', actions: ['Book appointment', 'Call clinic', 'Location'] },
  { icon: 'bag', title: 'Shops', lead: 'Turn walk-ins into WhatsApp customers.', actions: ['Order on WhatsApp', 'Catalogue', 'Location'] },
  { icon: 'building', title: 'Real estate', lead: 'Hand over listings, not paperwork.', actions: ['View listings', 'Call agent', 'Site visit'] },
  { icon: 'palette', title: 'Salons', lead: 'Show your work and fill your calendar.', actions: ['Book a slot', 'Our work', 'Call us'] },
  { icon: 'calendar', title: 'Consultants', lead: 'Look professional. Be easy to reach.', actions: ['Book consultation', 'Services', 'WhatsApp'] },
  { icon: 'camera', title: 'Creators', lead: 'Every profile and portfolio, linked.', actions: ['Portfolio', 'Social', 'Work with me'] },
];

const CONFIDENCE = [['lock', 'Secure payment'], ['file', 'GST invoice'], ['package', 'Order tracking'], ['chat', 'Real support']];

const planImage = (plan, variant) => (variant && variant.frontImageUrl) || (plan.images && plan.images[0]) || '';
const planPrice = (plan) => {
  const value = plan.priceAmount || plan.price;
  if (!value) return null;
  return typeof value === 'number' ? rupees(value) : `₹${value}`;
};

export default function HomeScreen({ navigation }) {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const [plans, setPlans] = useState(null);
  const [faqs, setFaqs] = useState(null);
  const [posters, setPosters] = useState([]);
  const [me, setMe] = useState(null);
  const [aud, setAud] = useState(0);

  useEffect(() => {
    api.listPlans().then((list) => setPlans(Array.isArray(list) ? list.slice(0, 8) : [])).catch(() => setPlans([]));
    api.getPublicFaq().then((list) => setFaqs(Array.isArray(list) ? list.slice(0, 5) : [])).catch(() => setFaqs([]));
    api.getPublicMagicArt().then((list) => setPosters(Array.isArray(list) ? list.filter((p) => p.imageUrl).slice(0, 6) : [])).catch(() => setPosters([]));
  }, []);

  useFocusEffect(useCallback(() => {
    if (!session) { setMe(null); return; }
    api.getProfile().then(setMe).catch(() => setMe(null));
  }, [session]));

  const go = (name, params) => () => { trackEvent('nav', { to: name }); navigation.navigate(name, params); };
  // Account-only screens do not exist in the logged-out navigator, so send visitors to sign up.
  const goTo = (item) => () => {
    if (item.member && !session) { navigation.navigate('Register'); return; }
    trackEvent('nav', { to: item.to });
    navigation.navigate(item.to);
  };

  const hasWhatsApp = Boolean(whatsappUrl());
  const firstName = ((me && me.fullName) || '').split(' ')[0];
  const quick = QUICK.filter((q) => !q.member || session);
  const cardW = Math.min(width * 0.82, 340);
  const active = AUDIENCES[aud];
  const proof = [
    SITE.deliveryTime && ['truck', `Delivery in ${SITE.deliveryTime}`],
    SITE.freeDesignPreview && ['eye', 'Free design preview'],
    SITE.cardsDelivered && ['badgeCheck', `${SITE.cardsDelivered} cards delivered`],
    ['lock', 'Secure payment'],
    ['phoneDevice', 'Works on all phones'],
  ].filter(Boolean);

  return <Screen contentStyle={{ padding: 0, gap: 0, paddingBottom: 24 }}>
    {/* HERO */}
    <LinearGradient colors={['#0b3fb8', '#1565ff', '#4d8dff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroTop}>
        {session ? <View style={styles.avatar}>
          {me && me.photoUrl ? <Image source={{ uri: resolveAssetUrl(me.photoUrl) }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initialsOf(me && me.fullName) || '?'}</Text>}
        </View> : <View style={styles.logoTile}><Image source={require('../../assets/wolf-source.png')} style={styles.logo} resizeMode="contain" /></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>{session ? 'Welcome back' : 'NFC smart business card'}</Text>
          <Text style={styles.heroName} numberOfLines={1}>{session ? (firstName || 'Member') : 'HuntsTAG'}</Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>Your identity,{'\n'}beyond a card.</Text>
      <Text style={styles.heroSub}>Tap once. Your profile, WhatsApp and portfolio open on their phone.</Text>
      <View style={styles.heroBtns}>
        <Pressable onPress={go('Shop')} style={styles.heroPrimary}><Text style={styles.heroPrimaryText}>{`Get your card${SITE.fromPrice ? ` · from ₹${SITE.fromPrice}` : ''}`}</Text></Pressable>
        {hasWhatsApp ? <Pressable onPress={() => { trackEvent('whatsapp_click', { placement: 'hero' }); openWhatsApp(); }} style={styles.heroGhost}><Glyph name="chat" size={18} color="#ffffff" /></Pressable> : null}
      </View>
    </LinearGradient>

    {/* TRUST STRIP */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trust}>
      {proof.map(([icon, text]) => <View key={text} style={styles.trustItem}><Glyph name={icon} size={15} color={colors.holoCyan} /><Text style={styles.trustText}>{text}</Text></View>)}
    </ScrollView>

    {/* QUICK ACTIONS */}
    <View style={styles.block}>
      <Text style={styles.h2}>Quick actions</Text>
      <View style={styles.quickGrid}>
        {quick.map((q) => <Pressable key={q.label} onPress={goTo(q)} android_ripple={{ color: '#dbe5f7' }} style={styles.quick}>
          <View style={styles.quickIcon}><Glyph name={q.icon} size={22} color="#ffffff" /></View>
          <Text style={styles.quickLabel} numberOfLines={1}>{q.label}</Text>
        </Pressable>)}
      </View>
    </View>

    {/* FEATURES CAROUSEL */}
    <View style={styles.blockTight}>
      <View style={styles.padH}><Text style={styles.h2}>What your card can do</Text><Text style={styles.sub}>Swipe to explore</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 12} decelerationRate="fast" contentContainerStyle={styles.rail}>
        {FEATURES.map((f) => <View key={f.key} style={[styles.feature, { width: cardW }]}>
          <LinearGradient colors={f.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featureHead}>
            <View style={styles.featureIcon}><Glyph name={f.icon} size={24} color="#ffffff" /></View>
            <Text style={styles.featureTag}>{f.tag}</Text>
          </LinearGradient>
          <View style={styles.featureBody}>
            <Text style={styles.featureTitle}>{f.title}</Text>
            {f.points.map((pt) => <View key={pt} style={styles.point}><Glyph name="check" size={15} color={colors.holoCyan} strokeWidth={2.6} /><Text style={styles.pointText}>{pt}</Text></View>)}
            <Pressable onPress={goTo(f)} style={styles.featureBtn}><Text style={styles.featureBtnText}>{f.member && !session ? 'Create account' : f.cta}</Text><Glyph name="arrowRight" size={16} color="#ffffff" /></Pressable>
          </View>
        </View>)}
      </ScrollView>
    </View>

    {/* PLANS */}
    {plans && plans.length ? <View style={styles.blockTight}>
      <View style={[styles.padH, styles.rowBetween]}><Text style={styles.h2}>Card types</Text><Pressable onPress={go('Shop')} hitSlop={8}><Text style={styles.link}>See all</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {plans.map((plan) => <PlanCard key={plan._id || plan.key} plan={plan} onPress={go('Shop', { plan: plan.key })} />)}
      </ScrollView>
    </View> : null}

    {/* WHY */}
    <View style={styles.block}>
      <Text style={styles.h2}>Why not paper?</Text>
      <View style={styles.whyCard}>
        {WHY.map(([bad, good], i) => <View key={good} style={[styles.whyRow, i > 0 && styles.whyLine]}>
          <View style={styles.whyCell}><View style={[styles.dot, { backgroundColor: '#fde8e8' }]}><Glyph name="close" size={13} color={colors.danger} strokeWidth={2.6} /></View><Text style={styles.whyBad}>{bad}</Text></View>
          <View style={styles.whyCell}><View style={[styles.dot, { backgroundColor: '#e1ecff' }]}><Glyph name="check" size={13} color={colors.holoCyan} strokeWidth={2.8} /></View><Text style={styles.whyGood}>{good}</Text></View>
        </View>)}
      </View>
    </View>

    {/* POSTERS */}
    <View style={styles.blockTight}>
      <View style={[styles.padH, styles.rowBetween]}><Text style={styles.h2}>Magic Posters</Text><Pressable onPress={go('Magic Poster')} hitSlop={8}><Text style={styles.link}>Shop</Text></Pressable></View>
      <Text style={[styles.sub, styles.padH]}>Scan a poster and a video plays on top of it. No app, no login.</Text>
      {posters.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {posters.map((p) => <Image key={p._id} source={{ uri: resolveAssetUrl(p.imageUrl) }} style={styles.poster} resizeMode="cover" />)}
      </ScrollView> : null}
      <View style={[styles.padH, { flexDirection: 'row', gap: 10 }]}>
        <Button title="Shop posters" onPress={go('Magic Poster')} style={{ flex: 1 }} />
        <Button title="Magic Camera" kind="secondary" icon="play" onPress={go('Magic Camera')} style={{ flex: 1 }} />
      </View>
    </View>

    {/* HOW IT WORKS */}
    <View style={styles.block}>
      <Text style={styles.h2}>From order to first tap</Text>
      <View style={styles.stepsRow}>
        {STEPS.map(([title, text], i) => <View key={title} style={styles.stepCol}>
          <View style={styles.stepNo}><Text style={styles.stepNoText}>{i + 1}</Text></View>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.stepText}>{text}</Text>
        </View>)}
      </View>
    </View>

    {/* WHO IT'S FOR */}
    <View style={styles.blockTight}>
      <View style={styles.padH}><Text style={styles.h2}>Made for people who meet people</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {AUDIENCES.map((a, i) => <Pressable key={a.title} onPress={() => setAud(i)} style={[styles.audTab, i === aud && styles.audTabOn]}>
          <Glyph name={a.icon} size={16} color={i === aud ? '#ffffff' : INK} /><Text style={[styles.audTabText, i === aud && { color: '#ffffff' }]}>{a.title}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={[styles.audCard, styles.padHm]}>
        <Text style={styles.audLead}>{active.lead}</Text>
        <View style={styles.chips}>{active.actions.map((x) => <Text key={x} style={styles.chip}>{x}</Text>)}</View>
        <Button title="Get a card" onPress={go('Shop')} />
      </View>
    </View>

    {/* CONFIDENCE */}
    <View style={styles.block}>
      <View style={styles.confGrid}>
        {CONFIDENCE.map(([icon, text]) => <View key={text} style={styles.conf}><Glyph name={icon} size={22} color={colors.holoCyan} /><Text style={styles.confText}>{text}</Text></View>)}
      </View>
    </View>

    {/* CONTACT */}
    <View style={styles.block}>
      <Text style={styles.h2}>Talk to us</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable onPress={go('Contact Us')} style={styles.talk}><View style={styles.quickIcon}><Glyph name="mail" size={20} color="#ffffff" /></View><Text style={styles.talkTitle}>Send a message</Text><Text style={styles.talkText}>Short form, no account.</Text></Pressable>
        <Pressable onPress={go('Chat Support')} style={styles.talk}><View style={[styles.quickIcon, { backgroundColor: colors.holoViolet }]}><Glyph name="chat" size={20} color="#ffffff" /></View><Text style={styles.talkTitle}>Chat support</Text><Text style={styles.talkText}>{session ? 'Reply in the same thread.' : 'Free account needed.'}</Text></Pressable>
      </View>
    </View>

    {/* FAQ */}
    {faqs && faqs.length ? <View style={styles.block}>
      <Text style={styles.h2}>Questions, answered</Text>
      {faqs.map((item, i) => <Accordion key={item._id || i} title={item.question} defaultOpen={i === 0}><Text style={styles.faqText}>{item.answer}</Text></Accordion>)}
      <Button title="See all questions" kind="ghost" onPress={go('FAQ')} />
    </View> : null}

    {/* FINAL */}
    <LinearGradient colors={['#0b3fb8', '#1565ff']} style={styles.final}>
      <Text style={styles.finalTitle}>Stop handing out cards people throw away.</Text>
      <Text style={styles.finalSub}>One tap, and you are in their phone.</Text>
      <Pressable onPress={go('Shop')} style={[styles.heroPrimary, { flex: 0, alignSelf: 'stretch' }]}><Text style={styles.heroPrimaryText}>Order your card</Text></Pressable>
    </LinearGradient>

    <View style={styles.footer}>
      <Text style={styles.footBrand}>HuntsTAG</Text>
      {SITE.phone ? <Text style={styles.footText}>Phone: {SITE.phone}</Text> : null}
      {SITE.businessAddress ? <Text style={styles.footText}>{SITE.businessAddress}</Text> : null}
      {SITE.gstNumber ? <Text style={styles.footText}>GSTIN: {SITE.gstNumber}</Text> : null}
      <View style={styles.footLinks}>
        {['About Us', 'What is HuntsWorld?', 'FAQ', 'Contact Us'].map((label) => <Pressable key={label} onPress={go(label)}><Text style={styles.footLink}>{label}</Text></Pressable>)}
        <Pressable onPress={() => Linking.openURL('mailto:info@huntsworld.com')}><Text style={styles.footLink}>info@huntsworld.com</Text></Pressable>
      </View>
      <Text style={styles.copy}>{'©'} {new Date().getFullYear()} HuntsTAG. All rights reserved.</Text>
    </View>
  </Screen>;
}

// Whole card image (never cropped), with a swatch per style to switch the front image.
function PlanCard({ plan, onPress }) {
  const variants = (plan.variants || []).filter((v) => v.frontImageUrl);
  const [vi, setVi] = useState(0);
  const variant = variants[vi];
  const image = planImage(plan, variant);
  const price = planPrice(plan);
  return <View style={styles.plan}>
    <Pressable onPress={onPress} style={styles.planMedia}>
      {image ? <Image source={{ uri: resolveAssetUrl(image) }} style={styles.planImage} resizeMode="contain" /> : <Glyph name="card" size={30} color={BODY} />}
    </Pressable>
    <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
    {variants.length > 1 ? <View style={styles.swatches}>
      {variants.slice(0, 5).map((v, i) => <Pressable key={v._id || i} onPress={() => setVi(i)} accessibilityLabel={v.name} style={[styles.swatch, i === vi && styles.swatchOn]}>
        <Image source={{ uri: resolveAssetUrl(v.frontImageUrl) }} style={styles.swatchImg} />
      </Pressable>)}
    </View> : null}
    <View style={styles.planFoot}>
      <Text style={styles.planPrice}>{price || 'View'}</Text>
      <Pressable onPress={onPress} style={styles.planGo}><Glyph name="arrowRight" size={16} color="#ffffff" /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingBottom: 26, gap: 12, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 40, height: 28 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0b3fb8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 18 },
  heroKicker: { color: '#dbe9ff', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroName: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  heroTitle: { color: '#ffffff', fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 37, marginTop: 6 },
  heroSub: { color: '#eaf1ff', fontSize: 15, lineHeight: 22 },
  heroBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  heroPrimary: { flex: 1, backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  heroPrimaryText: { color: '#0b3fb8', fontWeight: '900', fontSize: 15 },
  heroGhost: { width: 50, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  trust: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  trustItem: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  trustText: { color: INK, fontSize: 12.5, fontWeight: '700' },
  block: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  blockTight: { paddingVertical: 14, gap: 12 },
  padH: { paddingHorizontal: 16 },
  padHm: { marginHorizontal: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { color: INK, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: BODY, fontSize: 13.5, lineHeight: 19 },
  link: { color: colors.holoCyan, fontWeight: '800', fontSize: 14 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  quick: { width: '25%', alignItems: 'center', gap: 7 },
  quickIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { color: INK, fontSize: 12, fontWeight: '700' },
  rail: { paddingHorizontal: 16, gap: 12 },
  feature: { backgroundColor: '#ffffff', borderRadius: 22, borderWidth: 1, borderColor: colors.panelBorder, overflow: 'hidden' },
  featureHead: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  featureTag: { color: '#ffffff', fontWeight: '800', fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
  featureBody: { padding: 16, gap: 10 },
  featureTitle: { color: INK, fontSize: 19, fontWeight: '800', lineHeight: 24, marginBottom: 2 },
  point: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  pointText: { color: BODY, fontSize: 14, lineHeight: 20, flex: 1 },
  featureBtn: { marginTop: 6, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.holoCyan, borderRadius: 14, paddingVertical: 13 },
  featureBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14.5 },
  plan: { width: 168, backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: colors.panelBorder, padding: 10, gap: 8 },
  planMedia: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  planImage: { width: '100%', height: '100%' },
  planName: { color: INK, fontWeight: '800', fontSize: 15 },
  swatches: { flexDirection: 'row', gap: 6 },
  swatch: { width: 26, height: 26, borderRadius: 7, overflow: 'hidden', borderWidth: 2, borderColor: colors.panelBorder, opacity: 0.8 },
  swatchOn: { borderColor: colors.holoCyan, opacity: 1 },
  swatchImg: { width: '100%', height: '100%' },
  planFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planPrice: { color: colors.holoCyan, fontWeight: '900', fontSize: 17 },
  planGo: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  whyCard: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: colors.panelBorder, paddingHorizontal: 14 },
  whyRow: { flexDirection: 'row', gap: 10, paddingVertical: 13 },
  whyLine: { borderTopWidth: 1, borderTopColor: colors.panelBorder },
  whyCell: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  whyBad: { color: BODY, fontSize: 13, lineHeight: 18, flex: 1, textDecorationLine: 'line-through' },
  whyGood: { color: INK, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: '700' },
  poster: { width: 140, height: 190, borderRadius: 14, backgroundColor: colors.panelRaised },
  stepsRow: { flexDirection: 'row', gap: 8 },
  stepCol: { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: colors.panelBorder, padding: 10, gap: 4, alignItems: 'center' },
  stepNo: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: '#ffffff', fontWeight: '900', fontSize: 15 },
  stepTitle: { color: INK, fontWeight: '800', fontSize: 13.5 },
  stepText: { color: BODY, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  audTab: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  audTabOn: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan },
  audTabText: { color: INK, fontSize: 13, fontWeight: '700' },
  audCard: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: colors.panelBorder, padding: 16, gap: 12 },
  audLead: { color: INK, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { color: INK, fontSize: 12.5, fontWeight: '700', backgroundColor: colors.panelRaised, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  confGrid: { flexDirection: 'row', gap: 8 },
  conf: { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: colors.panelBorder, paddingVertical: 14, alignItems: 'center', gap: 6 },
  confText: { color: INK, fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
  talk: { flex: 1, backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: colors.panelBorder, padding: 14, gap: 8 },
  talkTitle: { color: INK, fontSize: 15, fontWeight: '800' },
  talkText: { color: BODY, fontSize: 12.5 },
  faqText: { color: BODY, fontSize: 13.5, lineHeight: 20 },
  final: { margin: 16, borderRadius: 24, padding: 22, gap: 10, alignItems: 'center' },
  finalTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900', textAlign: 'center', lineHeight: 28 },
  finalSub: { color: '#dbe9ff', fontSize: 14, textAlign: 'center', marginBottom: 6 },
  footer: { padding: 20, gap: 8, alignItems: 'center' },
  footBrand: { color: colors.holoCyan, fontWeight: '900', fontSize: 22 },
  footText: { color: BODY, fontSize: 13, textAlign: 'center' },
  footLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6, justifyContent: 'center' },
  footLink: { color: INK, fontSize: 13, fontWeight: '600' },
  copy: { color: BODY, fontSize: 11, marginTop: 8 },
});
