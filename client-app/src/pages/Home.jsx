import { Link, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api, isLoggedIn } from '../api.js';
import WhyChooseHuntsworld from '../components/WhyChooseHuntsworld.jsx';
import TechGlobe from '../components/TechGlobe.jsx';
import { Nfc, UserRound, BookUser, QrCode, Lock, RefreshCw, Smartphone, Sparkles, ShieldCheck, Palette, Check } from 'lucide-react';
import { IlloChooseCard, IlloProfile, IlloTap, IlloUpdate, IlloLock, IlloDesign } from '../components/Illustrations.jsx';

gsap.registerPlugin(ScrollTrigger);

const SAMPLE_CARD_NAME = 'Alex Chen';
const SAMPLE_CARD_ROLE = 'Founder, Studio Nine';

const FEATURES = [
  {
    art: IlloTap,
    title: 'Tap to share instantly',
    desc: 'One tap on any phone opens your profile — no app required for the person receiving it. Save Contact works everywhere, natively.',
    // Same signal-arc + dot motif as the holo card mockup above -- this
    // literally is the gesture the whole product is built around.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 13a10 10 0 0 1 14 0" opacity="0.45" />
        <path d="M7.5 16.3a6.2 6.2 0 0 1 9 0" />
        <circle cx="12" cy="19.2" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    art: IlloUpdate,
    title: 'Update anytime, card never changes',
    desc: 'Your physical card only stores a link. Change your phone number or add a new social link from your dashboard — it reflects immediately, no reprinting.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11A8.1 8.1 0 0 0 6.3 6.3M4 4v5h5" />
        <path d="M4 13a8.1 8.1 0 0 0 13.7 4.7M20 20v-5h-5" />
      </svg>
    ),
  },
  {
    art: IlloLock,
    title: 'Locked against tampering',
    desc: 'Every card is password-protected at the chip level the moment it\'s made. Nobody can overwrite your card\'s link but us.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="9" rx="2.2" />
        <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      </svg>
    ),
  },
  {
    art: IlloDesign,
    title: 'Your page, your design',
    desc: 'Pick a banner design, add your photo and bio, and link out to Instagram, Twitter, your portfolio, and more.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a9 9 0 1 0 6.4 15.4c.7-.7.3-1.9-.6-2.1l-.9-.2c-1.2-.3-1.6-1.8-.7-2.6l.3-.3a2 2 0 0 0-1.4-3.4H13a2.2 2.2 0 0 1-1.9-3.3c.4-.7.1-1.6-.6-2A9 9 0 0 0 12 3Z" />
        <circle cx="7.8" cy="11" r="1" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="7.3" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

const STEPS = [
  { art: IlloChooseCard, title: 'Choose your card', desc: 'Pick a tier that fits — Basic to Apex.' },
  { art: IlloProfile, title: 'Set up your profile', desc: 'Add your photo, links, and details in minutes.' },
  { art: IlloTap, title: 'Tap to connect', desc: 'Hand someone your card, they tap, done.' },
];

// Counts up when it scrolls into view (and again each time it re-enters), so
// the numbers visibly "run" in real time instead of sitting static.
// `from` > `target` makes it count down (used for "Zero" battery).
function CountUp({ target, suffix = '', from = 0, finalText }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const isDecimal = target % 1 !== 0;
    const duration = 1800;
    let raf;
    function run() {
      cancelAnimationFrame(raf);
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = from + (target - from) * eased;
        if (progress >= 1 && finalText) el.textContent = finalText;
        else el.textContent = (isDecimal ? value.toFixed(2) : Math.round(value)) + suffix;
        if (progress < 1) raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }
    run();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && run()), { threshold: 0.6 });
    io.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [target, suffix, from, finalText]);
  return <span ref={ref}>{from}{suffix}</span>;
}

const BENEFITS = [
  { Icon: Nfc, title: 'Tap to share', text: 'One tap opens your full profile on any phone.' },
  { Icon: QrCode, title: 'QR code backup', text: 'Every card also carries a QR code that opens the same page.' },
  { Icon: RefreshCw, title: 'Update anytime', text: 'Change your details online; the card never needs reprinting.' },
  { Icon: Lock, title: 'Password-locked chip', text: 'Nobody can overwrite your card link but us.' },
  { Icon: Smartphone, title: 'No app needed', text: 'The person you meet installs nothing.' },
  { Icon: Palette, title: 'Your own design', text: 'Pick a banner, add your photo, bio and social links.' },
];

