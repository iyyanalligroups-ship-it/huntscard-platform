import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Nfc, QrCode, Smartphone, RefreshCw, ArrowRight, ShoppingCart, UserRound, Share2, MessageCircle,
  Truck, Eye, BadgeCheck, Play, Contact, CalendarCheck, Link2, Lock, Plus, Minus, X, Check,
  FileText, PackageSearch, Send, CreditCard, Image as ImageIcon, Cloud, FileSpreadsheet, Download, StickyNote, Frame, Upload, Volume2, Crown, Bug, Settings, ShieldCheck, Zap, MessageSquare, Radio, UserPlus, Headphones, Video, Box, Move, ScanLine, Users, Palette, Quote, Phone, Mail, Globe, Stethoscope,
  Store, Building2, Scissors, Calculator, Camera, Sparkles,
} from 'lucide-react';
import ArModelViewer from '../components/ArModelViewer.jsx';
import { api, isLoggedIn, API_URL } from '../api.js';
import { createMotion as gsap_context, dynamicMotion, planTilt, audienceSwap, motionAllowed } from '../homeV3Motion.js';
import { SITE, TESTIMONIALS, DEMO_PROFILE_URL, whatsappLink, trackEvent } from '../siteConfig.js';
import '../home-v3.css';
import '../home-v3-sections.css';
import '../home-v3-fill.css';
import '../home-v3-visuals.css';
import '../home-v3-unique.css';
import '../home-v3-ar.css';
import '../home-v3-plans.css';
import '../home-v3-zing.css';
import '../home-v3-dp.css';
import '../home-v3-editions.css';
import '../home-v3-backup.css';
import '../home-v3-track.css';
import '../home-v3-contact.css';

// Engagement-first homepage. Each full-width band has one job and one action,
// ordered by what a first-time visitor needs to decide: hook -> why -> what
// you get -> price -> how -> confidence -> our edge -> who it's for -> proof
// -> questions -> final push. Items needing real data (testimonials, delivery
// time, demo profile...) stay hidden until configured in siteConfig / .env.

const TONES = ['blue', 'violet', 'green', 'orange'];


const AR_POINTS = [
  [Video, 'Video or photo panel', 'A reel or a hero shot plays right above your card.'],
  [Box, '3D model', 'Show a product or logo people can turn around.'],
  [Contact, 'Contact, portfolio, social', 'Floating tiles people can tap to call, mail or follow you.'],
  [Move, 'You set the layout', 'Drag every element where you want it in AR Layout.'],
];

const ZING_POINTS = [
  [Zap, 'One tap from your dashboard', 'The round Zing button sends your contact card right away.'],
  [Share2, 'Works with the apps they use', 'WhatsApp, Messages, Mail or Nearby Share, whatever their phone offers.'],
  [UserPlus, 'They save you instantly', 'Their share sheet offers Add to Contacts. No app needed.'],
  [Check, 'You see it went through', 'The button flashes green so you know the contact was sent.'],
];

const DP_POINTS = [
  [Lock, 'Secure connection', 'Checks the page is on HTTPS, and on the app whether your Wi-Fi is open or password-protected.', 'Web + app'],
  [ShieldCheck, 'Google Play Protect', 'Tells you if Android’s built-in app scanner is switched on.', 'Android app'],
  [Bug, 'Known hacking tools', 'Looks for a short list of specific network-attack apps, not every app on your phone.', 'Android app'],
  [Settings, 'One tap to fix', 'If something needs attention, we open the right Settings page for you.', 'Android app'],
];

const DP_ROWS = [
  [Lock, 'Secure connection', 'Wi-Fi is password-protected'],
  [ShieldCheck, 'Google Play Protect', 'Play Protect is turned on'],
  [Bug, 'Known hacking tools', 'None of the known tools installed'],
];

const BK_CONTACTS = [['Asha Menon', '#6366f1'], ['Ravi Kumar', '#0d9488'], ['Neha Iyer', '#ea6a12'], ['Imran Khan', '#db2777']];

const BK_POINTS = [
  [Download, 'Import from your phone', 'One tap picks contacts from this phone and skips any already saved.'],
  [FileSpreadsheet, 'Bring Excel or CSV', 'Import a spreadsheet, with a ready template to fill in.'],
  [StickyNote, 'Add what a phone cannot', 'A photo, a company, a note about where you met.'],
  [Upload, 'Export anytime', 'Download an Excel file that opens on any phone to restore them.'],
  [MessageCircle, 'Message in one tap', 'Open WhatsApp with any saved contact straight from the list.'],
];

const TRK_FLOWS = [
  { Icon: CreditCard, title: 'Smart card order', sub: 'Order, build, ship, deliver', steps: [
    ['Order placed', 'Payment confirmed.'],
    ['Card created', 'Our team encodes your card.'],
    ['Shipping', 'On its way, with a tracking ID.'],
    ['Delivered', 'In your hands.'],
  ] },
  { Icon: ImageIcon, title: 'Magic Poster order', sub: 'Order, ship, out for delivery, done', steps: [
    ['Order placed', 'Payment confirmed.'],
    ['Shipping', 'Packed and sent, with a tracking ID.'],
    ['Out for delivery', 'Heading to your address.'],
    ['Completed', 'Delivered and done.'],
  ] },
];

const TRK_EXTRAS = [
  [FileText, 'GST invoice for every order'],
  [PackageSearch, 'Card and poster orders in one place'],
  [Truck, 'Tracking ID shown once shipped'],
];

const AR_STEPS = [
  ['01', 'Scan the QR', 'Open the camera and point it at your card.'],
  ['02', 'Your panel rises', 'Video, 3D model and links appear above the card.'],
  ['03', 'Tap to connect', 'Call, message, book or follow, right from the panel.'],
];

const HERO_CHIPS = [
  { Icon: Phone, label: 'Call', tone: 'blue', pos: 'a' },
  { Icon: MessageCircle, label: 'WhatsApp', tone: 'green', pos: 'b' },
  { Icon: Mail, label: 'Email', tone: 'orange', pos: 'c' },
  { Icon: Globe, label: 'Website', tone: 'violet', pos: 'd' },
];

const PROFILE_POINTS = [
  [Contact, 'Save Contact in one tap'],
  [MessageCircle, 'WhatsApp, call, email and social links'],
  [Link2, 'Portfolio and video showcase'],
  [CalendarCheck, 'Appointment booking'],
  [Share2, 'Contact exchange, so you get their details too'],
];

const STEPS = [
  { Icon: ShoppingCart, title: 'Order your card', text: 'Pick a plan and pay securely online.' },
  { Icon: UserRound, title: 'Set up your profile', text: 'Add photo, links and details in minutes.' },
  { Icon: Nfc, title: 'Tap or scan', text: 'Hand over the card. Their phone opens your profile.' },
  { Icon: Share2, title: 'Connect and grow', text: 'They save you. You get the enquiry.' },
];

const COMPARE = [
  ['Gets lost or thrown away', 'Saved straight into their phone'],
  ['Details go out of date', 'Update anytime, no reprint'],
  ['Just a name and number', 'WhatsApp, portfolio, video, bookings'],
  ['You never learn who read it', 'Contact exchange brings their details to you'],
];

const CONFIDENCE = [
  { Icon: Lock, title: 'Secure payment', text: 'Pay by UPI or card through Razorpay.' },
  { Icon: FileText, title: 'GST invoice', text: 'A proper invoice for every order.' },
  { Icon: PackageSearch, title: 'Track your order', text: 'See your order status any time.' },
  { Icon: Headphones, title: 'Real support', text: 'Chat with us before and after you buy.' },
];

