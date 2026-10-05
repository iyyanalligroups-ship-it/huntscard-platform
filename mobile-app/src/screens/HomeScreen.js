import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Glyph } from '../components/Glyph.js';
import { Accordion, Button, Card, Screen } from '../components/ui.js';
import { rupees } from '../lib/format.js';
import { SITE, initialsOf, openWhatsApp, trackEvent, whatsappUrl } from '../lib/siteConfig.js';
import { colors } from '../theme/colors.js';

// Home screen: same content and order as the website's engagement homepage
// (client-app/src/pages/HomeV3.jsx), laid out for a phone. Plans, FAQ and the
// editions / Zing / Magic Business Card plan lists are read live from the API.

const HERO_CHIPS = [['phone', 'Call'], ['chat', 'WhatsApp'], ['mail', 'Email'], ['globe', 'Website']];

const AR_POINTS = [
  ['camera', 'Video or photo panel', 'A reel or a hero shot plays right above your card.'],
  ['layers', '3D model', 'Show a product or logo people can turn around.'],
  ['contacts', 'Contact, portfolio, social', 'Floating tiles people can tap to call, mail or follow you.'],
  ['edit', 'You set the layout', 'Drag every element where you want it in AR Layout.'],
];
const AR_STEPS = [['Scan the QR', 'Open the camera and point it at your card.'], ['Your panel rises', 'Video, 3D model and links appear above the card.'], ['Tap to connect', 'Call, message, book or follow, right from the panel.']];

const ZING_POINTS = [
  ['zap', 'One tap from your dashboard', 'The round Zing button sends your contact card right away.'],
  ['share', 'Works with the apps they use', 'WhatsApp, Messages, Mail or Nearby Share, whatever their phone offers.'],
  ['users', 'They save you instantly', 'Their share sheet offers Add to Contacts. No app needed.'],
  ['check', 'You see it went through', 'The button flashes green so you know the contact was sent.'],
];

const COMPARE = [
  ['Gets lost or thrown away', 'Saved straight into their phone'],
  ['Details go out of date', 'Update anytime, no reprint'],
  ['Just a name and number', 'WhatsApp, portfolio, video, bookings'],
  ['You never learn who read it', 'Contact exchange brings their details to you'],
];

const MBC_STAGES = [
  ['qr', 'Scan the QR on your card', 'It opens Magic Camera. No login and no app.'],
  ['scan', 'The camera recognises the card image', 'It locks onto your card’s artwork and follows it as you move.'],
  ['play', 'Your video plays on it', 'Your reel covers the card, with three buttons floating just below.'],
];

const BK_POINTS = [
  ['download', 'Import from your phone', 'One tap picks contacts from this phone and skips any already saved.'],
  ['file', 'Bring Excel or CSV', 'Import a spreadsheet, with a ready template to fill in.'],
  ['edit', 'Add what a phone cannot', 'A photo, a company, a note about where you met.'],
  ['upload', 'Export anytime', 'Download an Excel file that opens on any phone to restore them.'],
  ['chat', 'Message in one tap', 'Open WhatsApp with any saved contact straight from the list.'],
];

const TRK_FLOWS = [
  { icon: 'card', title: 'Smart card order', steps: [['Order placed', 'Payment confirmed.'], ['Card created', 'Our team encodes your card.'], ['Shipping', 'On its way, with a tracking ID.'], ['Delivered', 'In your hands.']] },
  { icon: 'image', title: 'Magic Poster order', steps: [['Order placed', 'Payment confirmed.'], ['Shipping', 'Packed and sent, with a tracking ID.'], ['Out for delivery', 'Heading to your address.'], ['Completed', 'Delivered and done.']] },
];

const DP_POINTS = [
  ['lock', 'Secure connection', 'Checks the page is on HTTPS, and whether your Wi-Fi is open or password-protected.', 'Web + app'],
  ['shield', 'Google Play Protect', 'Tells you if Android’s built-in app scanner is switched on.', 'Android app'],
  ['scan', 'Known hacking tools', 'Looks for a short list of specific network-attack apps, not every app on your phone.', 'Android app'],
  ['settings', 'One tap to fix', 'If something needs attention, we open the right Settings page for you.', 'Android app'],
];