const FLOW_CHECKS = ['Tap the card on any phone', 'Your profile opens instantly', 'They save your contact in one tap'];

function TapFlow() {
  return (
    <svg className="pro-flow-svg" viewBox="0 0 640 360" fill="none" aria-hidden="true" focusable="false">
      <rect x="20" y="40" width="280" height="280" rx="40" fill="#e3f2fd" />
      <g className="tf-card">
        <rect x="60" y="150" width="190" height="120" rx="16" fill="#0d47a1" />
        <rect x="80" y="170" width="38" height="30" rx="7" fill="#90caf9" />
        <rect x="80" y="230" width="90" height="9" rx="4.5" fill="#fff" opacity=".85" />
        <rect x="80" y="246" width="56" height="7" rx="3.5" fill="#fff" opacity=".45" />
        <path d="M205 176a22 22 0 0 1 32 0M212 188a12 12 0 0 1 18 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="221" cy="199" r="3" fill="#fff" />
      </g>
      <g className="tf-waves" stroke="#2196f3" strokeWidth="4" strokeLinecap="round">
        <path d="M318 150c20 12 20 48 0 60" /><path d="M338 130c32 22 32 78 0 100" opacity=".6" /><path d="M358 110c44 32 44 108 0 140" opacity=".3" />
      </g>
      <g className="tf-phone">
        <rect x="400" y="30" width="190" height="300" rx="34" fill="#0a2540" />
        <rect x="410" y="40" width="170" height="280" rx="26" fill="#fff" />
        <rect x="465" y="48" width="60" height="9" rx="4.5" fill="#0a2540" />
        <circle cx="495" cy="112" r="30" fill="#90caf9" /><circle cx="495" cy="104" r="10" fill="#0d47a1" /><path d="M478 124a17 13 0 0 1 34 0" fill="#0d47a1" />
        <rect x="448" y="158" width="94" height="11" rx="5.5" fill="#0a2540" /><rect x="462" y="176" width="66" height="8" rx="4" fill="#0a2540" opacity=".35" />
        <rect x="430" y="204" width="130" height="38" rx="12" fill="#2196f3" /><rect x="430" y="252" width="130" height="38" rx="12" fill="#e3f2fd" stroke="#90caf9" strokeWidth="2" />
        <path d="M473 223l8 8 17-17" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="tf-check" />
      </g>
      <circle cx="590" cy="60" r="7" fill="#2196f3" className="tf-dot" /><circle cx="40" cy="40" r="5" fill="#90caf9" className="tf-dot" />
    </svg>
  );
}

const CAPABILITIES = [
  'Tap to share', 'QR code backup', 'Augmented reality', 'Update anytime', 'Password-locked chip',
  'No app needed', 'Save contact', 'Magic Poster', 'Public profile page', 'Order tracking',
];

function HomeFaqItem({ question, answer, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`pro-faq-item${open ? ' is-open' : ''}`}>
      <button type="button" className="pro-faq-q" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{question}</span>
        <span className="pro-faq-icon" aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      {open && <p className="pro-faq-a">{answer}</p>}
    </div>
  );
}

const PLAN_FALLBACK_IMAGES = ['/assets/photos/card-black.jpg', '/assets/photos/card-art.jpg', '/assets/photos/card-orange.jpg', '/assets/photos/card-teal.jpg'];