const AUDIENCES = [
  { Icon: Stethoscope, title: 'Doctors & clinics', role: 'Consultant Physician', lead: 'Patients save you and book in a tap.',
    text: 'Share clinic timings, location and your booking link. No more scribbled numbers on a prescription pad.', actions: ['Book appointment', 'Call clinic', 'Clinic location'] },
  { Icon: Store, title: 'Shop owners', role: 'Owner, Your Store', lead: 'Turn every walk-in into a WhatsApp customer.',
    text: 'Put your catalogue, location and WhatsApp order line in one tap, even after the customer leaves the shop.', actions: ['Order on WhatsApp', 'See catalogue', 'Store location'] },
  { Icon: Building2, title: 'Real estate', role: 'Property Consultant', lead: 'Hand over listings, not paperwork.',
    text: 'Share live listings, your contact and a site-visit booking link with every prospect you meet.', actions: ['View listings', 'Call agent', 'Book a site visit'] },
  { Icon: Scissors, title: 'Salons & studios', role: 'Stylist, Your Studio', lead: 'Show your work and fill your calendar.',
    text: 'Let people see your portfolio and pick a slot straight from your card.', actions: ['Book a slot', 'See our work', 'Call us'] },
  { Icon: Calculator, title: 'CAs & consultants', role: 'Chartered Accountant', lead: 'Look professional. Be easy to reach.',
    text: 'One clean profile with your services, booking link and WhatsApp, always up to date.', actions: ['Book consultation', 'Our services', 'WhatsApp'] },
  { Icon: Camera, title: 'Creators & freelancers', role: 'Photographer, Designer', lead: 'Every profile and portfolio, linked.',
    text: 'Send brands to your best work and your enquiry link, and change it whenever you like.', actions: ['Portfolio', 'Social profiles', 'Work with me'] },
];


const BULK = [
  [Users, 'Team & bulk orders'],
  [Palette, 'Custom card design'],
  [Play, 'Branded Magic Posters'],
];

const PLAN_FALLBACK_IMAGES = ['/assets/photos/card-black.jpg', '/assets/photos/card-art.jpg', '/assets/photos/card-orange.jpg', '/assets/photos/card-teal.jpg'];

function Band({ className = '', id, label, children }) {
  return (
    <section className={`hv3-band ${className}`} id={id} aria-label={label}>
      <div className="hv3-in">{children}</div>
    </section>
  );
}

// Scroll-reveal wrapper. Renders a plain element tagged `data-r`; the GSAP
// timeline in HomeV3 (useHomeMotion) animates every tagged element into place
// as it scrolls into view, so there is one animation system on this page.
function R({ as: Tag = 'div', className = '', delay, children, ...rest }) {
  return <Tag className={className} data-r="" {...rest}>{children}</Tag>;
}

// What someone sees after tapping a card, drawn in markup so it stays sharp at any size.
const PHONE_ACTIONS = [
  [Phone, 'Call', 'blue'], [MessageCircle, 'WhatsApp', 'green'], [Mail, 'Email', 'orange'], [Globe, 'Website', 'violet'],
  [Link2, 'Portfolio', 'blue'], [CalendarCheck, 'Book', 'green'], [Share2, 'Share', 'orange'], [QrCode, 'QR', 'violet'],
];
function ProfilePhone({ user }) {
  // Logged-out visitors see a sample; logged-in users see their own photo, name and designation.
  const name = (user && user.fullName) || 'Your Name';
  const role = (user && user.jobTitle) || 'Your Designation';
  const initials = user && user.fullName
    ? user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
    : '';
  return (
    <div className="hv3-phone hv3-profile">
      <div className="hv3-profile-banner" />
      <div className="hv3-profile-avatar">
        {user && user.photoUrl
          ? <img src={user.photoUrl} alt="" />
          : initials ? <span>{initials}</span> : <UserRound size={34} strokeWidth={1.6} aria-hidden="true" />}
      </div>
      <b className="hv3-profile-name" title={name}>{name}</b>
      <span className="hv3-profile-role" title={role}>{role}</span>
      <span className="hv3-profile-save" aria-hidden="true"><Contact size={15} />Save Contact</span>
      <div className="hv3-profile-grid" aria-hidden="true">
        {PHONE_ACTIONS.map(([I, label, tone]) => (
          <span key={label} className={`hv3-tone-${tone}`}><i><I size={18} strokeWidth={2} /></i>{label}</span>
        ))}
      </div>
      <div className="hv3-profile-about" aria-hidden="true">
        <i /><i /><i className="short" />
      </div>
      <div className="hv3-profile-book" aria-hidden="true"><CalendarCheck size={16} /><span>Next slot today, 4:30 PM</span><b>Book</b></div>
    </div>
  );
}

// One plan: the whole card image is shown (never cropped), with a swatch per style
// (variant) to switch front images, and a front/back flip on hover.
// First style's front image of a plan (live from the admin), for the editions band.
function edImage(plan) {
  const v = (plan.variants || []).find((x) => x.frontImageUrl);
  return (v && v.frontImageUrl) || (plan.images && plan.images[0]) || '';
}
// Feature chips taken from the plan's real flags, not hard-coded claims.
function edFeatures(plan, sound) {
  const out = [];
  if (sound && plan.isSpecialEdition) out.push('Custom sound on scan');
  if (plan.arEnabled) out.push('Augmented reality');
  if (plan.zingEnabled) out.push('Zing sharing');
  if (plan.magicEnabled) out.push('Magic Business Card');
  if (sound && plan.isSpecialEdition) out.push('Set up by our team');
  if (!sound && plan.requiresDesignUpload) out.unshift('Your own front and back');
  return out;
}

function PlanCard({ plan, index }) {
  const variants = (plan.variants || []).filter((v) => v.frontImageUrl);
  const [vi, setVi] = useState(0);
  const [back, setBack] = useState(false);
  const fallback = PLAN_FALLBACK_IMAGES[index % PLAN_FALLBACK_IMAGES.length];
  const v = variants[vi];
  const front = (v && v.frontImageUrl) || (plan.images && plan.images[0]) || fallback;
  const shown = back && v && v.backImageUrl ? v.backImageUrl : front;
  const price = plan.priceAmount || plan.price;
  const shape = v && v.shape === 'horizontal' ? 'horizontal' : 'vertical';
  return (
    <article className="hv3-plan" data-spot-label={plan.zingEnabled ? 'Includes Zing' : ''} data-zing={plan.zingEnabled ? '1' : '0'} data-ar={plan.arEnabled ? '1' : '0'} data-magic={plan.magicEnabled ? '1' : '0'}>
      <Link to={`/shop?plan=${plan.key}`} className={`hv3-plan-media ${shape}`} aria-label={`${plan.name} card`}
            onMouseEnter={() => setBack(true)} onMouseLeave={() => setBack(false)}
            onClick={() => trackEvent('plan_click', { plan: plan.key })}>
        <img src={shown} alt={`${plan.name}${v ? ' - ' + v.name : ''}`} loading="lazy" onError={(e) => { e.currentTarget.src = fallback; }} />
        {v && v.backImageUrl && <span className="hv3-flip">{back ? 'Back' : 'Front'}</span>}
      </Link>
      <b>{plan.name}</b>
      {variants.length > 1 && <span className="hv3-hoverhint" aria-hidden="true">Hover to preview {variants.length} styles</span>}
      {variants.length > 1 && (
        <div className="hv3-swatches" role="group" aria-label={`${plan.name} styles`}>
          {variants.slice(0, 5).map((s, k) => (
            <button type="button" key={s._id || k} className={k === vi ? 'on' : ''} title={s.name} aria-label={s.name} aria-pressed={k === vi} onClick={() => setVi(k)} onMouseEnter={() => setVi(k)} onFocus={() => setVi(k)}>
              <img src={s.frontImageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.closest('button').style.display = 'none'; }} />
            </button>
          ))}
          {variants.length > 5 && <em>+{variants.length - 5}</em>}
        </div>
      )}
      <small className="hv3-style-name">{variants.length > 1 ? `${v.name} · ${variants.length} styles` : (v ? v.name : 'Smart NFC card')}</small>
      {price ? <span className="hv3-price">₹{price}</span> : <span className="hv3-price hv3-price-ask">View details</span>}
      <Link to={`/shop?plan=${plan.key}`} className="hv3-plan-cta" onClick={() => trackEvent('plan_click', { plan: plan.key })}>Choose style <ArrowRight size={14} aria-hidden="true" /></Link>
    </article>
  );
}

