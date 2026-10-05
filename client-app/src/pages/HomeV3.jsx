import { Link } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Nfc, QrCode, Smartphone, RefreshCw, ArrowRight, ShoppingCart, UserRound, Share2, MessageCircle,
  Truck, Eye, BadgeCheck, Play, Contact, CalendarCheck, Link2, Lock, Plus, Minus, X, Check,
  FileText, PackageSearch, Headphones, Users, Palette, Quote, Phone, Mail, Globe, Stethoscope,
  Store, Building2, Scissors, Calculator, Camera, Sparkles,
} from 'lucide-react';
import { api } from '../api.js';
import { createMotion as gsap_context, dynamicMotion, planTilt, audienceSwap, motionAllowed } from '../homeV3Motion.js';
import { SITE, TESTIMONIALS, DEMO_PROFILE_URL, whatsappLink, trackEvent } from '../siteConfig.js';
import '../home-v3.css';
import '../home-v3-sections.css';
import '../home-v3-fill.css';
import '../home-v3-visuals.css';
import '../home-v3-unique.css';

// Engagement-first homepage. Each full-width band has one job and one action,
// ordered by what a first-time visitor needs to decide: hook -> why -> what
// you get -> price -> how -> confidence -> our edge -> who it's for -> proof
// -> questions -> final push. Items needing real data (testimonials, delivery
// time, demo profile...) stay hidden until configured in siteConfig / .env.

const TONES = ['blue', 'violet', 'green', 'orange'];

