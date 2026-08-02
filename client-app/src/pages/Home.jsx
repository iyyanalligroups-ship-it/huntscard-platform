import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api, isLoggedIn } from '../api.js';

const FEATURES = [
  {
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
  { title: 'Choose your card', desc: 'Pick a tier that fits — Basic to Apex.' },
  { title: 'Set up your profile', desc: 'Add your photo, links, and details in minutes.' },
  { title: 'Tap to connect', desc: 'Hand someone your card, they tap, done.' },
];

function CountUp({ target, suffix = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isDecimal = target % 1 !== 0;
    const duration = 1400;
    const start = performance.now();
    let raf;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      el.textContent = (isDecimal ? value.toFixed(2) : Math.round(value)) + suffix;
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

export default function Home() {
  // The hero card shows whoever is actually logged in -- makes the
  // signature visual feel like your own card, not a stock demo, the
  // moment you're signed in. Logged-out visitors see a sample name.
  const [cardName, setCardName] = useState('Alex Chen');
  const [cardRole, setCardRole] = useState('Founder, Studio Nine');
  const heroRef = useRef(null);
  const stageRef = useRef(null);
  const cardRef = useRef(null);
  const glitchRef = useRef(null);
  const spotlightRef = useRef(null);
  const orbitContainerRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn()) return;
    api
      .getProfile()
      .then((p) => {
        if (p.fullName) setCardName(p.fullName);
        if (p.jobTitle) setCardRole(p.jobTitle);
      })
      .catch(() => {}); // not logged in / expired session -- keep the sample name
  }, []);

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

  return (
    <div>
      <div className="hero-section hero-section-split" ref={heroRef}>
        <div className="circuit-grid" aria-hidden="true" />
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
          <div className="hero-cta-row" style={{ justifyContent: 'flex-start' }}>
            <Link to="/shop" className="btn-primary" style={{ background: 'var(--holo-gradient)', color: '#06120f' }}>
              Shop Cards
            </Link>
            <Link to="/contact" className="btn-secondary" style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--panel-border)' }}>
              Contact Us
            </Link>
          </div>
          <div className="hero-spec-row" style={{ justifyContent: 'flex-start' }}>
            <div><b><CountUp target={13.56} suffix=" MHz" /></b><span>NFC frequency</span></div>
            <div><b><CountUp target={888} suffix=" bytes" /></b><span>NDEF capacity</span></div>
            <div><b>Zero</b><span>battery required</span></div>
          </div>
        </div>

        {/* Signature visual: the tap card itself, mid-tap -- a real
            holographic-foil surface that shifts color with the cursor
            (same principle as tilting a real security hologram), with
            energy motes orbiting it and induction rings representing
            the NFC handshake. Shows whoever's actually signed in. */}
        <div className="hero-visual" ref={stageRef} aria-hidden="true">
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
      </div>

      <div className="feature-grid">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="section-heading">How it works</h2>
      <p className="section-subheading">From order to first tap in three steps.</p>
      <div className="steps-row">
        {STEPS.map((s, i) => (
          <div className="step-item" key={s.title}>
            <div className="step-number">{i + 1}</div>
            <h4>{s.title}</h4>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 48 }}>
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
  );
}
