import { useEffect, useRef, useState } from 'react';

// Fades/slides a section into place the first time it scrolls into view
// (see .reveal/.is-visible in styles.css) -- the homepage's content
// sections (feature cards, steps, the HuntsWorld block) were previously
// just static on load, no different from a plain document; this is what
// gives scrolling down the page its own sense of motion, same spirit as
// the hero's BroadcastField above it. Fires once per element (observer
// disconnects itself after), not on every scroll past -- a reveal that
// replays each time you scroll back up reads as a glitch, not a feature.
// `delay` (ms) staggers a row of siblings (e.g. feature cards) so they
// cascade in one after another instead of all snapping in at once.
export default function Reveal({ children, delay = 0, className = '', as: Tag = 'div', style, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