const AUDIENCES = [
  { icon: 'user', title: 'Doctors & clinics', lead: 'Patients save you and book in a tap.', text: 'Share clinic timings, location and your booking link. No more scribbled numbers on a prescription pad.', actions: ['Book appointment', 'Call clinic', 'Clinic location'] },
  { icon: 'bag', title: 'Shop owners', lead: 'Turn every walk-in into a WhatsApp customer.', text: 'Put your catalogue, location and WhatsApp order line in one tap, even after the customer leaves the shop.', actions: ['Order on WhatsApp', 'See catalogue', 'Store location'] },
  { icon: 'building', title: 'Real estate', lead: 'Hand over listings, not paperwork.', text: 'Share live listings, your contact and a site-visit booking link with every prospect you meet.', actions: ['View listings', 'Call agent', 'Book a site visit'] },
  { icon: 'palette', title: 'Salons & studios', lead: 'Show your work and fill your calendar.', text: 'Let people see your portfolio and pick a slot straight from your card.', actions: ['Book a slot', 'See our work', 'Call us'] },
  { icon: 'calendar', title: 'CAs & consultants', lead: 'Look professional. Be easy to reach.', text: 'One clean profile with your services, booking link and WhatsApp, always up to date.', actions: ['Book consultation', 'Our services', 'WhatsApp'] },
  { icon: 'camera', title: 'Creators & freelancers', lead: 'Every profile and portfolio, linked.', text: 'Send brands to your best work and your enquiry link, and change it whenever you like.', actions: ['Portfolio', 'Social profiles', 'Work with me'] },
];

const CONFIDENCE = [
  ['lock', 'Secure payment', 'Pay by UPI or card through Razorpay.'],
  ['file', 'GST invoice', 'A proper invoice for every order.'],
  ['package', 'Track your order', 'See your order status any time.'],
  ['chat', 'Real support', 'Chat with us before and after you buy.'],
];

const BULK = [['users', 'Team & bulk orders'], ['palette', 'Custom card design'], ['play', 'Branded Magic Posters']];

const planImage = (plan, variant) => (variant && variant.frontImageUrl) || (plan.images && plan.images[0]) || '';
const planPrice = (plan) => {
  const value = plan.priceAmount || plan.price;
  if (!value) return null;
  return typeof value === 'number' ? rupees(value) : `₹${value}`;
};

