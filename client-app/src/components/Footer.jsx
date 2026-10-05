import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

import { SITE } from '../siteConfig.js';
import { api } from '../api.js';
import { Download, Smartphone } from 'lucide-react';

const SUPPORT_EMAIL = 'info@huntsworld.com';

export default function Footer({ homeTheme }) {
  const footerRef = useRef(null);
  // App download buttons the admin set up (Admin > App Downloads). Empty until something is uploaded.
  const [apps, setApps] = useState({});
  useEffect(() => {
    let alive = true;
    api.getSiteSettings().then((s) => { if (alive && s && s.appDownloads) setApps(s.appDownloads); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const ctx = gsap.context(() => {
      const watermark = footer.querySelector('.site-footer-watermark');
      const brand = footer.querySelector('.site-footer-brand');
      const columns = footer.querySelectorAll('.site-footer-col');
      const links = footer.querySelectorAll('.site-footer-col a');
      const bottom = footer.querySelector('.site-footer-bottom');

      gsap.set(watermark, { opacity: 0, y: 52, scale: 0.9, letterSpacing: '0.06em' });
      gsap.set([brand, columns, bottom], { opacity: 0, y: 28 });
      gsap.set(links, { opacity: 0, x: -12 });

      gsap.timeline({
        scrollTrigger: { trigger: footer, start: 'top 88%', once: true },
        defaults: { ease: 'power3.out' },
      })
        .to(watermark, { opacity: 0.24, y: 0, scale: 1, letterSpacing: '-0.03em', duration: 1.05 })
        .to(brand, { opacity: 1, y: 0, duration: 0.58 }, '-=0.58')
        .to(columns, { opacity: 1, y: 0, duration: 0.58, stagger: 0.12 }, '-=0.46')
        .to(links, { opacity: 1, x: 0, duration: 0.38, stagger: 0.045 }, '-=0.36')
        .to(bottom, { opacity: 1, y: 0, duration: 0.5 }, '-=0.18');

    }, footer);

    return () => ctx.revert();
  }, []);

  return (
    <footer ref={footerRef} className={`site-footer${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}>
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <div className="brand" style={{ marginBottom: 10 }}>
            <div className="brand-mark" />
            <span className="brand-name">HuntsTAG</span>
          </div>
          <p className="site-footer-tagline">A smart card for a smarter first impression.</p>
          {SITE.phone && <span className="footer-business">Phone: {SITE.phone}</span>}
          {SITE.businessAddress && <span className="footer-business">{SITE.businessAddress}</span>}
          {SITE.gstNumber && <span className="footer-business">GSTIN: {SITE.gstNumber}</span>}
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Company</div>
          <Link to="/about">About Us</Link>
          <Link to="/huntsworld">What is HuntsWorld?</Link>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Explore</div>
          <Link to="/shop">Shop</Link>
          <Link to="/catalog">Catalog</Link>
          <Link to="/magic-art">Magic Poster</Link>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Support</div>
          <Link to="/faq">FAQ</Link>
          <Link to="/chat">Chat Support</Link>
          <Link to="/contact">Contact Us</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          {(
            <div className="site-footer-apps">
              <span className="site-footer-apps-title"><Smartphone size={14} aria-hidden="true" />Get the HuntsTAG app</span>
              <div className="site-footer-apps-row">
                {apps.googlePlay ? (
                  <a className="store-btn" href={apps.googlePlay.url} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3.6 2.2c-.3.3-.5.8-.5 1.4v16.8c0 .6.2 1.1.5 1.4l.1.1L13 12.5v-.2L3.7 2.1l-.1.1z" fill="#00d1ff"/><path d="M16.1 15.6 13 12.5v-.2l3.1-3.1.1.1 3.7 2.1c1 .6 1 1.6 0 2.2l-3.7 2.1-.1-.1z" fill="#ffc400"/><path d="M16.2 15.7 13 12.4 3.6 21.8c.4.4.9.4 1.6.1l11-6.2z" fill="#ff3a44"/><path d="M16.2 9.1 5.2 2.9c-.7-.4-1.2-.3-1.6.1l9.4 9.4 3.2-3.3z" fill="#00f076"/></svg>
                    <span><small>GET IT ON</small><b>Google Play</b></span>
                  </a>
                ) : (
                  <span className="store-btn is-soon" role="img" aria-label="Google Play, coming soon">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3.6 2.2c-.3.3-.5.8-.5 1.4v16.8c0 .6.2 1.1.5 1.4l.1.1L13 12.5v-.2L3.7 2.1l-.1.1z" fill="#00d1ff"/><path d="M16.1 15.6 13 12.5v-.2l3.1-3.1.1.1 3.7 2.1c1 .6 1 1.6 0 2.2l-3.7 2.1-.1-.1z" fill="#ffc400"/><path d="M16.2 15.7 13 12.4 3.6 21.8c.4.4.9.4 1.6.1l11-6.2z" fill="#ff3a44"/><path d="M16.2 9.1 5.2 2.9c-.7-.4-1.2-.3-1.6.1l9.4 9.4 3.2-3.3z" fill="#00f076"/></svg>
                    <span><small>Coming soon on</small><b>Google Play</b></span>
                  </span>
                )}
                {apps.ios && apps.ios.type === 'link' ? (
                  <a className="store-btn" href={apps.ios.url} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#fff" d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8c-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.800 2.500 3 2.500 1.200 0 1.700-.8 3.100-.8 1.500 0 1.900.8 3.200.8s2.100-1.200 2.900-2.300c.9-1.300 1.300-2.600 1.300-2.700 0 0-2.400-.9-2.400-3.700zM14 5.500c.7-.8 1.100-1.900 1-3-.9 0-2.100.6-2.800 1.400-.6.700-1.200 1.800-1 2.900 1 .1 2.100-.5 2.800-1.300z"/></svg>
                    <span><small>Download on the</small><b>App Store</b></span>
                  </a>
                ) : null}
                {!apps.ios ? (
                  <span className="store-btn is-soon" role="img" aria-label="App Store, coming soon">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#fff" d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8c-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.800 2.500 3 2.500 1.200 0 1.700-.8 3.100-.8 1.500 0 1.900.8 3.200.8s2.100-1.200 2.900-2.300c.9-1.300 1.300-2.600 1.300-2.700 0 0-2.400-.9-2.400-3.700zM14 5.500c.7-.8 1.100-1.900 1-3-.9 0-2.100.6-2.800 1.400-.6.700-1.200 1.800-1 2.900 1 .1 2.100-.5 2.800-1.300z"/></svg>
                    <span><small>Coming soon on the</small><b>App Store</b></span>
                  </span>
                ) : null}
                {apps.ios && apps.ios.type !== 'link' && (
                  <a className="store-btn" href={apps.ios.url} aria-label="Install on iPhone">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#fff" d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8c-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.800 2.500 3 2.500 1.200 0 1.700-.8 3.100-.8 1.500 0 1.900.8 3.200.8s2.100-1.200 2.900-2.300c.9-1.300 1.300-2.600 1.300-2.700 0 0-2.400-.9-2.400-3.700zM14 5.500c.7-.8 1.100-1.900 1-3-.9 0-2.100.6-2.800 1.400-.6.700-1.200 1.800-1 2.900 1 .1 2.100-.5 2.800-1.300z"/></svg>
                    <span><small>Install on</small><b>iPhone &amp; iPad</b></span>
                  </a>
                )}
                {apps.android && (
                  <a className="store-btn store-btn-apk" href={apps.android.url} download aria-label="Download the Android APK">
                    <Download size={22} aria-hidden="true" />
                    <span><small>Direct download</small><b>Android APK{apps.android.version ? ` v${apps.android.version}` : ''}</b></span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="site-footer-watermark-wrap" aria-hidden="true">
        <span className="site-footer-watermark">HuntsTAG</span>
      </div>

      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} HuntsTAG. All rights reserved.</span>
        <a href={`mailto:${SUPPORT_EMAIL}`}>Email us</a>
      </div>
    </footer>
  );
}
