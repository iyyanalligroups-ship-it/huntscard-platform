import Reveal from './Reveal.jsx';

function StaticElement({ as: Tag = 'div', children, delay: _delay, ...props }) {
  return <Tag {...props}>{children}</Tag>;
}

const POINTS = [
  {
    title: 'Innovation Over Payment',
    desc: 'Our revolutionary Trend Points System ranks products based on genuine user interest and engagement, not payment capacity. Quality products rise to the top naturally, giving every seller a fair chance to shine.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
    ),
  },
  {
    title: 'Affordable Excellence',
    desc: 'We offer comprehensive B2B marketplace features at a fraction of competitor pricing, making professional business tools accessible to startups, SMEs, and established enterprises alike.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 12.9 12.9 20.6a2 2 0 0 1-2.8 0L3 13.5V3h10.5l7.1 7.1a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
    ),
  },
  {
    title: 'Rewards That Matter',
    desc: "From our unique viewpoint earnings system to student benefits and referral programs, we've created multiple ways for our community to grow and prosper together.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.5 8.9l6.6-.9L12 2Z" /></svg>
    ),
  },
];

// Marketing section about HuntsWorld (the separate business-listing
// platform huntsTAG cards can link to -- see WhatIsHuntsworld.jsx),
// rendered on the homepage only (Home.jsx / HomeD1.jsx, above their own
// "Browse card plans" CTA) -- was previously in PublicLayout.jsx, showing
// on every public page, which put HuntsWorld marketing copy on unrelated
// pages like About Us. Copy supplied directly by the business, not
// placeholder text.
export default function WhyChooseHuntsworld({ animateWithGsap = false, sectionRef }) {
  const MotionElement = animateWithGsap ? StaticElement : Reveal;

  return (
    <section className="why-huntsworld" ref={sectionRef}>
      <div className="why-huntsworld-inner">
        <MotionElement as="h2" className="section-heading" style={{ margin: '0 0 8px' }}>What is HuntsWorld and why</MotionElement>
        <MotionElement as="p" className="why-huntsworld-intro" delay={80}>
          Huntsworld is India's most affordable B2B marketplace, designed to democratize business
          connections for companies of all sizes. We believe that every business, regardless of
          budget, deserves access to powerful marketplace tools and genuine growth opportunities.
        </MotionElement>

        <MotionElement as="h3" className="why-huntsworld-sub" delay={140}>What Makes Us Different</MotionElement>
        <div className="feature-grid">
          {POINTS.map((p, i) => (
            <MotionElement as="div" className="feature-card" key={p.title} delay={i * 90}>
              <div className="feature-icon">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </MotionElement>
          ))}
        </div>
      </div>
    </section>
  );
}
