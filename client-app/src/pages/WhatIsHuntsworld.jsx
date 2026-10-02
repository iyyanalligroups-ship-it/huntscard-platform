import { Link } from 'react-router-dom';

// Starter copy -- kept deliberately general since this describes an
// external platform (HuntsWorld), not something built in this repo.
// Matches how it's actually wired up (Dashboard.jsx's Huntsworld tab,
// profile.huntsworldUrl, the AR panel's Huntsworld Link block) without
// claiming anything about HuntsWorld itself beyond that.
export default function WhatIsHuntsworld() {
  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>What is HuntsWorld?</h1>
      <p className="section-subheading">A business listing platform your card can link straight to.</p>

      <div className="checkout-panel" style={{ maxWidth: 640 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>How it connects to your card</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 0 }}>
            HuntsWorld is a business listing platform, separate from HuntsTAG itself. If your
            business has a listing there, you can add that link to your profile — it then shows up
            as its own "Huntsworld" section on your public card page, and (if you're on a plan with
            AR features) as its own block in the AR layout too.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Adding your listing</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 0 }}>
            Add your HuntsWorld listing URL from your dashboard's Profile Settings. Once it's set,
            anyone who taps or scans your card can jump straight to your listing in one tap.
          </p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Don't have a listing yet?</h2>
          <p className="shop-plan-desc" style={{ marginBottom: 14 }}>
            That's fine — this section simply won't show on your card until you add one.
            Questions about getting listed on HuntsWorld itself? Reach out and we'll point you in
            the right direction.
          </p>
          <Link to="/contact" className="link-out">Contact us →</Link>
        </div>
      </div>
    </div>
  );
}
