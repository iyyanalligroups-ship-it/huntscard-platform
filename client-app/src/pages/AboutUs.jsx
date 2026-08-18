import { Link } from 'react-router-dom';

// Starter copy -- placeholder marketing content, not sourced from any
// official "About Us" brief. Meant to be edited once real copy exists,
// not treated as final.
export default function AboutUs() {
  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>About HuntsTAG</h1>
      <p className="section-subheading">A smarter way to hand someone your details.</p>

      <div className="checkout-panel" style={{ maxWidth: 640 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Who we are</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 0 }}>
            HuntsTAG is built by Iyyanalli Groups, based in Puducherry, India. We make NFC smart
            cards that replace the paper business card with a single tap — no app required on the
            other person's phone.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>What we do</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 0 }}>
            Every HuntsTAG card carries your profile, contact details, and links — tap it against
            any NFC-ready phone, or scan the QR code, and it opens instantly. Beyond the basics, we
            build in extras like AR-powered cards, a Zing feature, and an optional link out to your
            listing on HuntsWorld.
          </p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Get in touch</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 14 }}>
            Questions about a plan, an order, or anything else — we'd like to hear from you.
          </p>
          <Link to="/contact" className="link-out">Contact us →</Link>
        </div>
      </div>
    </div>
  );
}