// Looping illustration of a tap: card slides to the phone, a ripple, then the profile opens.
function TapDemo({ user }) {
  // Same logged-in details as the hero phone: own photo/initials, name and designation.
  const name = (user && user.fullName) || 'Your Name';
  const role = (user && user.jobTitle) || 'Your Designation';
  const initials = user && user.fullName ? user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') : '';
  return (
    <div className="hv3-phone hv3-tapdemo" aria-hidden="true">
      <div className="td-screen">
        <div className="td-idle"><Nfc size={30} /><small>Hold card here</small></div>
        <div className="td-profile">
          <div className="td-banner" /><div className="td-avatar">{user && user.photoUrl ? <img src={user.photoUrl} alt="" /> : initials ? <u>{initials}</u> : <UserRound size={22} />}</div>
          <b title={name}>{name}</b><span title={role}>{role}</span>
          <em><Contact size={12} />Save Contact</em>
          <div className="td-row"><i className="hv3-tone-green"><MessageCircle size={14} /></i><i className="hv3-tone-blue"><Phone size={14} /></i><i className="hv3-tone-orange"><Mail size={14} /></i><i className="hv3-tone-violet"><Globe size={14} /></i></div>
          <div className="td-about"><i /><i /><i className="short" /></div>
          <div className="td-video"><span><Play size={16} fill="currentColor" /></span><em>Intro reel</em></div>
          <div className="td-tiles"><i /><i /><i /></div>
          <div className="td-book"><CalendarCheck size={14} /><span>Book an appointment</span><b>Book</b></div>
        </div>
        <span className="td-ripple" /><span className="td-ripple r2" />
      </div>
      <div className="td-card"><span className="td-chip" /><i /><i className="s" /></div>
    </div>
  );
}

