import { Link } from 'react-router-dom';

// Starter copy -- kept deliberately general since this describes an
// external platform (HuntsWorld), not something built in this repo.
// Matches how it's actually wired up (Dashboard.jsx's Huntsworld tab,
// profile.huntsworldUrl, the AR panel's Huntsworld Link block) without
// claiming anything about HuntsWorld itself beyond that.
const POINTS = [
  {
    title: 'How it connects to your card',
    body: `HuntsWorld is a business listing platform, separate from HuntsTAG itself. If your
            business has a listing there, you can add that link to your profile — it then shows up
            as its own "Huntsworld" section on your public card page, and (if you're on a plan with
            AR features) as its own block in the AR layout too.`,
  },
  {
    title: 'Adding your listing',
    body: `Add your HuntsWorld listing URL from your dashboard's Profile Settings. Once it's set,
            anyone who taps or scans your card can jump straight to your listing in one tap.`,
  },
  {
    title: "Don't have a listing yet?",
    body: `That's fine — this section simply won't show on your card until you add one.
            Questions about getting listed on HuntsWorld itself? Reach out and we'll point you in
            the right direction.`,
    cta: true,
  },
];

export default function WhatIsHuntsworld() {
  return (
    <div className="au-page">
      <header className="au-page-hero">
        <h1 className="section-heading">What is HuntsWorld?</h1>
        <p className="section-subheading">A business listing platform your card can link straight to.</p>
      </header>

      <div className="au-steps">
        {POINTS.map((point, i) => (
          <section className="au-step" key={point.title}>
            <span className="au-step-number">{String(i + 1).padStart(2, '0')}</span>
            <div className="au-step-body">
              <h2>{point.title}</h2>
              <p>{point.body.replace(/\s+/g, ' ')}</p>
              {point.cta && <Link to="/contact" className="btn-primary au-cta">Contact us →</Link>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