export default function Home() {
  const [faqs, setFaqs] = useState(null);
  const [plans, setPlans] = useState(null);
  const [posters, setPosters] = useState([]);
  useEffect(() => {
    api.getPublicMagicArt().then((list) => setPosters(Array.isArray(list) ? list.filter((p) => p.imageUrl) : [])).catch(() => setPosters([]));
  }, []);
  useEffect(() => {
    api.listPlans().then((list) => setPlans(Array.isArray(list) ? list.slice(0, 4) : [])).catch(() => setPlans([]));
  }, []);
  useEffect(() => {
    api.getPublicFaq().then((list) => setFaqs(Array.isArray(list) ? list.slice(0, 6) : [])).catch(() => setFaqs([]));
  }, []);
  // The hero card shows whoever is actually logged in -- makes the
  // signature visual feel like your own card, not a stock demo, the
  // moment you're signed in. Logged-out visitors see a sample name.
  const [cardName, setCardName] = useState(SAMPLE_CARD_NAME);
  const [cardRole, setCardRole] = useState(SAMPLE_CARD_ROLE);
  const location = useLocation();
  const homeRef = useRef(null);
  const heroRef = useRef(null);
  const stageRef = useRef(null);
  const cardRef = useRef(null);
  const glitchRef = useRef(null);
  const spotlightRef = useRef(null);
  const orbitContainerRef = useRef(null);
  const featuresRef = useRef(null);
  const howItWorksRef = useRef(null);
  const whyRef = useRef(null);

  // Re-runs on every navigation to this page (location.key), not just
  // first mount -- logging in/out from the modal navigates back to '/'
  // without remounting Home, so a mount-only effect would leave the card
  // stuck showing whoever (or the sample) was there before that.
  useEffect(() => {
    if (!isLoggedIn()) {
      setCardName(SAMPLE_CARD_NAME);
      setCardRole(SAMPLE_CARD_ROLE);
      return;
    }
    api
      .getProfile()
      .then((p) => {
        setCardName(p.fullName || SAMPLE_CARD_NAME);
        setCardRole(p.jobTitle || SAMPLE_CARD_ROLE);
      })
      .catch(() => {
        setCardName(SAMPLE_CARD_NAME);
        setCardRole(SAMPLE_CARD_ROLE);
      });
  }, [location.key]);

  // Cursor spotlight -- soft glow that follows the mouse across the
  // whole hero, lighting up the circuit-dot grid as it passes.
  useEffect(() => {
    function handleMove(e) {
      const el = spotlightRef.current;
      if (!el) return;
      const rect = heroRef.current.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', xPct + '%');
      el.style.setProperty('--my', yPct + '%');
    }
    const hero = heroRef.current;
    hero?.addEventListener('mousemove', handleMove);
    return () => hero?.removeEventListener('mousemove', handleMove);
  }, []);

  // Card tilt + holographic foil shift -- the card tilts toward the
  // cursor in real 3D, and the rainbow foil layer's position shifts with
  // it too, same principle as a real security hologram: the color you
  // see depends on the viewing angle. A slow idle drift keeps the foil
  // alive even when nobody's hovering.
  useEffect(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    if (!stage || !card) return;
    let hovering = false;
    let idleAngle = 0;
    let raf;

    function handleMove(e) {
      hovering = true;
      const rect = card.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      card.style.setProperty('--tilt-y', (relX - 0.5) * 20 + 'deg');
      card.style.setProperty('--tilt-x', (relY - 0.5) * -14 + 'deg');
      card.style.setProperty('--holo-x', relX * 100 + '%');
      card.style.setProperty('--holo-y', relY * 100 + '%');
      card.style.setProperty('--mx', relX * 100 + '%');
      card.style.setProperty('--my', relY * 100 + '%');
    }
    function handleLeave() {
      hovering = false;
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--tilt-x', '0deg');
    }
    function idleDrift() {
      if (!hovering) {
        idleAngle += 0.4;
        card.style.setProperty('--holo-x', 50 + Math.sin(idleAngle * 0.02) * 30 + '%');
        card.style.setProperty('--holo-y', 50 + Math.cos(idleAngle * 0.017) * 30 + '%');
      }
      raf = requestAnimationFrame(idleDrift);
    }
    raf = requestAnimationFrame(idleDrift);

    stage.addEventListener('mousemove', handleMove);
    stage.addEventListener('mouseleave', handleLeave);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener('mousemove', handleMove);
      stage.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  // Orbit particles -- glowing motes swirling around the card in
  // elliptical paths, some passing behind it (smaller, dimmer, blurred)
  // and some in front (crisp, bright), for real depth instead of a flat
  // background layer.
  useEffect(() => {
    const container = orbitContainerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    const colors = ['var(--holo-cyan)', 'var(--holo-violet)', 'var(--holo-magenta)', '#bff5ec'];
    const particles = [];
    const count = 22;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      const isFront = Math.random() > 0.5;
      el.className = 'orbit-particle ' + (isFront ? 'front' : 'behind');
      const size = 2 + Math.random() * 2.6;
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      const color = colors[Math.floor(Math.random() * colors.length)];
      el.style.background = color;
      container.appendChild(el);
      particles.push({
        el,
        angle: Math.random() * Math.PI * 2,
        speed: (0.15 + Math.random() * 0.35) * (Math.random() > 0.5 ? 1 : -1),
        radiusX: 130 + Math.random() * 95,
        radiusY: 48 + Math.random() * 42,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
        color,
      });
    }

    let raf;
    function animate() {
      const rect = stage.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      particles.forEach((p) => {
        p.angle += p.speed * 0.01;
        p.wobble += p.wobbleSpeed;
        const x = cx + Math.cos(p.angle) * p.radiusX;
        const y = cy + Math.sin(p.angle) * p.radiusY + Math.sin(p.wobble) * 6;
        const depthPhase = Math.sin(p.angle);
        const isBehindNow = depthPhase < 0;
        const depthScale = 0.6 + ((depthPhase + 1) / 2) * 0.7;
        const opacity = isBehindNow ? 0.3 + (depthPhase + 1) * 0.2 : 0.7 + depthPhase * 0.3;
        p.el.style.transform = `translate(${x}px, ${y}px) scale(${depthScale})`;
        p.el.style.opacity = opacity;
        p.el.style.boxShadow = isBehindNow ? `0 0 3px 1px ${p.color}` : `0 0 8px 2px ${p.color}`;
        p.el.style.filter = isBehindNow ? 'blur(0.5px)' : 'none';
      });
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      particles.forEach((p) => p.el.remove());
    };
  }, []);

  useEffect(() => {
    let timeoutId;
    function pulse() {
      glitchRef.current?.classList.add('glitching');
      setTimeout(() => glitchRef.current?.classList.remove('glitching'), 180);
      timeoutId = setTimeout(pulse, 3200 + Math.random() * 2600);
    }
    timeoutId = setTimeout(pulse, 1800);
    return () => clearTimeout(timeoutId);
  }, []);

  // One GSAP context owns every homepage sequence, which makes cleanup
  // reliable when React changes routes. Each section gets its own
  // ScrollTrigger timeline while the hero plays immediately on entry.
  useLayoutEffect(() => {
    const root = homeRef.current;
    if (!root) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    const ctx = gsap.context(() => {
      const heroText = gsap.utils.toArray('.hero-col-text > *');
      const heroVisual = root.querySelector('.hero-visual');
      const rings = heroRef.current?.querySelectorAll('.bg-ring');

      gsap.set(heroText, { opacity: 0, y: 30 });
      gsap.set(heroVisual, { opacity: 0, x: 54, scale: 0.88, rotate: 3 });
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .to(heroText, { opacity: 1, y: 0, duration: 0.72, stagger: 0.09 })
        .to(heroVisual, { opacity: 1, x: 0, scale: 1, rotate: 0, duration: 0.95, ease: 'back.out(1.35)' }, '-=0.58');

      // Slow ambient movement keeps the signature card area alive without
      // interfering with the card's own pointer-driven 3D tilt.
      gsap.to(heroVisual, { y: -9, duration: 3.1, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 });
      if (rings?.length) {
        gsap.to(rings[0], { rotate: 28, duration: 18, repeat: -1, ease: 'none' });
        gsap.to(rings[1], { rotate: -24, duration: 22, repeat: -1, ease: 'none' });
      }

      const featureCards = featuresRef.current?.querySelectorAll('.feature-card');
      const featureIcons = featuresRef.current?.querySelectorAll('.feature-icon');
      gsap.set(featureCards, { opacity: 0, y: 54, rotateX: -8, transformOrigin: '50% 100%' });
      gsap.timeline({
        scrollTrigger: { trigger: featuresRef.current, start: 'top 82%', once: true },
        defaults: { ease: 'power3.out' },
      })
        .to(featureCards, { opacity: 1, y: 0, rotateX: 0, duration: 0.72, stagger: 0.11 })
        .fromTo(featureIcons, { scale: 0.55, rotate: -14 }, { scale: 1, rotate: 0, duration: 0.52, stagger: 0.1, ease: 'back.out(2)' }, '-=0.48');

      const howSection = howItWorksRef.current;
      const howHeading = howSection?.querySelector('.section-heading');
      const howSubheading = howSection?.querySelector('.section-subheading');
      const steps = howSection?.querySelectorAll('.step-item');
      const stepNumbers = howSection?.querySelectorAll('.step-number');
      const cta = howSection?.querySelector('.how-it-works-cta');
      gsap.set([howHeading, howSubheading, cta], { opacity: 0, y: 30 });
      gsap.set(steps, { opacity: 0, y: 44, scale: 0.9 });
      gsap.timeline({
        scrollTrigger: { trigger: howSection, start: 'top 78%', once: true },
        defaults: { ease: 'power3.out' },
      })
        .to(howHeading, { opacity: 1, y: 0, duration: 0.62 })
        .to(howSubheading, { opacity: 1, y: 0, duration: 0.48 }, '-=0.34')
        .to(steps, { opacity: 1, y: 0, scale: 1, duration: 0.66, ease: 'back.out(1.55)', stagger: 0.14 }, '-=0.18')
        .fromTo(stepNumbers, { rotate: -35, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.5, stagger: 0.13, ease: 'back.out(2)' }, '-=0.58')
        .to(cta, { opacity: 1, y: 0, duration: 0.5 }, '-=0.2');

      const whySection = whyRef.current;
      const whyHeading = whySection?.querySelector('.section-heading');
      const whyIntro = whySection?.querySelector('.why-huntsworld-intro');
      const whySubheading = whySection?.querySelector('.why-huntsworld-sub');
      const whyCards = whySection?.querySelectorAll('.feature-card');
      const whyIcons = whySection?.querySelectorAll('.feature-icon');
      gsap.set([whyHeading, whyIntro, whySubheading], { opacity: 0, y: 32 });
      gsap.set(whyCards, { opacity: 0, y: 46, scale: 0.94 });
      gsap.timeline({
        scrollTrigger: { trigger: whySection, start: 'top 76%', once: true },
        defaults: { ease: 'power3.out' },
      })
        .to(whyHeading, { opacity: 1, y: 0, duration: 0.62 })
        .to(whyIntro, { opacity: 1, y: 0, duration: 0.52 }, '-=0.34')
        .to(whySubheading, { opacity: 1, y: 0, duration: 0.5 }, '-=0.2')
        .to(whyCards, { opacity: 1, y: 0, scale: 1, duration: 0.68, stagger: 0.13 }, '-=0.2')
        .fromTo(whyIcons, { scale: 0.5, rotate: 12 }, { scale: 1, rotate: 0, duration: 0.52, stagger: 0.12, ease: 'back.out(2)' }, '-=0.55');

      ScrollTrigger.refresh();
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div className="home-motion" ref={homeRef}>
      <div className="hero-section hero-section-split" ref={heroRef}>
        <TechGlobe />
        <div className="hero-spotlight" ref={spotlightRef} aria-hidden="true" />
        <div className="hero-scanline" aria-hidden="true" />

        <div className="hero-col-text">
          <span className="hero-eyebrow">NFC &middot; NTAG216 &middot; Password-locked</span>
          <h1>
            Your identity,<br />
            <span className="grad glitch-text" ref={glitchRef} data-text="broadcast on tap.">
              broadcast on tap.
            </span>
          </h1>
          <p>
            One tap transmits your full profile over near-field induction — no app on their end, no
            battery, no signal drop. Update your details anytime; every card in the world reflects it
            instantly, without a reprint.
          </p>
          <div className="hero-cta-row">
            <Link to="/shop" className="btn-primary">
              Shop Cards
            </Link>
            <Link to="/contact" className="btn-secondary">
              Contact Us
            </Link>
          </div>
        </div>

        <div className="hero-card-stage" aria-label="Interactive HuntsTAG card preview">
          <div className="hero-visual" ref={stageRef}>
            <div className="bg-ring bg-ring-a" />
            <div className="bg-ring bg-ring-b" />
            <div className="tap-ring r1" />
            <div className="tap-ring r2" />
            <div className="tap-ring r3" />
            <div className="orbit-particle-layer" ref={orbitContainerRef} />
            <div className="holo-card" ref={cardRef}>
              <div className="holo-layer" />
              <div className="holo-grating" />
              <div className="holo-specular" />
              <div className="holo-card-content">
                <div className="holo-card-top">
                  <span className="holo-chip" />
                  <svg className="holo-card-wave" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M6 14a8 8 0 0 1 12 0" opacity="0.9" />
                    <path d="M8.5 17a4.5 4.5 0 0 1 7 0" />
                    <circle cx="12" cy="20" r="1.2" fill="#fff" stroke="none" />
                  </svg>
                </div>
                <div>
                  <div className="holo-card-name">{cardName}</div>
                  <div className="holo-card-role">{cardRole}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-live-stats" aria-label="HuntsTAG at a glance">
            <span className="hero-live-badge"><i /> LIVE SPECS</span>
            <div className="hero-live-row">
              <div><b><CountUp target={13.56} suffix=" MHz" /></b><span>NFC frequency</span></div>
              <div><b><CountUp target={888} suffix=" bytes" /></b><span>NDEF capacity</span></div>
              <div><b><CountUp target={0} from={99} finalText="Zero" /></b><span>Battery required</span></div>
            </div>
          </div>
        </div>

      </div>

      <section className="home-poster" aria-label="NFC smart business card">
        <img
          src="/assets/photos/nfc-smart-business-card-poster.png"
          alt="NFC Smart Business Card — Tap. Connect. Grow. NFC tap, save contact, social links and website."
          loading="lazy"
          decoding="async"
        />
      </section>

      <section className="pro-flow" aria-label="How a tap works">
        <div className="pro-flow-text">
          <h2 className="section-heading">One tap. Everything shared.</h2>
          <ul className="pro-checks">
            {FLOW_CHECKS.map((t) => (<li key={t}><span className="pro-check"><Check size={16} strokeWidth={3} /></span>{t}</li>))}
          </ul>
          <Link to="/shop" className="btn-primary">Get your card</Link>
        </div>
        <TapFlow />
      </section>

      <section className="pro-marquee" aria-label="What is included">
        <div className="pro-marquee-track">
          {[...CAPABILITIES, ...CAPABILITIES].map((c, i) => (
            <span className="pro-chip" key={c + i} aria-hidden={i >= CAPABILITIES.length ? 'true' : undefined}>{c}</span>
          ))}
        </div>
      </section>

      {plans && plans.length > 0 && (
        <section className="pro-plans" aria-label="Our cards">
          <div className="pro-plans-head">
            <h2 className="section-heading">Pick the card that fits you</h2>
            <p className="section-subheading">Every card comes with your own profile page, QR backup and lifetime updates.</p>
          </div>
          <div className="pro-plans-grid">
            {plans.map((p, i) => {
              const v = p.variants && p.variants[0];
              const img = (v && v.frontImageUrl) || (p.images && p.images[0]) || PLAN_FALLBACK_IMAGES[i % PLAN_FALLBACK_IMAGES.length];
              return (
                <Link to={`/shop?plan=${p.key}`} className={`pro-plan pro-plan-${i % 4}`} key={p._id || p.key}>
                  <div className="pro-plan-media"><img src={img} alt={p.name} loading="lazy" onError={(e) => { e.currentTarget.src = PLAN_FALLBACK_IMAGES[i % PLAN_FALLBACK_IMAGES.length]; }} /></div>
                  <div className="pro-plan-body">
                    <h3>{p.name}</h3>
                    {(p.priceAmount || p.price) ? <span className="pro-plan-price">₹{p.priceAmount || p.price}</span> : null}
                    <span className="pro-plan-cta">View card →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="pro-video" aria-label="See it in action">
        <div className="pro-video-text">
          <span className="hero-eyebrow">See it in motion</span>
          <h2 className="section-heading">A card actually being tapped</h2>
          <p>Watch how a HuntsTAG card opens a full profile in a second, with nothing to install.</p>
          <Link to="/catalog" className="pro-link">Browse the catalog →</Link>
        </div>
        <div className="pro-video-frame">
          <video src="/assets/photos/tap-demo.mp4" autoPlay muted loop playsInline preload="metadata" poster="/assets/photos/card-teal.jpg" />
        </div>
      </section>

      <section className="pro-benefits" aria-label="Why HuntsTAG">
        <h2 className="section-heading">Everything your card does</h2>
        <div className="pro-benefit-grid">
          {BENEFITS.map(({ Icon, title, text }) => (
            <div className="pro-benefit" key={title}>
              <span className="pro-benefit-icon"><Icon size={26} strokeWidth={1.8} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-features-section home-magic" ref={featuresRef} aria-label="Magic Poster">
        <div className="home-magic-panel">
          <div className="home-magic-copy">
            <span className="home-magic-eyebrow">Magic Poster</span>
            <h2>Posters that<br />play video when<br />you scan them.</h2>
            <p>
              Alongside smart cards, HuntsTAG makes Magic Posters — printed artwork that turns into a video the moment
              someone points their phone at it. No app to install, no login, just open Magic Camera and watch the print
              come alive.
            </p>
            <ol className="home-magic-steps">
              <li><span>1</span><div><b>Pick a poster</b><small>Browse the gallery and order the ones you love.</small></div></li>
              <li><span>2</span><div><b>Point Magic Camera at it</b><small>Works on any phone, straight from the browser.</small></div></li>
              <li><span>3</span><div><b>Watch it come alive</b><small>The video plays right on top of the artwork.</small></div></li>
            </ol>
            <div className="home-magic-cta">
              <Link to="/magic-art" className="home-magic-btn primary">Shop Magic Posters →</Link>
              <Link to="/magic-camera" className="home-magic-btn ghost">Try Magic Camera</Link>
            </div>
          </div>

          <div className="home-magic-visual" aria-hidden={posters.length === 0 ? 'true' : undefined}>
            {(posters.length ? posters.slice(0, 3) : [null, null, null]).map((poster, i) => (
              <div className={`home-magic-poster p${i}`} key={poster?._id || i}>
                {poster ? <img src={poster.imageUrl} alt={poster.name || 'Magic Poster'} loading="lazy" /> : <div className="home-magic-poster-empty" />}
                {i === 0 && (
                  <span className="home-magic-play">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5-12-7.5Z" /></svg>
                    Plays a video
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="home-magic-links">
          <Link to="/magic-art" className="home-magic-link">
            <span className="home-magic-link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            </span>
            <span><b>Magic Posters</b><small>See every poster and add them to your cart</small></span>
            <i>→</i>
          </Link>
          <Link to="/shop" className="home-magic-link">
            <span className="home-magic-link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /></svg>
            </span>
            <span><b>Smart cards</b><small>Pick your NFC card plan in the shop</small></span>
            <i>→</i>
          </Link>
        </div>
      </section>

      <div ref={howItWorksRef}>
        <h2 className="section-heading">How it works</h2>
        <p className="section-subheading">From order to first tap in three steps.</p>
        <div className="steps-row">
          {STEPS.map((s, i) => (
            <div className="step-item" key={s.title}>
              <div className="av-step-art"><s.art /></div>
              <div className="step-number">{i + 1}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="how-it-works-cta" style={{ textAlign: 'center', marginTop: 48 }}>
          <Link
            to="/shop"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              borderRadius: 999,
              background: 'var(--holo-gradient)',
              color: '#06120f',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Browse card plans
          </Link>
        </div>
      </div>

      <WhyChooseHuntsworld animateWithGsap sectionRef={whyRef} />

      {faqs && faqs.length > 0 && (
        <section className="pro-faq" aria-label="Frequently asked questions">
          <div className="pro-faq-head">
            <h2 className="section-heading">Frequently asked questions</h2>
            <p className="section-subheading">Everything about your card, in one place.</p>
            <Link to="/faq" className="pro-link">See all questions →</Link>
          </div>
          <div className="pro-faq-list">
            {faqs.map((item, i) => (
              <HomeFaqItem key={item._id || i} question={item.question} answer={item.answer} defaultOpen={i === 0} />
            ))}
          </div>
        </section>
      )}

      <section className="pro-final">
        <h2 className="section-heading">Need something custom for your business?</h2>
        <p>Bulk cards for your team, your own card artwork, branded Magic Posters or a special order — tell us what you need and we will shape it with you.</p>
        <div className="pro-final-chips">
          <span>Bulk &amp; team orders</span>
          <span>Custom card design</span>
          <span>Branded Magic Posters</span>
        </div>
        <div className="hero-cta-row">
          <Link to="/contact" className="btn-primary">Contact us</Link>
          <Link to="/chat" className="btn-secondary">Chat with support</Link>
        </div>
      </section>
    </div>
  );
}