function FaqItem({ question, answer, defaultOpen, openSignal }) {
  const [open, setOpen] = useState(!!defaultOpen);
  // a 'What is Zing?' style button bumps openSignal to expand this item
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  const toggle = () => setOpen((v) => !v);
  return (
    <div className={`hv3-faq-item${open ? ' open' : ''}`}>
      <div role="button" tabIndex={0} className="hv3-faq-q" aria-expanded={open} onClick={toggle}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
        <span>{question}</span>
        {open ? <Minus size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
      </div>
      {open && <p>{answer}</p>}
    </div>
  );
}

function WhatsAppBtn({ placement, label = 'Chat on WhatsApp' }) {
  const href = whatsappLink();
  if (!href) return null;
  return (
    <a className="hv3-btn hv3-btn-wa" href={href} target="_blank" rel="noopener noreferrer"
       onClick={() => trackEvent('whatsapp_click', { placement })}>
      <MessageCircle size={18} aria-hidden="true" /> {label}
    </a>
  );
}

export default function HomeV3() {
  const [plans, setPlans] = useState(null);
  const [faqs, setFaqs] = useState(null);
  const [posters, setPosters] = useState([]);
  const [aud, setAud] = useState(0);
  const [spot, setSpot] = useState(null); // 'zing' | 'ar' | 'magic' while a feature is being highlighted
  const [faqSignal, setFaqSignal] = useState({ id: null, n: 0 });
  const spotTimer = useRef(null);
  // FAQ shown on the homepage: the first 6, plus the Zing entry if the admin put it further down.
  const zingFaq = (faqs || []).find((f) => /zing/i.test(f.question));
  const shownFaqs = (faqs || []).slice(0, 6).concat(zingFaq && !(faqs || []).slice(0, 6).includes(zingFaq) ? [zingFaq] : []);

  // "What is Zing?": glide to the FAQ and open the Zing question (answer comes from the admin panel).
  function showZingFaq(e) {
    e.preventDefault();
    trackEvent('zing_faq_click');
    if (!zingFaq) { navigate('/faq'); return; }
    setFaqSignal((s) => ({ id: zingFaq._id || zingFaq.question, n: s.n + 1 }));
    // Opening the answer adds DOM nodes, and PublicMotion's observer refreshes ScrollTrigger ~120ms
    // later, which cancels a smooth scroll already under way. Start scrolling after that refresh.
    window.setTimeout(() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 380);
  }

  // "Get a Zing-ready card": glide to the plans and spotlight the cards that include the feature for ~2.5s.
  function spotlight(feature) {
    return (e) => {
      e.preventDefault();
      trackEvent('feature_spotlight', { feature });
      document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.clearTimeout(spotTimer.current);
      spotTimer.current = window.setTimeout(() => setSpot(feature), 550);
      spotTimer.current = window.setTimeout(() => setSpot(null), 3400);
    };
  }
  useEffect(() => () => window.clearTimeout(spotTimer.current), []);

  const zingPlans = (plans || []).filter((p) => p.zingEnabled);
  const mbcPlan = (plans || []).find((p) => !p.requiresDesignUpload && !p.isSpecialEdition && edImage(p));
  const mbcImg = (mbcPlan && edImage(mbcPlan)) || '/assets/photos/card-black.jpg';
  const magicPlans = (plans || []).filter((p) => p.magicEnabled);
  const customPlan = (plans || []).find((p) => p.requiresDesignUpload);
  const limitedPlan = (plans || []).find((p) => p.isSpecialEdition);
  const [me, setMe] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const ctxRef = useRef(null);
  const firstAud = useRef(true);
  const ActiveIcon = AUDIENCES[aud].Icon;


  // One gsap context owns every tween/trigger on the page; reverting it on
  // unmount cleans up all of it. Skipped entirely for reduced-motion visitors.
  useLayoutEffect(() => {
    if (!motionAllowed() || !rootRef.current) return undefined;
    const ctx = gsap_context(rootRef.current);
    ctxRef.current = ctx;
    const root = rootRef.current;
    return () => {
      ctx.revert();
      ctxRef.current = null;
      root.classList.remove('hv3-motion');
      root.querySelectorAll('[data-rd], [data-mv]').forEach((e) => { e.removeAttribute('data-rd'); delete e.dataset.mv; });
    };
  }, []);

  // Plans, posters and FAQ arrive after the first render; animate them once they do.
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !rootRef.current) return undefined;
    let cleanup = () => {};
    ctx.add(() => {
      dynamicMotion(rootRef.current);
      cleanup = planTilt(rootRef.current);
    });
    return () => cleanup();
  }, [plans, faqs, posters]);

  // Re-play the profession panel whenever the tab changes (not on first paint).
  useLayoutEffect(() => {
    if (firstAud.current) { firstAud.current = false; return; }
    const ctx = ctxRef.current;
    if (ctx && rootRef.current) ctx.add(() => audienceSwap(rootRef.current));
  }, [aud]);

  // Logging in/out from the popup navigates back here without remounting, so key off location.key.
  useEffect(() => {
    if (!isLoggedIn()) { setMe(null); return; }
    api.getProfile().then((p) => setMe(p)).catch(() => setMe(null));
  }, [location.key]);

  useEffect(() => {
    api.listPlans().then((l) => setPlans(Array.isArray(l) ? l.slice(0, 6) : [])).catch(() => setPlans([]));
    api.getPublicFaq().then((l) => setFaqs(Array.isArray(l) ? l : [])).catch(() => setFaqs([]));
    api.getPublicMagicArt().then((l) => setPosters(Array.isArray(l) ? l.filter((p) => p.imageUrl).slice(0, 3) : [])).catch(() => setPosters([]));
  }, []);

  const proof = [
    SITE.deliveryTime && { Icon: Truck, text: `Delivery in ${SITE.deliveryTime}` },
    SITE.freeDesignPreview && { Icon: Eye, text: 'Free design preview' },
    SITE.cardsDelivered && { Icon: BadgeCheck, text: `${SITE.cardsDelivered} cards delivered` },
    { Icon: Lock, text: 'Secure online payment' },
    { Icon: Smartphone, text: 'Works on all phones' },
  ].filter(Boolean);

  return (
    <div className="hv3" ref={rootRef}>
      {/* 1. HOOK */}
      <Band className="hv3-hero" label="HuntsTAG NFC smart business card">
        <div className="hv3-hero-grid">
          <div className="hv3-hero-copy">
            <span className="hv3-eyebrow">NFC smart business card</span>
            <h1>Your identity,<br /><em>beyond a card.</em></h1>
            <p className="hv3-tag">Tap. Connect. Impress.</p>
            <p className="hv3-lead">
              Paper cards get lost. A HuntsTAG card gets saved. One tap opens your profile, WhatsApp and
              portfolio on their phone.
            </p>
            <div className="hv3-cta-row">
              <Link to="/shop" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('order_click', { placement: 'hero' })}>
                Get your card{SITE.fromPrice ? ` — from ₹${SITE.fromPrice}` : ''} <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <WhatsAppBtn placement="hero" />
              <a href="#hv3-video" className="hv3-btn hv3-btn-ghost"><Play size={16} aria-hidden="true" /> Watch it work</a>
            </div>
            <ul className="hv3-mini">
              <li><Nfc size={18} aria-hidden="true" /><span><b>Instant sharing</b>NFC &amp; QR</span></li>
              <li><Smartphone size={18} aria-hidden="true" /><span><b>Works on all phones</b>No app needed</span></li>
              <li><RefreshCw size={18} aria-hidden="true" /><span><b>Update anytime</b>No reprint</span></li>
            </ul>
          </div>
          <div className="hv3-hero-visual">
            <img className="hv3-hero-card hv3-hero-card-a" src="/assets/photos/card-orange.jpg" alt="" aria-hidden="true" />
            <img className="hv3-hero-card hv3-hero-card-b" src="/assets/photos/card-art.jpg" alt="" aria-hidden="true" />
            <ProfilePhone user={me} />
            <span className="hv3-float">Tap to open your world</span>
            {HERO_CHIPS.map(({ Icon, label, tone, pos }) => (
              <span key={label} className={`hv3-chip hv3-chip-${pos} hv3-tone-${tone}`} aria-hidden="true">
                <Icon size={18} strokeWidth={2} />{label}
              </span>
            ))}
            <span className="hv3-savebadge" aria-hidden="true"><Contact size={16} />Save Contact</span>
          </div>
        </div>
      </Band>

      {/* 2. TRUST BAR (only true / configured items) */}
      <div className="hv3-proofbar">
        <ul className="hv3-in hv3-proof" aria-label="Why buy from HuntsTAG">
          {proof.map(({ Icon, text }) => (<li key={text}><Icon size={18} aria-hidden="true" />{text}</li>))}
        </ul>
      </div>

      {/* 3. AUGMENTED REALITY: the HuntsAR layout (replaces the generic "why" tiles) */}
      <Band className="hv3-dark hv3-ar" id="ar" label="Augmented reality">
        <div className="hv3-ar-grid">
          <div className="hv3-ar-copy">
            <R as="span" className="hv3-eyebrow">Augmented reality</R>
            <R as="h2" className="hv3-h2">Your card, floating<br />off the page.</R>
            <R as="p" className="hv3-sub">
              Point a phone camera at the QR on your card and your own panel rises above it: a video, a 3D model, your
              contact details, portfolio and social links. People see you, then tap whatever they need.
            </R>
            <ul className="hv3-ar-points">
              {AR_POINTS.map(([I, title, text]) => (
                <R as="li" key={title}>
                  <span><I size={20} strokeWidth={1.9} aria-hidden="true" /></span>
                  <div><b>{title}</b><small>{text}</small></div>
                </R>
              ))}
            </ul>
            <R className="hv3-cta-row">
              <a href="#plans" className="hv3-btn hv3-btn-primary" onClick={spotlight('ar')}>
                See AR-ready cards <ArrowRight size={18} aria-hidden="true" />
              </a>
              <Link to="/faq" className="hv3-btn hv3-btn-ghost">How AR works</Link>
            </R>
            <R as="p" className="hv3-ar-note">Included on selected plans. You arrange every element yourself in AR Layout.</R>
          </div>

          <R className="ar-scene" aria-hidden="true">
            <div className="ar-stage">
              <div className="ar-viewfinder"><i /><i /><i /><i /></div>
              <div className="ar-glow" />
              <div className="ar-panel ar-p-video"><div className="ar-float">
                <div className="ar-video"><Play size={18} fill="currentColor" /></div>
                <b>Intro reel</b><small>0:24</small>
              </div></div>
              <div className="ar-panel ar-p-contact"><div className="ar-float">
                <span><Phone size={14} />+91 98765 43210</span>
                <span><Mail size={14} />you@yourbrand.com</span>
                <span><Globe size={14} />yourbrand.com</span>
              </div></div>
              <div className="ar-panel ar-p-port"><div className="ar-float">
                <small>Portfolio</small>
                <div><i /><i /><i /></div>
              </div></div>
              <div className="ar-panel ar-p-social"><div className="ar-float">
                <i className="hv3-tone-green"><MessageCircle size={16} /></i>
                <i className="hv3-tone-violet"><Link2 size={16} /></i>
                <i className="hv3-tone-orange"><Share2 size={16} /></i>
                <i className="hv3-tone-blue"><CalendarCheck size={16} /></i>
              </div></div>
              <div className="ar-panel ar-p-model"><div className="ar-float">
                <ArModelViewer src="/assets/models/ar-demo.glb" poster="/assets/huntsTAG-wolf-logo.png" />
                <small>Drag to rotate</small>
              </div></div>
              <div className="ar-cardwrap">
                <img className="ar-card" src="/assets/photos/card-black.jpg" alt="" loading="lazy" decoding="async" />
                <span className="ar-beam" />
              </div>
              <span className="ar-tag"><ScanLine size={14} />Scanning QR</span>
            </div>
          </R>
        </div>

        <ol className="hv3-ar-steps">
          {AR_STEPS.map(([n, t, d]) => (
            <R as="li" key={n}><em>{n}</em><b>{t}</b><span>{d}</span></R>
          ))}
        </ol>
      </Band>

      {/* 3b. ZING: share your contact phone to phone, no card needed */}
      <Band className="hv3-zing" id="zing" label="Zing: share without the card">
        <div className="hv3-zing-grid">
          <R className="zing-scene" aria-hidden="true">
            <div className="zing-phones">
              <div className="zp zp-send">
                <div className="zp-notch" />
                <div className="zp-dash">
                  <small>Your dashboard</small>
                  <b>Priya Sharma</b>
                  <div className="zp-btnwrap"><span className="zp-ring" /><span className="zp-ring r2" /><span className="zp-zing"><Zap size={26} fill="currentColor" /></span></div>
                  <em>Tap Zing</em>
                </div>
                <div className="zp-sheet">
                  <small>Share contact</small>
                  <div>
                    <span className="hv3-tone-green"><MessageCircle size={18} /><i>WhatsApp</i></span>
                    <span className="hv3-tone-blue"><MessageSquare size={18} /><i>Messages</i></span>
                    <span className="hv3-tone-orange"><Mail size={18} /><i>Mail</i></span>
                    <span className="hv3-tone-violet"><Radio size={18} /><i>Nearby</i></span>
                  </div>
                </div>
              </div>
              <div className="zing-flight"><Contact size={16} /><span>Priya Sharma.vcf</span></div>
              <div className="zp zp-recv">
                <div className="zp-notch" />
                <div className="zp-add">
                  <div className="zp-avatar"><UserRound size={26} /></div>
                  <b>Priya Sharma</b>
                  <small>Designer, Your Studio</small>
                  <span className="zp-addbtn"><UserPlus size={14} />Add to Contacts</span>
                  <span className="zp-saved"><Check size={14} />Saved</span>
                </div>
              </div>
            </div>
          </R>

          <div className="hv3-zing-copy">
            <R as="span" className="hv3-eyebrow hv3-eyebrow-dark">Zing</R>
            <R as="h2" className="hv3-h2">No card in your pocket?<br />Zing it.</R>
            <R as="p" className="hv3-sub">
              Open your dashboard, tap the round Zing button, and your contact card goes straight to their phone. They
              pick the app they already use and tap Add to Contacts. Phone to phone, in one tap.
            </R>
            <ul className="hv3-zing-points">
              {ZING_POINTS.map(([I, title, text]) => (
                <R as="li" key={title}>
                  <span><I size={20} strokeWidth={1.9} aria-hidden="true" /></span>
                  <div><b>{title}</b><small>{text}</small></div>
                </R>
              ))}
            </ul>
            {zingPlans.length > 0 && (
              <R className="hv3-zing-plans">
                <small>Included on</small>
                {zingPlans.map((p) => (<Link key={p.key} to={`/shop?plan=${p.key}`}>{p.name}</Link>))}
              </R>
            )}
            <R className="hv3-cta-row">
              <a href="#plans" className="hv3-btn hv3-btn-primary" onClick={spotlight('zing')}>
                Get a Zing-ready card <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a href="#faq" className="hv3-btn hv3-btn-outline-dark" onClick={showZingFaq}>What is Zing?</a>
            </R>
          </div>
        </div>
      </Band>

      {/* 4. PAPER VS HUNTSTAG: the pain point, made visible */}
      <Band className="hv3-c hv3-tint" label="Paper card versus HuntsTAG">
        <R>
          <h2 className="hv3-h2">Paper cards vs HuntsTAG</h2>
          <p className="hv3-sub">Why people stop printing and start tapping.</p>
        </R>
        <R className="hv3-compare" delay={100}>
          <div className="hv3-compare-head"><span>Paper card</span><span>HuntsTAG</span></div>
          {COMPARE.map(([bad, good]) => (
            <div className="hv3-compare-row" key={good}>
              <span className="bad"><X size={16} aria-hidden="true" />{bad}</span>
              <span className="good"><Check size={16} aria-hidden="true" />{good}</span>
            </div>
          ))}
        </R>
      </Band>

      {/* 5. WHAT YOU GET */}
      <Band label="Your complete digital business card">
        <div className="hv3-split">
          <R>
            <h2 className="hv3-h2">Your complete digital business card</h2>
            <p className="hv3-sub">Everything people need to reach you, in one place.</p>
            <ul className="hv3-checks">
              {PROFILE_POINTS.map(([I, t]) => (<li key={t}><span><I size={16} aria-hidden="true" /></span>{t}</li>))}
            </ul>
            <Link to="/shop" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('order_click', { placement: 'profile' })}>
              Get started <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </R>
          <R delay={120} className="hv3-media">
            <img src="/assets/photos/nfc-smart-business-card-poster.png"
                 alt="HuntsTAG NFC card: tap, save contact, social links and website" loading="lazy" decoding="async" />
            <span className="hv3-chip hv3-chip-e hv3-tone-green" aria-hidden="true"><MessageCircle size={18} />WhatsApp</span>
            <span className="hv3-chip hv3-chip-f hv3-tone-violet" aria-hidden="true"><Link2 size={18} />Portfolio</span>
            <span className="hv3-chip hv3-chip-g hv3-tone-orange" aria-hidden="true"><CalendarCheck size={18} />Book a slot</span>
          </R>
        </div>
      </Band>

      {/* 5b. SEE IT WORK: the tap demo video, framed as a phone */}
      <Band className="hv3-tint" id="hv3-video" label="See a tap in action">
        <div className="hv3-split hv3-split-rev">
          <R className="hv3-video-wrap">
            <TapDemo user={me} />
          </R>
          <R delay={120}>
            <span className="hv3-eyebrow hv3-eyebrow-dark">See it in action</span>
            <h2 className="hv3-h2">A real tap, start to finish</h2>
            <p className="hv3-sub">Hold the card to the back of a phone. The profile opens in a second, with nothing to install.</p>
            <ul className="hv3-checks">
              <li><span><Nfc size={16} aria-hidden="true" /></span>Tap the card on any phone</li>
              <li><span><UserRound size={16} aria-hidden="true" /></span>Your profile opens instantly</li>
              <li><span><Contact size={16} aria-hidden="true" /></span>They save your contact in one tap</li>
            </ul>
            <Link to="/shop" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('order_click', { placement: 'video' })}>
              Get your card <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </R>
        </div>
      </Band>

      {/* 6. PRICING (live plans from admin) */}
      {plans && plans.length > 0 && (
        <Band className="hv3-c hv3-dark" id="plans" label="Card types and pricing">
          <R>
            <span className="hv3-eyebrow">Choose your style</span>
            <h2 className="hv3-h2">Card types &amp; pricing</h2>
            <p className="hv3-sub">Premium designs for every professional.</p>
          </R>
          <div className="hv3-plans" data-spot={spot || undefined}>
            {plans.map((p, i) => (
              <R key={p._id || p.key}><PlanCard plan={p} index={i} /></R>
            ))}
          </div>
        </Band>
      )}

      {/* 7. HOW */}
      <Band className="hv3-how" label="How HuntsTAG works">
        <R className="hv3-split-head">
          <div>
            <span className="hv3-eyebrow hv3-eyebrow-dark">How it works</span>
            <h2 className="hv3-h2">From order to first tap<br />in four steps.</h2>
          </div>
          <p className="hv3-sub">Simple, fast and works on any smartphone.</p>
        </R>
        <ol className="hv3-timeline">
          {STEPS.map(({ Icon, title, text }, i) => (
            <R as="li" key={title} delay={i * 110} className="hv3-tl-item">
              <span className="hv3-tl-num">0{i + 1}</span>
              <span className="hv3-tl-dot"><Icon size={16} strokeWidth={2.2} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </R>
          ))}
        </ol>
      </Band>

      {/* 7b. CUSTOM CARD + LIMITED EDITION (live from the plans; hidden if neither exists) */}
      {(customPlan || limitedPlan) && (
        <Band className="hv3-dark hv3-ed" id="editions" label="Custom card and limited edition">
          <R className="hv3-split-head hv3-ed-head">
            <div>
              <span className="hv3-eyebrow">Make it yours</span>
              <h2 className="hv3-h2">Your own design.<br />Or a one-of-a-kind edition.</h2>
            </div>
            <p className="hv3-sub">Two ways to stand out from every other card on the table.</p>
          </R>
          <div className="hv3-ed-grid">
            {customPlan && (
              <R className="ed-panel ed-custom">
                <span className="ed-badge"><Palette size={14} />Your artwork</span>
                <h3>Custom Card</h3>
                <p>Bring your own design. Upload the front and the back at checkout and we make the card from your artwork.</p>
                <div className="ed-visual ed-upload" aria-hidden="true">
                  <div className="ed-drop"><Upload size={22} /><b>front.png</b><i /></div>
                  <div className="ed-drop d2"><Upload size={22} /><b>back.png</b><i /></div>
                  <ArrowRight size={26} className="ed-arrow" />
                  <div className="ed-cardframe">
                    {edImage(customPlan) ? <img src={edImage(customPlan)} alt="" loading="lazy" /> : <span className="ed-blank">Your design</span>}
                  </div>
                </div>
                <ul className="ed-chips">{edFeatures(customPlan).map((f) => (<li key={f}><Check size={13} strokeWidth={3} />{f}</li>))}</ul>
                <div className="ed-foot">
                  <span className="ed-price">{(customPlan.priceAmount || customPlan.price) ? `₹${customPlan.priceAmount || customPlan.price}` : 'View price'}</span>
                  <Link to={`/shop?plan=${customPlan.key}`} className="hv3-btn hv3-btn-light" onClick={() => trackEvent('edition_click', { plan: customPlan.key })}>Design your card <ArrowRight size={16} aria-hidden="true" /></Link>
                </div>
              </R>
            )}
            {limitedPlan && (
              <R className="ed-panel ed-limited">
                <span className="ed-badge"><Crown size={14} />Limited edition</span>
                <h3>{limitedPlan.name}</h3>
                <p>A premium edition set up by our team, with a custom sound that plays when your card is scanned. It stays exactly as designed.</p>
                <div className="ed-visual ed-sound" aria-hidden="true">
                  <span className="ed-wave"><i /><i /><i /></span>
                  <div className="ed-cardframe tilt">
                    {edImage(limitedPlan) ? <img src={edImage(limitedPlan)} alt="" loading="lazy" /> : <span className="ed-blank">Limited</span>}
                  </div>
                  <span className="ed-speaker"><Volume2 size={18} />Plays a sound</span>
                  <span className="ed-eq"><i /><i /><i /><i /><i /></span>
                </div>
                <ul className="ed-chips">{edFeatures(limitedPlan, true).map((f) => (<li key={f}><Check size={13} strokeWidth={3} />{f}</li>))}</ul>
                <div className="ed-foot">
                  <span className="ed-price">{(limitedPlan.priceAmount || limitedPlan.price) ? `₹${limitedPlan.priceAmount || limitedPlan.price}` : 'View price'}</span>
                  <Link to={`/shop?plan=${limitedPlan.key}`} className="hv3-btn hv3-btn-light" onClick={() => trackEvent('edition_click', { plan: limitedPlan.key })}>See the edition <ArrowRight size={16} aria-hidden="true" /></Link>
                </div>
              </R>
            )}
          </div>
        </Band>
      )}

      {/* 7c. CONTACT BACKUP: contacts live in the account, not just one phone */}
      <Band className="hv3-dark hv3-bk" id="contact-backup" label="Contact backup">
        <R className="hv3-bk-head">
          <span className="hv3-eyebrow">Contact backup</span>
          <h2 className="hv3-h2">Switch phones.<br />Keep every contact.</h2>
          <p className="hv3-sub">Your contacts live in your HuntsTAG account, not just inside one phone. Lose it, drop it or upgrade, then log in and they are all still there.</p>
        </R>

        <R className="bk-scene" aria-hidden="true">
          <div className="bk-node bk-old">
            <span className="bk-label"><Smartphone size={14} />Old phone</span>
            <ul>{BK_CONTACTS.map(([n, c], k) => (<li key={n} style={{ '--k': k }}><i style={{ background: c }}>{n[0]}</i><span>{n}</span></li>))}</ul>
          </div>

          <div className="bk-link bk-link1"><span /><span /><span /><ArrowRight size={18} /></div>

          <div className="bk-node bk-vault">
            <span className="bk-ring" /><span className="bk-ring r2" />
            <div className="bk-vaulticon"><Cloud size={34} strokeWidth={1.8} /><ShieldCheck size={16} strokeWidth={2.4} className="bk-lock" /></div>
            <b>HuntsTAG backup</b>
            <small>Saved to your account</small>
            <span className="bk-file"><FileSpreadsheet size={14} />huntsTAG-contacts.xlsx</span>
          </div>

          <div className="bk-link bk-link2"><span /><span /><span /><ArrowRight size={18} /></div>

          <div className="bk-node bk-new">
            <span className="bk-label"><Smartphone size={14} />New phone</span>
            <ul>{BK_CONTACTS.map(([n, c], k) => (<li key={n} style={{ '--k': k }}><i style={{ background: c }}>{n[0]}</i><span>{n}</span></li>))}</ul>
            <span className="bk-restored"><Check size={14} strokeWidth={3} />Restored</span>
          </div>
        </R>

        <ul className="bk-points">
          {BK_POINTS.map(([I, title, text]) => (
            <R as="li" key={title}>
              <span><I size={20} strokeWidth={1.9} aria-hidden="true" /></span>
              <b>{title}</b>
              <small>{text}</small>
            </R>
          ))}
        </ul>

        <R className="hv3-bk-foot">
          <p><ShieldCheck size={15} aria-hidden="true" /> Phone import works in Chrome on Android. Excel, CSV and export work on any device.</p>
          <div className="hv3-cta-row">
            <Link to={me ? '/dashboard/contacts' : '/register'} className="hv3-btn hv3-btn-light" onClick={() => trackEvent('backup_click', { placement: 'backup' })}>
              {me ? 'Open my contacts' : 'Start your backup, free'} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </R>
      </Band>

      {/* 8. BUY WITH CONFIDENCE: the risk reducers the page lacked */}
      <Band className="hv3-conf" label="Buy with confidence">
        <R className="hv3-ribbon">
          <div className="hv3-ribbon-head">
            <h2 className="hv3-h2">Buy with confidence</h2>
            <p className="hv3-sub">Everything you need to order safely.</p>
            <div className="hv3-pay" aria-label="Payment options"><span>UPI</span><span>Cards</span><em>via Razorpay</em></div>
          </div>
          <ul className="hv3-ribbon-list">
            {CONFIDENCE.map(({ Icon, title, text }) => (
              <li key={title}>
                <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                <div><b>{title}</b><span>{text}</span></div>
              </li>
            ))}
          </ul>
        </R>
      </Band>

      {/* 8-. ORDER TRACKING: card and poster orders, step by step */}
      <Band className="hv3-trk" id="track-orders" label="Track your orders">
        <R className="hv3-split-head hv3-trk-head">
          <div>
            <span className="hv3-eyebrow hv3-eyebrow-dark">Order tracking</span>
            <h2 className="hv3-h2">Know where your order is,<br />every step of the way.</h2>
          </div>
          <p className="hv3-sub">Every card and poster order has its own tracker in your dashboard. No calling, no guessing.</p>
        </R>
        <div className="trk-grid">
          {TRK_FLOWS.map((f, fi) => (
            <R className="trk-card" key={f.title} style={{ '--f': fi }}>
              <div className="trk-top">
                <span className="trk-ico"><f.Icon size={22} strokeWidth={1.9} /></span>
                <div><b>{f.title}</b><small>{f.sub}</small></div>
                <span className="trk-paid"><Check size={12} strokeWidth={3} />Paid</span>
              </div>
              <ol className="trk-steps" aria-hidden="true">
                {f.steps.map(([t, d], k) => (
                  <li key={t} style={{ '--k': k }}>
                    <span className="trk-dot"><Check size={13} strokeWidth={3} /><i>{k + 1}</i></span>
                    <div><b>{t}</b><small>{d}</small></div>
                  </li>
                ))}
              </ol>
              <div className="trk-id"><Truck size={14} />Tracking ID<em>appears once it ships</em></div>
            </R>
          ))}
        </div>
        <ul className="trk-extras">
          {TRK_EXTRAS.map(([I, t]) => (<R as="li" key={t}><I size={16} aria-hidden="true" />{t}</R>))}
        </ul>
        <R className="hv3-trk-foot">
          <Link to={me ? '/dashboard/track' : '/register'} className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('track_click', { placement: 'track' })}>
            {me ? 'Track my orders' : 'Create an account to track'} <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </R>
      </Band>

      {/* 8a. MAGIC BUSINESS CARD: QR opens Magic Camera, image tracking, your video plays on the card */}
      <Band className="hv3-dark hv3-mbc" id="magic-card" label="Magic Business Card">
        <R className="hv3-mbc-head">
          <span className="hv3-eyebrow">Magic Business Card</span>
          <h2 className="hv3-h2">The QR opens it.<br />The card image brings it alive.</h2>
          <p className="hv3-sub">It takes both. The QR on your card opens Magic Camera, then the camera recognises your card’s artwork and plays your own video right on it, with buttons to call, open your portfolio or follow you. No app to install.</p>
        </R>
        <ol className="mbc-stages">
          <R as="li" className="mbc-stage">
            <div className="mbc-art mbc-s1" aria-hidden="true">
              <div className="mbc-cardimg"><img src={mbcImg} alt="" loading="lazy" /><span className="mbc-qrzone"><b /><b /><b /><b /></span></div>
              <span className="mbc-tag"><QrCode size={13} />QR opens Magic Camera</span>
            </div>
            <em>01</em><h3>Scan the QR on your card</h3>
            <p>It opens Magic Camera in the browser. No login and no app.</p>
          </R>
          <R as="li" className="mbc-stage">
            <div className="mbc-art mbc-trace" aria-hidden="true">
              <div className="mbc-cardimg"><img src={mbcImg} alt="" loading="lazy" /></div>
              <span className="mbc-frame"><b /><b /><b /><b /></span>
              <span className="mbc-dots">{Array.from({ length: 16 }).map((_, k) => (<u key={k} style={{ '--d': k }} />))}</span>
              <span className="mbc-scanline" />
              <span className="mbc-tag"><ScanLine size={13} />Tracking the card image</span>
            </div>
            <em>02</em><h3>The camera recognises the card image</h3>
            <p>It locks onto your card&rsquo;s artwork and follows it as you move.</p>
          </R>
          <R as="li" className="mbc-stage">
            <div className="mbc-art mbc-play" aria-hidden="true">
              <div className="mbc-cardimg"><img src={mbcImg} alt="" loading="lazy" /><div className="mbc-video"><Play size={26} fill="currentColor" /></div></div>
              <span className="mbc-pill p1"><Phone size={13} />Call</span>
              <span className="mbc-pill p2"><Link2 size={13} />Portfolio</span>
              <span className="mbc-pill p3"><Share2 size={13} />Social</span>
            </div>
            <em>03</em><h3>Your video plays on it</h3>
            <p>Your reel covers the card, with three buttons floating just below.</p>
          </R>
        </ol>
        <R as="p" className="mbc-both"><span><QrCode size={16} />The QR gets you in</span><i>+</i><span><Frame size={16} />The card image is what the camera locks onto</span></R>
        <R className="hv3-mbc-foot">
          {magicPlans.length > 0 && (
            <div className="mbc-plans"><small>Included on</small>{magicPlans.map((p) => (<Link key={p.key} to={`/shop?plan=${p.key}`}>{p.name}</Link>))}</div>
          )}
          <div className="hv3-cta-row">
            <a href="#plans" className="hv3-btn hv3-btn-light" onClick={spotlight('magic')}>Get a Magic Business Card <ArrowRight size={18} aria-hidden="true" /></a>
            <Link to="/magic-camera" className="hv3-btn hv3-btn-outline-light"><Play size={16} aria-hidden="true" /> Try Magic Camera</Link>
          </div>
        </R>
      </Band>

      {/* 8b. DEVICE PROTECTION: the safety checklist inside the account */}
      <Band className="hv3-dp" id="device-protection" label="Device protection">
        <div className="hv3-dp-grid">
          <div className="hv3-dp-copy">
            <R as="span" className="hv3-eyebrow hv3-eyebrow-dark">Device protection</R>
            <R as="h2" className="hv3-h2">A safety check,<br />built into your account.</R>
            <R as="p" className="hv3-sub">
              Your card shares your details, so we help you keep your phone safe too. Open your dashboard and HuntsTAG
              reads a few security settings and tells you, in plain words, what is fine and what to fix.
            </R>
            <ul className="hv3-dp-points">
              {DP_POINTS.map(([I, title, text, where]) => (
                <R as="li" key={title}>
                  <span><I size={20} strokeWidth={1.9} aria-hidden="true" /></span>
                  <div><b>{title}<em>{where}</em></b><small>{text}</small></div>
                </R>
              ))}
            </ul>
            <R as="p" className="hv3-dp-honest"><ShieldCheck size={16} aria-hidden="true" /> A settings checklist, not antivirus. Nothing is scanned and nothing leaves your device.</R>
            <R className="hv3-cta-row">
              <Link to={me ? '/dashboard' : '/register'} className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('dp_click', { placement: 'dp-section' })}>
                {me ? 'Open my dashboard' : 'Create a free account'} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </R>
          </div>

          <R className="dp-scene" aria-hidden="true">
            <div className="dp-card">
              <div className="dp-head">
                <span className="dp-shield"><ShieldCheck size={22} strokeWidth={2} /></span>
                <div><b>Device protection</b><small>Checked just now</small></div>
                <span className="dp-score"><i>0 of 3</i><i>1 of 3</i><i>2 of 3</i><i>3 of 3</i></span>
              </div>
              {DP_ROWS.map(([I, label, detail], k) => (
                <div className="dp-row" key={label} style={{ '--k': k }}>
                  <span className="dp-ico"><I size={18} strokeWidth={2} /></span>
                  <div><b>{label}</b><small>{detail}</small></div>
                  <span className="dp-tick"><Check size={14} strokeWidth={3} /></span>
                </div>
              ))}
              <div className="dp-foot"><Settings size={14} />One tap opens the right Settings page if something needs fixing</div>
            </div>
            <span className="dp-float dp-f1"><Lock size={14} />HTTPS</span>
            <span className="dp-float dp-f2"><Smartphone size={14} />On your phone</span>
          </R>
        </div>
      </Band>

      {/* 9. OUR EDGE: MAGIC POSTERS */}
      <Band className="hv3-dark" label="Magic Poster">
        <div className="hv3-split">
          <R>
            <span className="hv3-eyebrow">Magic Poster</span>
            <h2 className="hv3-h2">Posters that play a video when scanned</h2>
            <p className="hv3-sub">
              Print comes alive. Point your phone at a poster and a video plays on top of it. No app, no login.
              Great for shops, salons, restaurants and events.
            </p>
            <div className="hv3-trybox">
              <img src={`${API_URL}/api/public/qr/magic-camera`} alt="QR code that opens Magic Camera" loading="lazy" />
              <div><b>Try it right now</b><small>Scan this QR to open Magic Camera, then point your phone at a poster on this screen.</small></div>
            </div>
            <div className="hv3-cta-row">
              <Link to="/magic-art" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('poster_click', { placement: 'home' })}>
                Shop Magic Posters <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/magic-camera" className="hv3-btn hv3-btn-ghost"><Play size={16} aria-hidden="true" /> Try Magic Camera</Link>
            </div>
          </R>
          <R delay={120} className="hv3-posters" aria-hidden={posters.length === 0 ? 'true' : undefined}>
            {posters.map((p) => (<img key={p._id} src={p.imageUrl} alt={p.name || 'Magic Poster'} loading="lazy" />))}
            {posters.length > 0 && <span className="hv3-trace" aria-hidden="true"><i /><i /><i /><i /></span>}
            {posters.length > 0 && <span className="hv3-playbadge"><Play size={14} aria-hidden="true" />Plays a video</span>}
          </R>
        </div>
      </Band>

      {/* 10. WHO IT'S FOR */}
      <Band className="hv3-aud-band" label="Who HuntsTAG is for">
        <R className="hv3-split-head">
          <div>
            <span className="hv3-eyebrow hv3-eyebrow-dark">Who it's for</span>
            <h2 className="hv3-h2">Made for people<br />who meet people.</h2>
          </div>
          <p className="hv3-sub">Pick your line of work and see what your card does for you.</p>
        </R>
        <R className="hv3-aud-tabs">
          <div className="hv3-aud-list" role="tablist" aria-label="Professions">
            {AUDIENCES.map((a, i) => {
              const I = a.Icon;
              return (
                <div key={a.title} role="tab" tabIndex={0} aria-selected={aud === i}
                     className={`hv3-aud-tab${aud === i ? ' on' : ''}`}
                     onClick={() => setAud(i)}
                     onMouseEnter={() => setAud(i)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAud(i); } }}>
                  <I size={20} aria-hidden="true" /><span>{a.title}</span><ArrowRight size={16} aria-hidden="true" />
                </div>
              );
            })}
          </div>
          <div className={`hv3-aud-panel hv3-tone-${TONES[aud % 4]}`} key={aud} role="tabpanel">
            <div className="hv3-aud-info">
              <span className="hv3-aud-kicker">{AUDIENCES[aud].title}</span>
              <h3>{AUDIENCES[aud].lead}</h3>
              <p>{AUDIENCES[aud].text}</p>
              <Link to="/shop" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('order_click', { placement: 'audience', who: AUDIENCES[aud].title })}>
                Get a card <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className="hv3-aud-phone" aria-hidden="true">
              <div className="hv3-aud-avatar"><ActiveIcon size={26} strokeWidth={1.7} /></div>
              <b>Your Name</b>
              <small>{AUDIENCES[aud].role}</small>
              {AUDIENCES[aud].actions.map((x) => (<span key={x}>{x}</span>))}
            </div>
          </div>
        </R>
      </Band>

      {/* 11. LIVE DEMO (only when a sample profile is configured) */}
      {DEMO_PROFILE_URL && (
        <Band className="hv3-tint" label="Try a live profile">
          <R className="hv3-center">
            <h2 className="hv3-h2">See a real profile, live</h2>
            <p className="hv3-sub">This is exactly what people see when they tap your card.</p>
            <div className="hv3-cta-row hv3-center-row">
              <Link to={DEMO_PROFILE_URL} className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('demo_profile_click')}>
                Open sample profile <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </R>
        </Band>
      )}

      {/* 12. PROOF (only real customer quotes) */}
      {TESTIMONIALS.length > 0 && (
        <Band className="hv3-c" label="What customers say">
          <R><h2 className="hv3-h2">What our customers say</h2></R>
          <div className="hv3-grid3">
            {TESTIMONIALS.map((t, i) => (
              <R key={t.name + i} delay={i * 80} className="hv3-card hv3-quote">
                <Quote size={22} aria-hidden="true" />
                <p>{t.text}</p>
                <b>{t.name}</b>
                {t.role && <small>{t.role}</small>}
              </R>
            ))}
          </div>
        </Band>
      )}

      {/* 13. BULK / CUSTOM */}
      <Band className="hv3-dark" label="Bulk and custom orders">
        <div className="hv3-split">
          <R>
            <h2 className="hv3-h2">Need cards for a whole team?</h2>
            <p className="hv3-sub">Bulk cards, your own artwork or branded Magic Posters. Tell us what you need and we will shape it with you.</p>
            <figure className="hv3-wolf"><img src="/assets/huntsTAG-wolf-logo.png" alt="HuntsTAG howling wolf emblem" loading="lazy" decoding="async" /></figure>
          </R>
          <R delay={100}>
            <ul className="hv3-bulk">
              {BULK.map(([I, t]) => (<li key={t}><I size={20} aria-hidden="true" />{t}</li>))}
            </ul>
            <div className="hv3-cta-row">
              <Link to="/contact" className="hv3-btn hv3-btn-light">Request a quote</Link>
              <WhatsAppBtn placement="bulk" label="Talk on WhatsApp" />
            </div>
          </R>
        </div>
      </Band>

      {/* 13b. CONTACT: two ways to reach us (form for anyone, chat for account holders) */}
      <Band className="hv3-dark hv3-ct" id="contact-us" label="Contact us">
        <R className="hv3-ct-head">
          <span className="hv3-eyebrow">Get in touch</span>
          <h2 className="hv3-h2">Two ways to reach us.<br />Pick the one that suits you.</h2>
          <p className="hv3-sub">Questions about a plan, an order or anything else? Send a message, or chat with our team and get a reply right here.</p>
        </R>
        <div className="ct-grid">
          <R className="ct-card ct-form">
            <span className="ct-ico"><Mail size={24} strokeWidth={1.9} /></span>
            <h3>Send us a message</h3>
            <p>Fill in a short form and we will get back to you. No account needed.</p>
            <div className="ct-mock" aria-hidden="true">
              <span><i>Name</i><em>Priya Sharma</em></span>
              <span><i>Phone</i><em>9876543210</em></span>
              <span className="ct-msg"><i>Message</i><em>Which card suits a clinic?<b /></em></span>
              <span className="ct-send"><Send size={14} />Send message</span>
            </div>
            <ul className="ct-list"><li><Check size={14} strokeWidth={3} />Open to everyone, no login</li><li><Check size={14} strokeWidth={3} />We get back to you on the details you share</li></ul>
            <Link to="/contact" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('contact_click', { placement: 'form' })}>Open the contact form <ArrowRight size={16} aria-hidden="true" /></Link>
          </R>
          <R className="ct-card ct-chat">
            <span className="ct-ico ct-ico2"><MessageSquare size={24} strokeWidth={1.9} /></span>
            <h3>Chat with support</h3>
            <p>Message our team directly and read the reply in the same thread, any time you come back.</p>
            <div className="ct-mock ct-bubbles" aria-hidden="true">
              <span className="b you">Where is my card order?</span>
              <span className="b team">It shipped today. Your tracking ID is in the Track page.</span>
              <span className="b typing"><u /><u /><u /></span>
            </div>
            <ul className="ct-list"><li><Check size={14} strokeWidth={3} />Replies appear in your chat</li><li><Check size={14} strokeWidth={3} />Needs a free account</li></ul>
            <Link to="/chat" className="hv3-btn hv3-btn-light" onClick={() => trackEvent('contact_click', { placement: 'chat' })}>{me ? 'Open chat support' : 'Log in to chat'} <ArrowRight size={16} aria-hidden="true" /></Link>
          </R>
        </div>
        <R className="ct-also"><WhatsAppBtn placement="contact" label="Prefer WhatsApp?" /></R>
      </Band>

      {/* 14. QUESTIONS */}
      {faqs && faqs.length > 0 && (
        <Band className="hv3-c hv3-tint" id="faq" label="Frequently asked questions">
          <R><h2 className="hv3-h2">Questions, answered</h2></R>
          <div className="hv3-faq">
            {shownFaqs.map((f, i) => (<FaqItem key={f._id || i} question={f.question} answer={f.answer} defaultOpen={i === 0} openSignal={faqSignal.id && faqSignal.id === (f._id || f.question) ? faqSignal.n : 0} />))}
          </div>
          <Link to="/faq" className="hv3-link">See all questions <ArrowRight size={14} aria-hidden="true" /></Link>
        </Band>
      )}

      {/* 15. FINAL PUSH */}
      <Band className="hv3-final" label="Order your card">
        <img className="hv3-final-mark" src="/assets/huntsTAG-wolf-logo.png" alt="" aria-hidden="true" />
        <div className="hv3-final-copy">
          <R as="span" className="hv3-eyebrow">Ready when you are</R>
          <R as="h2" className="hv3-h2">Stop handing out cards people throw away.</R>
          <R as="p" className="hv3-sub">Get yours today. One tap, and you are in their phone.</R>
          <R className="hv3-cta-row hv3-center-row">
            <Link to="/shop" className="hv3-btn hv3-btn-light hv3-btn-pulse" onClick={() => trackEvent('order_click', { placement: 'final' })}>
              Order your card <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <WhatsAppBtn placement="final" />
          </R>
        </div>
      </Band>
    </div>
  );
}
