import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Track() {
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProfile(), api.listMyRequests()])
      .then(([profileData, requestData]) => {
        setProfile(profileData);
        setOrders(requestData);
      })
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

  // New purchases keep shipping state on their own order. Older purchases
  // still fall back to the original client-level fulfilment fields.
  const latestPaidOrder = orders.find(
    (order) => order.type === 'upgrade' && order.paymentStatus === 'paid' && order.status !== 'rejected',
  );
  const hasOrderShipment = Boolean(
    latestPaidOrder?.trackingId || latestPaidOrder?.dispatchedAt || latestPaidOrder?.deliveredAt,
  );
  const trackingId = hasOrderShipment ? latestPaidOrder.trackingId : profile.trackingId;
  const dispatchedAt = hasOrderShipment ? latestPaidOrder.dispatchedAt : profile.dispatchedAt;
  const deliveredAt = hasOrderShipment ? latestPaidOrder.deliveredAt : profile.deliveredAt;
  const dispatched = hasOrderShipment ? Boolean(latestPaidOrder.dispatchedAt) : profile.dispatched;
  const delivered = hasOrderShipment ? Boolean(latestPaidOrder.deliveredAt) : profile.delivered;
  const cardType = latestPaidOrder?.requestedPlan || profile.cardType;

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
      detail: dispatched
        ? `On its way — tracking ID ${trackingId}${dispatchedAt ? ', dispatched ' + new Date(dispatchedAt).toLocaleDateString() : ''}.`
        : 'Not shipped yet.',
      done: dispatched,
    },
    {
      title: 'Delivered',
      detail: delivered
        ? `Delivered${deliveredAt ? ' on ' + new Date(deliveredAt).toLocaleDateString() : ''}.`
        : 'On its way to you.',
      done: delivered,
    },
  ];

  // The first not-done step is "current" -- visually distinct from
  // future steps that haven't started at all.
  const currentIndex = steps.findIndex((s) => !s.done);

  return (
    <div>
      <h1>Track your order</h1>
      <p className="subtitle">
        Your <b>{cardType}</b> card, from payment to delivery.
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
