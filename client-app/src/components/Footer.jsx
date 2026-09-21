import { Link } from 'react-router-dom';

const SUPPORT_EMAIL = 'info@huntsworld.com';

export default function Footer({ homeTheme }) {
  return (
    <footer className={`site-footer${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}>
      <div className="site-footer-watermark-wrap" aria-hidden="true">
        <span className="site-footer-watermark">HuntsTAG</span>
      </div>
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <div className="brand" style={{ marginBottom: 10 }}>
            <div className="brand-mark" />
            <span className="brand-name">HuntsTAG</span>
          </div>
          <p className="site-footer-tagline">A smart card for a smarter first impression.</p>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Company</div>
          <Link to="/about">About Us</Link>
          <Link to="/huntsworld">What is HuntsWorld?</Link>
          <Link to="/catalog">Catalog</Link>
          <Link to="/shop">Shop</Link>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Support</div>
          <Link to="/faq">FAQ</Link>
          <Link to="/chat">Chat Support</Link>
          <Link to="/contact">Contact Us</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} HuntsTAG. All rights reserved.</span>
      </div>
    </footer>
  );
}