export default function HomeScreen({ navigation }) {
  const { session } = useAuth();
  const [plans, setPlans] = useState(null);
  const [faqs, setFaqs] = useState(null);
  const [posters, setPosters] = useState([]);
  const [me, setMe] = useState(null);
  const [aud, setAud] = useState(0);

  useEffect(() => {
    api.listPlans().then((list) => setPlans(Array.isArray(list) ? list.slice(0, 6) : [])).catch(() => setPlans([]));
    api.getPublicFaq().then((list) => setFaqs(Array.isArray(list) ? list.slice(0, 6) : [])).catch(() => setFaqs([]));
    api.getPublicMagicArt().then((list) => setPosters(Array.isArray(list) ? list.filter((p) => p.imageUrl).slice(0, 3) : [])).catch(() => setPosters([]));
  }, []);

  // Logging in/out changes `session`; focus covers coming back to this tab.
  useFocusEffect(useCallback(() => {
    if (!session) { setMe(null); return; }
    api.getProfile().then(setMe).catch(() => setMe(null));
  }, [session]));

  const go = (name, params) => () => { trackEvent('nav', { to: name }); navigation.navigate(name, params); };
  // Account-only screens do not exist in the logged-out navigator, so send visitors to sign up.
  const goMember = (name) => () => navigation.navigate(session ? name : 'Register');

  const customPlan = (plans || []).find((p) => p.requiresDesignUpload);
  const limitedPlan = (plans || []).find((p) => p.isSpecialEdition);
  const zingPlans = (plans || []).filter((p) => p.zingEnabled);
  const magicPlans = (plans || []).filter((p) => p.magicEnabled);
  const mbcPlan = (plans || []).find((p) => !p.requiresDesignUpload && !p.isSpecialEdition && planImage(p, (p.variants || [])[0]));
  const proof = [
    SITE.deliveryTime && ['truck', `Delivery in ${SITE.deliveryTime}`],
    SITE.freeDesignPreview && ['eye', 'Free design preview'],
    SITE.cardsDelivered && ['badgeCheck', `${SITE.cardsDelivered} cards delivered`],
    ['lock', 'Secure online payment'],
    ['phoneDevice', 'Works on all phones'],
  ].filter(Boolean);
  const active = AUDIENCES[aud];
  const hasWhatsApp = Boolean(whatsappUrl());
  const name = (me && me.fullName) || 'Your Name';
  const role = (me && me.jobTitle) || 'Your Designation';

  return <Screen contentStyle={{ padding: 0, gap: 0, paddingBottom: 0 }}>
    {/* 1. HOOK */}
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>NFC SMART BUSINESS CARD</Text>
      <Text style={styles.h1}>Your identity,</Text>
      <Text style={[styles.h1, { color: colors.holoCyan }]}>beyond a card.</Text>
      <Text style={styles.tag}>Tap. Connect. Impress.</Text>
      <Text style={styles.lead}>Paper cards get lost. A HuntsTAG card gets saved. One tap opens your profile, WhatsApp and portfolio on their phone.</Text>
      <View style={styles.stack}>
        <Button title={`Get your card${SITE.fromPrice ? ` — from ₹${SITE.fromPrice}` : ''}`} onPress={go('Shop')} />
        {hasWhatsApp ? <Button title="Chat on WhatsApp" kind="secondary" icon="chat" onPress={() => { trackEvent('whatsapp_click', { placement: 'hero' }); openWhatsApp(); }} /> : null}
      </View>
      <View style={styles.phone}>
        <View style={styles.phoneBanner} />
        <View style={styles.phoneAvatar}>
          {me && me.photoUrl ? <Image source={{ uri: resolveAssetUrl(me.photoUrl) }} style={styles.phoneAvatarImg} /> : <Text style={styles.phoneInitials}>{initialsOf(me && me.fullName) || '?'}</Text>}
        </View>
        <Text style={styles.phoneName} numberOfLines={1}>{name}</Text>
        <Text style={styles.phoneRole} numberOfLines={1}>{role}</Text>
        <View style={styles.saveBtn}><Glyph name="contacts" size={14} color="#fff" /><Text style={styles.saveText}>Save Contact</Text></View>
        <View style={styles.chipRow}>
          {HERO_CHIPS.map(([icon, label]) => <View key={label} style={styles.chip}><Glyph name={icon} size={18} color={colors.holoCyan} /><Text style={styles.chipText}>{label}</Text></View>)}
        </View>
      </View>
    </View>

    {/* 2. TRUST */}
    <View style={styles.trust}>
      {proof.map(([icon, text]) => <View key={text} style={styles.trustItem}><Glyph name={icon} size={15} color={colors.holoCyan} /><Text style={styles.trustText}>{text}</Text></View>)}
    </View>

    {/* 3. AUGMENTED REALITY */}
    <Section tint="#0c1630" eyebrow="Augmented reality" title="Your card, floating off the page." sub="Point a phone camera at the QR on your card and your own panel rises above it: a video, a 3D model, your contact details, portfolio and social links.">
      {AR_POINTS.map(([icon, title, text]) => <IconRow key={title} icon={icon} title={title} text={text} />)}
      <View style={styles.numRow}>
        {AR_STEPS.map(([title, text], i) => <View key={title} style={styles.numItem}><Text style={styles.numBig}>0{i + 1}</Text><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text></View>)}
      </View>
      <Button title="See AR-ready cards" onPress={go('Shop')} />
      <Text style={styles.note}>Included on selected plans. You arrange every element yourself in AR Layout.</Text>
    </Section>

    {/* 3b. ZING */}
    <Section eyebrow="Zing" title="No card in your pocket? Zing it." sub="Open your dashboard, tap the round Zing button, and your contact card goes straight to their phone. They pick the app they already use and tap Add to Contacts.">
      {ZING_POINTS.map(([icon, title, text]) => <IconRow key={title} icon={icon} title={title} text={text} />)}
      {zingPlans.length ? <PlanLinks label="Included on" plans={zingPlans} onPress={(p) => go('Shop', { plan: p.key })()} /> : null}
      <Button title="Get a Zing-ready card" onPress={go('Shop')} />
    </Section>

    {/* 4. PAPER VS HUNTSTAG */}
    <Section tint="#0e1220" title="Paper cards vs HuntsTAG" sub="Why people stop printing and start tapping.">
      <View style={styles.compareHead}><Text style={styles.compareLabel}>Paper card</Text><Text style={[styles.compareLabel, { color: colors.holoCyan }]}>HuntsTAG</Text></View>
      {COMPARE.map(([bad, good]) => <View key={good} style={styles.compareRow}>
        <View style={styles.compareCell}><Glyph name="close" size={15} color={colors.danger} /><Text style={styles.cardText}>{bad}</Text></View>
        <View style={styles.compareCell}><Glyph name="check" size={15} color={colors.holoCyan} /><Text style={[styles.cardText, { color: colors.text }]}>{good}</Text></View>
      </View>)}
    </Section>

    {/* 5. PLANS WITH STYLES */}
    {plans && plans.length ? <Section title="Card types & pricing" sub="Premium designs for every professional. Tap a swatch to preview each style.">
      <View style={styles.planGrid}>{plans.map((plan) => <PlanCard key={plan._id || plan.key} plan={plan} onPress={go('Shop', { plan: plan.key })} />)}</View>
    </Section> : null}

    {/* 7b. EDITIONS */}
    {customPlan || limitedPlan ? <Section tint="#0c1630" eyebrow="Make it yours" title="Your own design. Or a one-of-a-kind edition." sub="Two ways to stand out from every other card on the table.">
      {customPlan ? <EditionCard badge="Your artwork" icon="palette" plan={customPlan} text="Bring your own design. Upload the front and the back at checkout and we make the card from your artwork." cta="Design your card" extra={customPlan.requiresDesignUpload ? 'Your own front and back' : ''} onPress={go('Shop', { plan: customPlan.key })} /> : null}
      {limitedPlan ? <EditionCard badge="Limited edition" icon="sparkles" plan={limitedPlan} text="A premium edition set up by our team, with a custom sound that plays when your card is scanned. It stays exactly as designed." cta="See the edition" extra={limitedPlan.isSpecialEdition ? 'Custom sound on scan' : ''} onPress={go('Shop', { plan: limitedPlan.key })} /> : null}
    </Section> : null}

    {/* 8a. MAGIC BUSINESS CARD */}
    <Section tint="#10102a" eyebrow="Magic Business Card" title="The QR opens it. The card image brings it alive." sub="It takes both. The QR on your card opens Magic Camera, then the camera recognises your card’s artwork and plays your own video right on it, with buttons to call, open your portfolio or follow you.">
      {mbcPlan ? <Image source={{ uri: resolveAssetUrl(planImage(mbcPlan, (mbcPlan.variants || [])[0])) }} style={styles.mbcCard} resizeMode="contain" /> : null}
      {MBC_STAGES.map(([icon, title, text], i) => <IconRow key={title} icon={icon} title={`${i + 1}. ${title}`} text={text} />)}
      <View style={styles.bothRow}><Pill icon="qr" text="The QR gets you in" /><Text style={styles.plus}>+</Text><Pill icon="scan" text="The card image is what the camera locks onto" /></View>
      {magicPlans.length ? <PlanLinks label="Included on" plans={magicPlans} onPress={(p) => go('Shop', { plan: p.key })()} /> : null}
      <Button title="Get a Magic Business Card" onPress={go('Shop')} />
      <Button title="Try Magic Camera" kind="secondary" icon="play" onPress={go('Magic Camera')} />
    </Section>

    {/* 7c. CONTACT BACKUP */}
    <Section tint="#0b3a8a" eyebrow="Contact backup" title="Switch phones. Keep every contact." sub="Your contacts live in your HuntsTAG account, not just inside one phone. Lose it, drop it or upgrade, then log in and they are all still there.">
      {BK_POINTS.map(([icon, title, text]) => <IconRow key={title} icon={icon} title={title} text={text} />)}
      <Text style={styles.note}>Phone import works on Android. Excel, CSV and export work on any device.</Text>
      <Button title={session ? 'Open my contacts' : 'Start your backup, free'} onPress={goMember('Contacts')} />
    </Section>

    {/* 7. HOW IT WORKS */}
    <Section title="From order to first tap in four steps." sub="Simple, fast and works on any smartphone.">
      {[['Order your card', 'Pick a plan and pay securely online.'], ['Set up your profile', 'Add photo, links and details in minutes.'], ['Tap or scan', 'Hand over the card. Their phone opens your profile.'], ['Connect and grow', 'They save you. You get the enquiry.']].map(([title, text], i) =>
        <View key={title} style={styles.step}><View style={styles.stepNo}><Text style={styles.stepNoText}>{i + 1}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text></View></View>)}
    </Section>

    {/* 8-. ORDER TRACKING */}
    <Section tint="#0e1220" eyebrow="Order tracking" title="Know where your order is, every step of the way." sub="Every card and poster order has its own tracker. No calling, no guessing.">
      {TRK_FLOWS.map((flow) => <Card key={flow.title} style={{ gap: 12 }}>
        <View style={styles.flowHead}><View style={styles.iconBox}><Glyph name={flow.icon} size={20} color={colors.holoCyan} /></View><Text style={styles.cardTitle}>{flow.title}</Text><View style={{ flex: 1 }} /><Text style={styles.paid}>Paid</Text></View>
        {flow.steps.map(([title, text], i) => <View key={title} style={styles.trkStep}>
          <View style={styles.trkDot}><Glyph name="check" size={12} color="#06120f" strokeWidth={3} /></View>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text></View>
        </View>)}
        <Text style={styles.note}>A tracking ID appears once it ships.</Text>
      </Card>)}
      <Button title={session ? 'Track my orders' : 'Create an account to track'} onPress={goMember('Track Orders')} />
    </Section>

    {/* 8. BUY WITH CONFIDENCE */}
    <Section title="Buy with confidence" sub="Everything you need to order safely.">
      {CONFIDENCE.map(([icon, title, text]) => <IconRow key={title} icon={icon} title={title} text={text} />)}
    </Section>

    {/* 8b. DEVICE PROTECTION */}
    <Section tint="#0b2a2a" eyebrow="Device protection" title="A safety check, built into your account." sub="Your card shares your details, so we help you keep your phone safe too. HuntsTAG reads a few security settings and tells you, in plain words, what is fine and what to fix.">
      {DP_POINTS.map(([icon, title, text, where]) => <IconRow key={title} icon={icon} title={title} text={text} badge={where} />)}
      <Text style={styles.note}>A settings checklist, not antivirus. Nothing is scanned and nothing leaves your device.</Text>
      <Button title={session ? 'Open Device Protection' : 'Create a free account'} onPress={goMember('Device Protection Check')} />
    </Section>

    {/* 9. MAGIC POSTERS */}
    <Section tint="#0c1630" eyebrow="Magic Poster" title="Posters that play a video when scanned" sub="Print comes alive. Point your phone at a poster and a video plays on top of it. No app, no login. Great for shops, salons, restaurants and events.">
      {posters.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {posters.map((p) => <Image key={p._id} source={{ uri: resolveAssetUrl(p.imageUrl) }} style={styles.poster} resizeMode="cover" />)}
      </ScrollView> : null}
      <Button title="Shop Magic Posters" onPress={go('Magic Poster')} />
      <Button title="Try Magic Camera" kind="secondary" icon="play" onPress={go('Magic Camera')} />
    </Section>

    {/* 10. WHO IT'S FOR */}
    <Section eyebrow="Who it's for" title="Made for people who meet people." sub="Pick your line of work and see what your card does for you.">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {AUDIENCES.map((a, i) => <Pressable key={a.title} onPress={() => setAud(i)} style={[styles.audTab, i === aud && styles.audTabOn]}>
          <Glyph name={a.icon} size={15} color={i === aud ? '#06120f' : colors.text} /><Text style={[styles.audTabText, i === aud && { color: '#06120f' }]}>{a.title}</Text>
        </Pressable>)}
      </ScrollView>
      <Card style={{ gap: 10 }}>
        <Text style={styles.kicker}>{active.title}</Text>
        <Text style={styles.h3}>{active.lead}</Text>
        <Text style={styles.cardText}>{active.text}</Text>
        <View style={styles.actionWrap}>{active.actions.map((x) => <Text key={x} style={styles.actionChip}>{x}</Text>)}</View>
        <Button title="Get a card" onPress={go('Shop')} />
      </Card>
    </Section>

    {/* 13. BULK */}
    <Section tint="#0c1630" title="Need cards for a whole team?" sub="Bulk cards, your own artwork or branded Magic Posters. Tell us what you need and we will shape it with you.">
      {BULK.map(([icon, text]) => <View key={text} style={styles.bulkRow}><Glyph name={icon} size={18} color={colors.holoCyan} /><Text style={styles.cardTitle}>{text}</Text></View>)}
      <Button title="Request a quote" onPress={go('Contact Us')} />
      {hasWhatsApp ? <Button title="Talk on WhatsApp" kind="secondary" icon="chat" onPress={() => { trackEvent('whatsapp_click', { placement: 'bulk' }); openWhatsApp(); }} /> : null}
    </Section>

    {/* CONTACT: form + chat */}
    <Section eyebrow="Get in touch" title="Two ways to reach us." sub="Questions about a plan, an order or anything else? Send a message, or chat with our team and get a reply right here.">
      <Card style={{ gap: 10 }}>
        <View style={styles.iconBox}><Glyph name="mail" size={20} color={colors.holoCyan} /></View>
        <Text style={styles.h3}>Send us a message</Text>
        <Text style={styles.cardText}>Fill in a short form and we will get back to you. No account needed.</Text>
        <Button title="Open the contact form" onPress={go('Contact Us')} />
      </Card>
      <Card style={{ gap: 10 }}>
        <View style={styles.iconBox}><Glyph name="chat" size={20} color={colors.holoViolet} /></View>
        <Text style={styles.h3}>Chat with support</Text>
        <Text style={styles.cardText}>Message our team directly and read the reply in the same thread, any time you come back. Needs a free account.</Text>
        <Button title={session ? 'Open chat support' : 'Log in to chat'} kind="secondary" onPress={go('Chat Support')} />
      </Card>
    </Section>

    {/* 14. FAQ */}
    {faqs && faqs.length ? <Section tint="#0e1220" title="Questions, answered">
      {faqs.map((item, i) => <Accordion key={item._id || i} title={item.question} defaultOpen={i === 0}><Text style={styles.cardText}>{item.answer}</Text></Accordion>)}
      <Button title={'See all questions →'} kind="ghost" onPress={go('FAQ')} />
    </Section> : null}

    {/* 15. FINAL */}
    <View style={[styles.section, styles.final]}>
      <Text style={[styles.h2, { textAlign: 'center' }]}>Stop handing out cards people throw away.</Text>
      <Text style={[styles.cardText, { textAlign: 'center' }]}>Get yours today. One tap, and you are in their phone.</Text>
      <View style={[styles.stack, { alignSelf: 'stretch' }]}>
        <Button title="Order your card" onPress={go('Shop')} />
        {hasWhatsApp ? <Button title="Chat on WhatsApp" kind="secondary" icon="chat" onPress={() => { trackEvent('whatsapp_click', { placement: 'final' }); openWhatsApp(); }} /> : null}
      </View>
    </View>

    <View style={styles.footer}>
      <Text style={styles.footBrand}>HuntsTAG</Text>
      <Text style={styles.cardText}>A smart card for a smarter first impression.</Text>
      {SITE.phone ? <Text style={styles.cardText}>Phone: {SITE.phone}</Text> : null}
      {SITE.businessAddress ? <Text style={styles.cardText}>{SITE.businessAddress}</Text> : null}
      {SITE.gstNumber ? <Text style={styles.cardText}>GSTIN: {SITE.gstNumber}</Text> : null}
      <View style={styles.footLinks}>
        {['About Us', 'What is HuntsWorld?', 'Shop', 'Catalog', 'Magic Poster', 'FAQ', 'Chat Support', 'Contact Us'].map((label) => <Pressable key={label} onPress={go(label)}><Text style={styles.footLink}>{label}</Text></Pressable>)}
        <Pressable onPress={() => Linking.openURL('mailto:info@huntsworld.com')}><Text style={styles.footLink}>info@huntsworld.com</Text></Pressable>
      </View>
      <Text style={styles.copy}>{'©'} {new Date().getFullYear()} HuntsTAG. All rights reserved.</Text>
    </View>
  </Screen>;
}

