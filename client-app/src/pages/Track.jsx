import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Track() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="subtitle">Loading…</p>;
  if (error) return <div className="error-banner">{error}</div>;

  if (!profile?.cardType || !profile?.paid) {
    return (
      <div>
        <h1>Track your order</h1>
        <p className="subtitle">
          You haven't ordered a card yet — <Link to="/dashboard/upgrade" className="link-out">head to Shop</Link> to
          get one, then come back here to follow it.
        </p>
      </div>
    );
  }

  const steps = [
    {
      title: 'Order placed',
      detail: 'Payment confirmed.',
      done: true,
    },
    {
      title: 'Card created',
      detail: profile.chipEncoded
        ? `Encoded${profile.encodedAt ? ' on ' + new Date(profile.encodedAt).toLocaleDateString() : ''}.`
        : 'Waiting on our team to physically create your card.',
      done: profile.chipEncoded,
    },
    {
      title: 'Shipping',
      detail: profile.dispatched
        ? `On its way — tracking ID ${profile.trackingId}${profile.dispatchedAt ? ', dispatched ' + new Date(profile.dispatchedAt).toLocaleDateString() : ''}.`
        : 'Not shipped yet.',
      done: profile.dispatched,
    },
    {
      title: 'Delivered',
      detail: profile.delivered
        ? `Delivered${profile.deliveredAt ? ' on ' + new Date(profile.deliveredAt).toLocaleDateString() : ''}.`
        : 'On its way to you.',
      done: profile.delivered,
    },
  ];

  // The first not-done step is "current" -- visually distinct from
  // future steps that haven't started at all.
  const currentIndex = steps.findIndex((s) => !s.done);

  return (
    <div>
      <h1>Track your order</h1>
      <p className="subtitle">
        Your <b>{profile.cardType}</b> card, from payment to delivery.
      </p>

      <div className="track-stepper">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className={`track-step ${step.done ? 'done' : i === currentIndex ? 'current' : ''}`}
          >
            {i < steps.length - 1 && <div className="track-step-line" />}
            <div className="track-step-dot">{step.done ? '✓' : i + 1}</div>
            <div className="track-step-body">
              <div className="track-step-title">{step.title}</div>
              <div className="track-step-detail">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
