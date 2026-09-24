import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const SUPPORT_EMAIL = 'info@huntsworld.com';

export default function Footer({ homeTheme }) {
  const footerRef = useRef(null);

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

      gsap.to(watermark, {
        backgroundPosition: '100% 50%',
        duration: 5,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    }, footer);

    return () => ctx.revert();
  }, []);

  return (
    <footer ref={footerRef} className={`site-footer${homeTheme === 'orange' ? ' theme-orange' : homeTheme === 'cyber' ? ' theme-cyber' : ''}`}>
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