const WHY = [
  { Icon: Nfc, title: 'Tap to share', text: 'One tap opens your profile on any modern phone.' },
  { Icon: QrCode, title: 'QR backup', text: 'No NFC on their phone? They scan the QR instead.' },
  { Icon: Smartphone, title: 'No app needed', text: 'Works from the browser for you and for them.' },
  { Icon: RefreshCw, title: 'Update anytime', text: 'Change details from your dashboard. No reprint.' },
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

// 9x9 pattern for the QR-backup tile illustration (decorative, not a real code).
const QR_CELLS = '111111101110111000111110100101101001010111010101011101010111010100000101010111010101101011101000001010101111111011100101'
  .slice(0, 81).split('').map((c) => c === '1');

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
function ProfilePhone() {
  return (
    <div className="hv3-phone hv3-profile" aria-hidden="true">
      <div className="hv3-profile-banner" />
      <div className="hv3-profile-avatar"><UserRound size={34} strokeWidth={1.6} /></div>
      <b className="hv3-profile-name">Your Name</b>
      <span className="hv3-profile-role">Your Designation</span>
      <span className="hv3-profile-save"><Contact size={15} />Save Contact</span>
      <div className="hv3-profile-grid">
        {PHONE_ACTIONS.map(([I, label, tone]) => (
          <span key={label} className={`hv3-tone-${tone}`}><i><I size={18} strokeWidth={2} /></i>{label}</span>
        ))}
      </div>
      <div className="hv3-profile-about">
        <i /><i /><i className="short" />
      </div>
      <div className="hv3-profile-book"><CalendarCheck size={16} /><span>Next slot today, 4:30 PM</span><b>Book</b></div>
    </div>
  );
}

function FaqItem({ question, answer, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
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

  useEffect(() => {
    api.listPlans().then((l) => setPlans(Array.isArray(l) ? l.slice(0, 6) : [])).catch(() => setPlans([]));
    api.getPublicFaq().then((l) => setFaqs(Array.isArray(l) ? l.slice(0, 6) : [])).catch(() => setFaqs([]));
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
            <ProfilePhone />
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

      {/* 3. WHY: asymmetric bento, each tile with its own mini illustration */}
      <Band className="hv3-why" label="Why choose HuntsTAG">
        <R className="hv3-split-head">
          <div>
            <span className="hv3-eyebrow hv3-eyebrow-dark">Why HuntsTAG</span>
            <h2 className="hv3-h2">More than a card.<br />A smarter way to be remembered.</h2>
          </div>
          <p className="hv3-sub">Four things your paper card never did.</p>
        </R>
        <div className="hv3-bento">
          <R className="bt bt-tap">
            <div className="bt-rings" aria-hidden="true"><i /><i /><i /><Nfc size={34} /></div>
            <img className="bt-card" src="/assets/photos/card-black.jpg" alt="" aria-hidden="true" loading="lazy" />
            <h3>Tap to share</h3>
            <p>One tap opens your profile on any modern phone.</p>
          </R>
          <R className="bt bt-qr" delay={80}>
            <div className="bt-qrart" aria-hidden="true">
              {QR_CELLS.map((on, i) => (<i key={i} className={on ? 'on' : ''} />))}
            </div>
            <div className="bt-text">
              <h3>QR backup</h3>
              <p>No NFC on their phone? They scan the QR instead.</p>
            </div>
          </R>
          <R className="bt bt-app" delay={140}>
            <div className="bt-browser" aria-hidden="true"><span /><span /><span /><em>huntstag.com/c/yourname</em></div>
            <h3>No app needed</h3>
            <p>Works from the browser, for you and for them.</p>
          </R>
          <R className="bt bt-update" delay={200}>
            <div className="bt-field" aria-hidden="true">
              <small>Phone</small>
              <s>+91 90000 00000</s>
              <b>+91 98765 43210</b>
              <span><Check size={12} />Updated just now</span>
            </div>
            <h3>Update anytime</h3>
            <p>Change details from your dashboard. No reprint.</p>
          </R>
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
            <div className="hv3-phone hv3-phone-video">
              <video src="/assets/photos/tap-demo.mp4" autoPlay muted loop playsInline preload="metadata" poster="/assets/photos/card-teal.jpg" />
            </div>
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
          <div className="hv3-plans">
            {plans.map((p, i) => {
              const v = p.variants && p.variants[0];
              const img = (v && v.frontImageUrl) || (p.images && p.images[0]) || PLAN_FALLBACK_IMAGES[i % PLAN_FALLBACK_IMAGES.length];
              const price = p.priceAmount || p.price;
              return (
                <R key={p._id || p.key} delay={i * 70}>
                  <Link to={`/shop?plan=${p.key}`} className="hv3-plan" onClick={() => trackEvent('plan_click', { plan: p.key })}>
                    <img src={img} alt={p.name} loading="lazy"
                         onError={(e) => { e.currentTarget.src = PLAN_FALLBACK_IMAGES[i % PLAN_FALLBACK_IMAGES.length]; }} />
                    <b>{p.name}</b>
                    {price ? <span className="hv3-price">₹{price}</span> : <span className="hv3-price hv3-price-ask">View details</span>}
                    <span className="hv3-plan-cta">View card <ArrowRight size={14} aria-hidden="true" /></span>
                  </Link>
                </R>
              );
            })}
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
            <div className="hv3-cta-row">
              <Link to="/magic-art" className="hv3-btn hv3-btn-primary" onClick={() => trackEvent('poster_click', { placement: 'home' })}>
                Shop Magic Posters <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/magic-camera" className="hv3-btn hv3-btn-ghost"><Play size={16} aria-hidden="true" /> Try Magic Camera</Link>
            </div>
          </R>
          <R delay={120} className="hv3-posters" aria-hidden={posters.length === 0 ? 'true' : undefined}>
            {posters.map((p) => (<img key={p._id} src={p.imageUrl} alt={p.name || 'Magic Poster'} loading="lazy" />))}
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
            <figure className="hv3-wolf"><img src="/assets/photos/wolf.jpg" alt="HuntsTAG wolf emblem" loading="lazy" decoding="async" /></figure>
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

      {/* 14. QUESTIONS */}
      {faqs && faqs.length > 0 && (
        <Band className="hv3-c hv3-tint" label="Frequently asked questions">
          <R><h2 className="hv3-h2">Questions, answered</h2></R>
          <div className="hv3-faq">
            {faqs.map((f, i) => (<FaqItem key={f._id || i} question={f.question} answer={f.answer} defaultOpen={i === 0} />))}
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