function Section({ title, sub, eyebrow, tint, children }) {
  return <View style={[styles.section, tint ? { backgroundColor: tint } : null]}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
    <Text style={styles.h2}>{title}</Text>
    {sub ? <Text style={styles.cardText}>{sub}</Text> : null}
    {children}
  </View>;
}

function IconRow({ icon, title, text, badge }) {
  return <View style={styles.iconRow}>
    <View style={styles.iconBox}><Glyph name={icon} size={19} color={colors.holoCyan} /></View>
    <View style={{ flex: 1 }}>
      <View style={styles.titleRow}><Text style={styles.cardTitle}>{title}</Text>{badge ? <Text style={styles.badge}>{badge}</Text> : null}</View>
      <Text style={styles.cardText}>{text}</Text>
    </View>
  </View>;
}

function Pill({ icon, text }) {
  return <View style={styles.pill}><Glyph name={icon} size={14} color={colors.holoCyan} /><Text style={styles.pillText}>{text}</Text></View>;
}

function PlanLinks({ label, plans, onPress }) {
  return <View style={styles.planLinks}>
    <Text style={styles.cardText}>{label}</Text>
    {plans.map((p) => <Pressable key={p.key} onPress={() => onPress(p)}><Text style={styles.planLink}>{p.name}</Text></Pressable>)}
  </View>;
}

