import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// All motion for the engagement homepage. Everything is created inside one
// gsap.context (see HomeV3) so unmounting reverts every tween and trigger.
// Nothing here runs when the visitor prefers reduced motion.

export const motionAllowed = () =>
  typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const once = (trigger, start = 'top 80%') => ({ trigger, start, once: true });

// Generic scroll reveal for every element tagged data-r. Safe to call again
// after async content (plans, FAQ, posters) renders: already-registered
// elements are skipped.
export function registerReveals(root) {
  const els = [...root.querySelectorAll('[data-r]:not([data-rd])')];
  if (!els.length) return;
  els.forEach((e) => e.setAttribute('data-rd', ''));
  gsap.set(els, { autoAlpha: 0, y: 46 });
  ScrollTrigger.batch(els, {
    start: 'top 90%',
    once: true,
    batchMax: 6,
    onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', overwrite: true }),
  });
}

function hero(root) {
  const q = (s) => root.querySelectorAll(s);
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from(q('.hv3-hero .hv3-eyebrow'), { y: 18, autoAlpha: 0, duration: 0.6 })
    .from(q('.hv3-hero h1'), { y: 56, autoAlpha: 0, clipPath: 'inset(0 0 100% 0)', duration: 1, ease: 'expo.out' }, '-=0.3')
    .from(q('.hv3-hero .hv3-tag'), { y: 18, autoAlpha: 0, duration: 0.6 }, '-=0.55')
    .from(q('.hv3-hero .hv3-lead'), { y: 18, autoAlpha: 0, duration: 0.6 }, '-=0.45')
    .from(q('.hv3-hero .hv3-cta-row > *'), { y: 22, autoAlpha: 0, stagger: 0.1, duration: 0.6 }, '-=0.35')
    .from(q('.hv3-hero .hv3-mini li'), { y: 14, autoAlpha: 0, stagger: 0.1, duration: 0.5 }, '-=0.3')
    .from(q('.hv3-hero .hv3-profile'), { y: 90, autoAlpha: 0, scale: 0.92, duration: 1.2, ease: 'expo.out' }, 0.2)
    .from(q('.hv3-hero .hv3-hero-card'), { y: 70, autoAlpha: 0, stagger: 0.15, duration: 1 }, 0.55)
    .from(q('.hv3-hero .hv3-chip, .hv3-hero .hv3-savebadge, .hv3-hero .hv3-float'), { scale: 0.6, autoAlpha: 0, stagger: 0.09, duration: 0.6, ease: 'back.out(2.2)' }, 0.95)
    .add(() => {
      // gentle idle float, offset per chip so they never move in lockstep
      q('.hv3-hero .hv3-chip, .hv3-hero .hv3-savebadge, .hv3-hero .hv3-float').forEach((el, i) => {
        gsap.to(el, { y: [-10, 8, -6, 10, -8, 6][i % 6], duration: 2.4 + i * 0.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      });
    });

  // parallax: the phone and cards drift at different speeds as the hero scrolls away
  const scrub = { trigger: '.hv3-hero', start: 'top top', end: 'bottom top', scrub: 0.6 };
  gsap.to(q('.hv3-hero .hv3-profile'), { yPercent: -7, ease: 'none', scrollTrigger: scrub });
  gsap.to(q('.hv3-hero .hv3-hero-card-a'), { yPercent: -22, ease: 'none', scrollTrigger: scrub });
  gsap.to(q('.hv3-hero .hv3-hero-card-b'), { yPercent: -34, ease: 'none', scrollTrigger: scrub });
  gsap.to(q('.hv3-hero .hv3-hero-copy'), { yPercent: 10, autoAlpha: 0.2, ease: 'none', scrollTrigger: scrub });
}

// AR showcase: as the section scrolls into view the card is 'scanned' and each panel rises above it.
function arScene(root) {
  const q = (sel) => root.querySelectorAll(sel);
  if (!q('.ar-stage').length) return;
  const tl = gsap.timeline({ scrollTrigger: { trigger: '.ar-stage', start: 'top 80%', end: 'center 50%', scrub: 0.8 } });
  tl.from(q('.ar-viewfinder i'), { scale: 1.5, autoAlpha: 0, stagger: 0.05, duration: 0.3 }, 0)
    .from(q('.ar-card'), { autoAlpha: 0, y: 50, duration: 0.4 }, 0.05)
    .from(q('.ar-glow'), { autoAlpha: 0, scale: 0.6, duration: 0.4 }, 0.15)
    .from(q('.ar-tag'), { autoAlpha: 0, y: 12, duration: 0.2 }, 0.3)
    .from(q('.ar-panel'), { y: 110, autoAlpha: 0, scale: 0.7, stagger: 0.16, duration: 0.5, ease: 'back.out(1.5)' }, 0.5);
}

function bento(root) {
  const q = (s) => root.querySelectorAll(s);
  gsap.from(q('.bt-card'), { y: 100, autoAlpha: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: once('.bt-tap') });
  gsap.from(q('.bt-qrart i'), {
    scale: 0, autoAlpha: 0, duration: 0.4, ease: 'back.out(2)',
    stagger: { each: 0.012, from: 'random' }, scrollTrigger: once('.bt-qr'),
  });
  gsap.from(q('.bt-browser em'), { clipPath: 'inset(0 100% 0 0)', duration: 1.3, ease: 'steps(24)', scrollTrigger: once('.bt-app') });
  gsap.timeline({ scrollTrigger: once('.bt-update') })
    .from(q('.bt-field s'), { autoAlpha: 0, duration: 0.3 })
    .from(q('.bt-field b'), { y: 14, autoAlpha: 0, duration: 0.5, ease: 'power3.out' }, '+=0.35')
    .from(q('.bt-field span'), { scale: 0.5, autoAlpha: 0, duration: 0.5, ease: 'back.out(3)' }, '-=0.1');
}

function compare(root) {
  const q = (s) => root.querySelectorAll(s);
  const tl = gsap.timeline({ scrollTrigger: once('.hv3-compare', 'top 78%') });
  tl.from(q('.hv3-compare-head span'), { autoAlpha: 0, y: -16, stagger: 0.12, duration: 0.5, ease: 'power3.out' })
    .from(q('.hv3-compare-row .bad'), { x: -50, autoAlpha: 0, stagger: 0.14, duration: 0.6, ease: 'power3.out' }, '-=0.1')
    .from(q('.hv3-compare-row .good'), { x: 50, autoAlpha: 0, stagger: 0.14, duration: 0.6, ease: 'power3.out' }, '<0.08');
}

function digitalCard(root) {
  const q = (s) => root.querySelectorAll(s);
  gsap.from(q('.hv3-media .hv3-chip'), { scale: 0.5, autoAlpha: 0, stagger: 0.15, duration: 0.6, ease: 'back.out(2.4)', scrollTrigger: once('.hv3-media', 'top 70%') });
  gsap.from(q('.hv3-checks li'), { x: -26, autoAlpha: 0, stagger: 0.1, duration: 0.6, ease: 'power3.out', scrollTrigger: once('.hv3-checks', 'top 85%') });
  gsap.fromTo(q('.hv3-media img'), { yPercent: 5 }, { yPercent: -5, ease: 'none', scrollTrigger: { trigger: '.hv3-media', start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
}

function video(root) {
  if (window.innerWidth < 961) return; // no overlap-prone parallax on small screens
  const q = (s) => root.querySelectorAll(s);
  gsap.fromTo(q('.hv3-phone-video'), { y: 90, scale: 0.94 }, { y: -20, scale: 1, ease: 'none', scrollTrigger: { trigger: '#hv3-video', start: 'top bottom', end: 'center center', scrub: 0.7 } });
}

function how(root) {
  const q = (s) => root.querySelectorAll(s);
  const line = q('.hv3-timeline')[0];
  if (!line) return;
  gsap.set(line, { '--tl': 0 });
  const items = q('.hv3-tl-item');
  // Plays once when the section scrolls in (no scrub), so pausing mid-scroll never
  // leaves the steps half drawn or missing.
  const tl = gsap.timeline({ scrollTrigger: { trigger: line, start: 'top 85%', once: true } });
  tl.to(line, { '--tl': 1, ease: 'power2.inOut', duration: 1.6 }, 0);
  items.forEach((it, i) => {
    const at = i * 0.32;
    tl.from(it.querySelector('.hv3-tl-num'), { clipPath: 'inset(100% 0 0 0)', yPercent: 30, duration: 0.6, ease: 'power3.out' }, at)
      .from(it.querySelector('.hv3-tl-dot'), { scale: 0, duration: 0.35, ease: 'back.out(3)' }, at + 0.2)
      .from(it.querySelectorAll('h3, p'), { y: 16, autoAlpha: 0, stagger: 0.08, duration: 0.45 }, at + 0.3);
  });
}

function ribbon(root) {
  const q = (s) => root.querySelectorAll(s);
  const tl = gsap.timeline({ scrollTrigger: once('.hv3-ribbon', 'top 75%') });
  tl.from(q('.hv3-ribbon-head > *'), { x: -26, autoAlpha: 0, stagger: 0.1, duration: 0.6, ease: 'power3.out' })
    .from(q('.hv3-ribbon-list li'), { y: 24, autoAlpha: 0, stagger: 0.12, duration: 0.6, ease: 'power3.out' }, '-=0.3')
    .from(q('.hv3-pay span'), { scale: 0.6, autoAlpha: 0, stagger: 0.1, duration: 0.4, ease: 'back.out(3)' }, '-=0.5');
}

function bulk(root) {
  const q = (s) => root.querySelectorAll(s);
  gsap.from(q('.hv3-bulk li'), { x: 50, autoAlpha: 0, stagger: 0.14, duration: 0.7, ease: 'power3.out', scrollTrigger: once('.hv3-bulk', 'top 85%') });
  gsap.fromTo(q('.hv3-wolf img'), { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.hv3-wolf', start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
}

function final(root) {
  const q = (s) => root.querySelectorAll(s);
  gsap.fromTo(q('.hv3-final-mark'), { rotate: -8, scale: 0.9 }, { rotate: 8, scale: 1.08, ease: 'none', scrollTrigger: { trigger: '.hv3-final', start: 'top bottom', end: 'bottom top', scrub: 0.8 } });
}

// Pieces that depend on async data (plans, posters, FAQ). Called after they render.
export function dynamicMotion(root) {
  const q = (s) => root.querySelectorAll(s);

  const plans = q('.hv3-plan');
  plans.forEach((el, i) => {
    if (el.dataset.mv) return;
    el.dataset.mv = '1';
    gsap.from(el, { rotationX: -18, transformPerspective: 800, transformOrigin: '50% 100%', duration: 0.9, delay: i * 0.08, ease: 'power3.out', scrollTrigger: once(el, 'top 90%') });
  });

  const posters = q('.hv3-posters img');
  if (posters.length && !posters[0].dataset.mv) {
    posters.forEach((p) => { p.dataset.mv = '1'; });
    gsap.from(posters, { x: (i) => [140, 0, -140][i] ?? 0, rotation: 0, autoAlpha: 0, stagger: 0.12, duration: 1, ease: 'power3.out', scrollTrigger: once('.hv3-posters', 'top 80%') });
    gsap.fromTo('.hv3-posters', { y: 30 }, { y: -30, ease: 'none', scrollTrigger: { trigger: '.hv3-posters', start: 'top bottom', end: 'bottom top', scrub: 0.7 } });
    gsap.to('.hv3-playbadge', { scale: 1.06, repeat: -1, yoyo: true, duration: 1.1, ease: 'sine.inOut' });
  }

  const faq = [...q('.hv3-faq-item')].filter((e) => !e.dataset.mv);
  if (faq.length) {
    faq.forEach((e) => { e.dataset.mv = '1'; });
    gsap.set(faq, { autoAlpha: 0, y: 24 });
    ScrollTrigger.batch(faq, { start: 'top 92%', once: true, onEnter: (b) => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.6, ease: 'power3.out', overwrite: true }) });
  }

  registerReveals(root);
  ScrollTrigger.refresh();
}

// Pointer tilt on plan cards (desktop pointers only). Returns a cleanup.
export function planTilt(root) {
  if (!window.matchMedia('(hover: hover)').matches) return () => {};
  const off = [];
  const scene = root.querySelector('.ar-scene');
  const stage = root.querySelector('.ar-stage');
  if (scene && stage) {
    const move = (e) => {
      const r = scene.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(stage, { rotationY: x * 14, rotationX: -y * 10, transformPerspective: 1100, duration: 0.6, ease: 'power2.out', overwrite: 'auto' });
    };
    const leave = () => gsap.to(stage, { rotationY: 0, rotationX: 0, duration: 0.8, ease: 'power3.out', overwrite: 'auto' });
    scene.addEventListener('pointermove', move);
    scene.addEventListener('pointerleave', leave);
    off.push(() => { scene.removeEventListener('pointermove', move); scene.removeEventListener('pointerleave', leave); });
  }
  root.querySelectorAll('.hv3-plan').forEach((el) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, { rotationY: x * 10, rotationX: -y * 10, transformPerspective: 800, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    };
    const leave = () => gsap.to(el, { rotationY: 0, rotationX: 0, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    off.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
  });
  return () => off.forEach((f) => f());
}

export function audienceSwap(root) {
  const panel = root.querySelector('.hv3-aud-panel');
  if (!panel) return;
  gsap.from(panel.querySelectorAll('.hv3-aud-info > *'), { y: 18, autoAlpha: 0, stagger: 0.07, duration: 0.5, ease: 'power3.out', clearProps: 'all' });
  gsap.from(panel.querySelector('.hv3-aud-phone'), { y: 34, autoAlpha: 0, scale: 0.95, duration: 0.6, ease: 'power3.out', clearProps: 'all' });
  gsap.from(panel.querySelectorAll('.hv3-aud-phone span'), { x: 22, autoAlpha: 0, stagger: 0.08, duration: 0.45, delay: 0.25, ease: 'power3.out', clearProps: 'all' });
}

// Static sections: everything present on first render.
export function initMotion(root) {
  root.classList.add('hv3-motion');
  hero(root);
  registerReveals(root);
  arScene(root);
  bento(root);
  compare(root);
  digitalCard(root);
  video(root);
  how(root);
  ribbon(root);
  bulk(root);
  final(root);
}

// Creates the page's gsap context and builds the static timelines inside it.
export function createMotion(root) {
  return gsap.context(() => initMotion(root), root);
}
