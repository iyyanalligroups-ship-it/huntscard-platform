import { Link } from 'react-router-dom';

const FEATURES = [
  {
    title: 'NFC Tap Technology',
    desc: 'Just tap your huntsTAG on any NFC enabled smartphone and your complete profile transfers instantly. No app required. No WiFi needed. Just tap and connect.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 13a10 10 0 0 1 14 0" opacity="0.45" />
        <path d="M7.5 16.3a6.2 6.2 0 0 1 9 0" />
        <circle cx="12" cy="19.2" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: 'Phone to Phone Sync',
    desc: 'Share your information directly from phone to phone in seconds. Fast, smooth and completely wireless -- networking has never been this effortless.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="16" rx="1.5" />
        <rect x="14" y="4" width="7" height="16" rx="1.5" />
        <path d="M10 12h4" />
        <path d="M12.5 9.5 15 12l-2.5 2.5" />
      </svg>
    ),
  },
  {
    title: 'Augmented Reality',
    desc: 'Experience networking like never before. huntsTAG brings your profile to life through stunning Augmented Reality -- making you unforgettable in every meeting and event.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
        <path d="M3 8.5V16l9 4.5 9-4.5V8.5" />
        <path d="M12 13v7.5" />
      </svg>
    ),
  },
  {
    title: 'QR Scanner',
    desc: 'Not every phone supports NFC? No problem. Every huntsTAG comes with a built-in QR code -- scan and connect in an instant from any smartphone.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" />
      </svg>
    ),
  },
];

export default function AboutUs() {
  return (
    <div>
      <span className="hero-eyebrow" style={{ display: 'block', marginBottom: 8 }}>huntsTAG</span>
      <h1 className="section-heading" style={{ marginTop: 0 }}>
        The Future of Networking is Here.
        <br />
        <span className="grad">One Tap. Infinite Connections.</span>
      </h1>
      <p className="section-subheading">
        huntsTAG is a next generation smart business card powered by NFC technology -- designed to replace
        traditional visiting cards with a seamless, futuristic and powerful networking experience.
      </p>

      <div className="checkout-panel" style={{ maxWidth: 720 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>What is huntsTAG</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 10 }}>
            In a world that moves at the speed of technology, your business card should too. huntsTAG is a
            revolutionary smart card that connects people instantly with just a single tap. No more paper
            cards. No more manual typing. No more lost contacts.
          </p>
          <p className="shop-plan-desc" style={{ marginBottom: 10 }}>
            Simply tap your huntsTAG card on any smartphone and share your complete business profile,
            portfolio, social media, contact details and more -- instantly, effortlessly and unforgettably.
          </p>
          <p className="shop-plan-desc" style={{ marginBottom: 0, fontWeight: 600 }}>
            huntsTAG is not just a card. It is your digital identity.
          </p>
        </div>
      </div>

      <h2 className="section-heading">Key Features</h2>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="checkout-panel" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="card">
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Get in touch</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 14 }}>
            Questions about a plan, an order, or anything else -- we'd like to hear from you.
          </p>
          <Link to="/contact" className="link-out">Contact us →</Link>
        </div>
      </div>
    </div>
  );
}