// Whole card image (never cropped), with a swatch per style to switch the front image.
// No hover on a phone, so the swatches are always visible.
function PlanCard({ plan, onPress }) {
  const variants = (plan.variants || []).filter((v) => v.frontImageUrl);
  const [vi, setVi] = useState(0);
  const variant = variants[vi];
  const image = planImage(plan, variant);
  const price = planPrice(plan);
  return <View style={styles.plan}>
    <Pressable onPress={onPress} style={styles.planMedia}>
      {image ? <Image source={{ uri: resolveAssetUrl(image) }} style={styles.planImage} resizeMode="contain" /> : <Glyph name="card" size={30} color={colors.textDim} />}
    </Pressable>
    <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
    {variants.length > 1 ? <View style={styles.swatches}>
      {variants.slice(0, 5).map((v, i) => <Pressable key={v._id || i} onPress={() => setVi(i)} accessibilityLabel={v.name} style={[styles.swatch, i === vi && styles.swatchOn]}>
        <Image source={{ uri: resolveAssetUrl(v.frontImageUrl) }} style={styles.swatchImg} />
      </Pressable>)}
      {variants.length > 5 ? <Text style={styles.cardText}>+{variants.length - 5}</Text> : null}
    </View> : null}
    <Text style={styles.styleName} numberOfLines={1}>{variants.length > 1 ? `${variant.name} · ${variants.length} styles` : (variant ? variant.name : 'Smart NFC card')}</Text>
    {price ? <Text style={styles.planPrice}>{price}</Text> : <Text style={styles.styleName}>View details</Text>}
    <Pressable onPress={onPress}><Text style={styles.link}>Choose style {'→'}</Text></Pressable>
  </View>;
}

