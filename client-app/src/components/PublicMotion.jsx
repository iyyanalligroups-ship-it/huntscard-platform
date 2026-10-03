import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// GSAP motion for the public site (everything inside .sh-theme). Mounted once in PublicLayout.
//   1. text:    headings slide up out of a mask, sub-text fades up, as they scroll into view
//   2. scroll:  cards / steps / panels rise in; the hero globe and the sample card drift (parallax)
//   3. buttons: the main call-to-action buttons are magnetic (pulled toward the cursor), with a
//               soft press squeeze; their gradient shimmer is pure CSS (see sh-theme.css)
// Home.jsx already owns its own intro/scroll timelines, so the generic reveals skip anything inside
// .home-motion. React owns the DOM, so nothing here edits element children -- it only animates
// transforms/opacity/clip-path on the elements themselves, and a MutationObserver picks up
// content that renders after a fetch.
const TEXT_SEL = '.public-page-shell :is(h1, h2, .section-heading):not(.home-motion *)';
const SUB_SEL = '.public-page-shell :is(.section-subheading, .subtitle, .hero-sub):not(.home-motion *)';
const BLOCK_SEL = '.public-page-shell :is(.card, .plan-variant-card, .feature-card, .step-item, .request-row-wrap, .faq-item):not(.home-motion *)';
const MAGNETIC_SEL = '.btn-primary, .btn-secondary, .public-account-action, .how-it-works-cta a';

export default function PublicMotion() {
  const location = useLocation();

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;

    const ctx = gsap.context(() => {
      function arm(root) {
        const scope = root || document;
        const text = scope.querySelectorAll ? [...scope.querySelectorAll(TEXT_SEL)] : [];
        const subs = scope.querySelectorAll ? [...scope.querySelectorAll(SUB_SEL)] : [];
        const blocks = scope.querySelectorAll ? [...scope.querySelectorAll(BLOCK_SEL)] : [];

        text.filter((el) => !el.dataset.mDone).forEach((el) => {
          el.dataset.mDone = '1';
          gsap.fromTo(
            el,
            { y: 56, opacity: 0, clipPath: 'inset(0 0 100% 0)' },
            {
              y: 0,
              opacity: 1,
              clipPath: 'inset(0 0 -20% 0)',
              duration: 0.9,
              ease: 'power4.out',
              scrollTrigger: { trigger: el, start: 'top 90%', once: true },
            }
          );
        });
        subs.filter((el) => !el.dataset.mDone).forEach((el) => {
          el.dataset.mDone = '1';
          gsap.from(el, {
            y: 24,
            opacity: 0,
            duration: 0.7,
            delay: 0.12,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
          });
        });
        // blocks rise in as a staggered group per scroll position
        const fresh = blocks.filter((el) => !el.dataset.mDone);
        fresh.forEach((el) => { el.dataset.mDone = '1'; });
        if (fresh.length) {
          gsap.set(fresh, { opacity: 0, y: 48 });
          ScrollTrigger.batch(fresh, {
            start: 'top 92%',
            once: true,
            onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.09, overwrite: true }),
          });
        }
      }
      arm(document);

      // pick up content that renders after the first paint (data fetches, tab switches)
      let timer;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => { arm(document); ScrollTrigger.refresh(); }, 120);
      });
      const shell = document.querySelector('.public-page-shell');
      if (shell) observer.observe(shell, { childList: true, subtree: true });

      // parallax: the hero globe drifts slower than the page, the sample card floats the other way
      const globe = document.querySelector('.hero-section .tech-globe');
      if (globe) {
        gsap.to(globe, { yPercent: 18, scale: 1.08, ease: 'none', scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: true } });
      }
      const heroText = document.querySelector('.hero-col-text');
      if (heroText) {
        gsap.to(heroText, { yPercent: -8, opacity: 0.35, ease: 'none', scrollTrigger: { trigger: '.hero-section', start: 'center top', end: 'bottom top', scrub: true } });
      }
      const card = document.querySelector('.au-explore-visual');
      if (card) {
        gsap.fromTo(card, { yPercent: 10 }, { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.au-explore', start: 'top bottom', end: 'bottom top', scrub: true } });
      }
      gsap.utils.toArray('.au-stats .hero-spec-row b').forEach((el, i) => {
        gsap.fromTo(el, { yPercent: 20 + i * 6 }, { yPercent: -6, ease: 'none', scrollTrigger: { trigger: '.au-stats', start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      // magnetic buttons (pointer devices only)
      const cleanups = [];
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        const onMove = (e) => {
          const el = e.target.closest?.(MAGNETIC_SEL);
          if (!el) return;
          const r = el.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          gsap.to(el, { x: dx * 0.22, y: dy * 0.3, duration: 0.35, ease: 'power3.out', overwrite: 'auto' });
        };
        const onLeave = (e) => {
          const el = e.target.closest?.(MAGNETIC_SEL);
          if (el) gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
        };
        const onDown = (e) => {
          const el = e.target.closest?.(MAGNETIC_SEL);
          if (el) gsap.to(el, { scale: 0.95, duration: 0.12, overwrite: 'auto' });
        };
        const onUp = (e) => {
          const el = e.target.closest?.(MAGNETIC_SEL);
          if (el) gsap.to(el, { scale: 1, duration: 0.5, ease: 'back.out(3)', overwrite: 'auto' });
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerout', onLeave);
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('pointerup', onUp);
        cleanups.push(() => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerout', onLeave);
          document.removeEventListener('pointerdown', onDown);
          document.removeEventListener('pointerup', onUp);
        });
      }

      ScrollTrigger.refresh();
      return () => {
        clearTimeout(timer);
        observer.disconnect();
        cleanups.forEach((fn) => fn());
      };
    });

    return () => ctx.revert();
  }, [location.pathname]);

  return null;
}