function EditionCard({ badge, icon, plan, text, cta, extra, onPress }) {
  const variant = (plan.variants || []).find((v) => v.frontImageUrl);
  const image = planImage(plan, variant);
  const price = planPrice(plan);
  const chips = [extra, plan.arEnabled && 'Augmented reality', plan.zingEnabled && 'Zing sharing', plan.magicEnabled && 'Magic Business Card'].filter(Boolean);
  return <Card style={{ gap: 10 }}>
    <View style={styles.badgeRow}><Glyph name={icon} size={14} color={colors.holoCyan} /><Text style={styles.kicker}>{badge}</Text></View>
    <Text style={styles.h3}>{plan.name}</Text>
    <Text style={styles.cardText}>{text}</Text>
    {image ? <Image source={{ uri: resolveAssetUrl(image) }} style={styles.editionImg} resizeMode="contain" /> : null}
    <View style={styles.actionWrap}>{chips.map((c) => <Text key={c} style={styles.actionChip}>{c}</Text>)}</View>
    <View style={styles.priceRow}>{price ? <Text style={styles.editionPrice}>{price}</Text> : <View />}<Button title={cta} onPress={onPress} style={{ flex: 1, maxWidth: 200 }} /></View>
  </Card>;
}

const styles = StyleSheet.create({
  hero: { padding: 22, paddingTop: 28, gap: 10, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.panelBorder },
  eyebrow: { color: colors.holoCyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  h1: { color: colors.text, fontSize: 36, fontWeight: '900', letterSpacing: -1, lineHeight: 40 },
  h2: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, lineHeight: 30 },
  h3: { color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 25 },
  tag: { color: colors.holoViolet, fontSize: 18, fontWeight: '700', marginTop: 2 },
  lead: { color: colors.textDim, fontSize: 14.5, lineHeight: 22 },
  stack: { gap: 10, marginTop: 4 },
  phone: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 26, borderWidth: 6, borderColor: '#0a0f1c', overflow: 'hidden', marginTop: 14, paddingBottom: 18 },
  phoneBanner: { alignSelf: 'stretch', height: 82, backgroundColor: '#5b4bf0' },
  phoneAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#0b1630', borderWidth: 4, borderColor: '#fff', marginTop: -33, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  phoneAvatarImg: { width: '100%', height: '100%' },
  phoneInitials: { color: '#fff', fontWeight: '800', fontSize: 20 },
  phoneName: { color: '#0b1630', fontSize: 18, fontWeight: '800', marginTop: 8, maxWidth: '86%' },
  phoneRole: { color: '#55627a', fontSize: 13, maxWidth: '86%' },
  saveBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#1565ff', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, marginTop: 12 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  chip: { alignItems: 'center', gap: 4, backgroundColor: '#0b1630', paddingVertical: 8, paddingHorizontal: 9, borderRadius: 12 },
  chipText: { color: '#cfe0ff', fontSize: 10, fontWeight: '700' },
  trust: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, backgroundColor: colors.panelRaised },
  trustItem: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  trustText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  section: { padding: 22, gap: 12 },
  final: { alignItems: 'center', backgroundColor: '#0b3a8a' },
  iconRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { color: colors.holoCyan, fontSize: 10, fontWeight: '800', borderWidth: 1, borderColor: colors.holoCyan, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  cardText: { color: colors.textDim, lineHeight: 20, fontSize: 13 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  numRow: { gap: 12, marginTop: 4 },
  numItem: { gap: 2 },
  numBig: { color: colors.holoViolet, fontSize: 30, fontWeight: '900' },
  compareHead: { flexDirection: 'row', gap: 10 },
  compareLabel: { flex: 1, color: colors.textDim, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  compareRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.panelBorder },
  compareCell: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  plan: { width: '47.5%', backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.panelBorder, padding: 10, gap: 6, alignItems: 'center' },
  planMedia: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  planImage: { width: '100%', height: '100%' },
  planName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  planPrice: { color: colors.holoCyan, fontWeight: '900', fontSize: 17 },
  styleName: { color: colors.textDim, fontSize: 11 },
  swatches: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 7, overflow: 'hidden', borderWidth: 2, borderColor: colors.panelBorder, opacity: 0.75 },
  swatchOn: { borderColor: colors.holoCyan, opacity: 1 },
  swatchImg: { width: '100%', height: '100%' },
  link: { color: colors.holoCyan, fontSize: 12, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  kicker: { color: colors.holoCyan, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  editionImg: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#000' },
  editionPrice: { color: colors.text, fontSize: 24, fontWeight: '900' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionChip: { color: colors.text, fontSize: 12, fontWeight: '600', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, overflow: 'hidden' },
  planLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  planLink: { color: colors.text, fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: colors.holoCyan, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
  mbcCard: { width: '100%', height: 190, borderRadius: 12, backgroundColor: '#000' },
  bothRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  plus: { color: colors.text, fontSize: 20, fontWeight: '900' },
  pill: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.panelRaised },
  pillText: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  stepNo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: '#06120f', fontWeight: '900', fontSize: 18 },
  flowHead: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  paid: { color: '#06120f', backgroundColor: colors.holoCyan, fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  trkStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  trkDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.holoCyan, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  poster: { width: 150, height: 200, borderRadius: 12, backgroundColor: colors.panelRaised },
  audTab: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  audTabOn: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan },
  audTabText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  bulkRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder },
  footer: { padding: 22, gap: 10, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.panelBorder },
  footBrand: { color: colors.holoCyan, fontWeight: '900', fontSize: 22 },
  footLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  footLink: { color: colors.text, fontSize: 13 },
  copy: { color: colors.textDim, fontSize: 11, marginTop: 8 },
});
