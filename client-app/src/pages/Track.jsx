import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Image, PackageSearch, Truck } from 'lucide-react';
import { api } from '../api.js';
import ThemedSelect from '../components/ThemedSelect.jsx';

const POSTER_STATUS_ORDER = ['ordered', 'shipping', 'delivery', 'completed'];

function cardSteps(order, profile) {
  const hasOrderShipment = Boolean(order?.trackingId || order?.dispatchedAt || order?.deliveredAt);
  const trackingId = hasOrderShipment ? order?.trackingId : profile?.trackingId;
  const dispatchedAt = hasOrderShipment ? order?.dispatchedAt : profile?.dispatchedAt;
  const deliveredAt = hasOrderShipment ? order?.deliveredAt : profile?.deliveredAt;
  const dispatched = hasOrderShipment ? Boolean(order?.dispatchedAt) : Boolean(profile?.dispatched);
  const delivered = hasOrderShipment ? Boolean(order?.deliveredAt) : Boolean(profile?.delivered);

  return [
    { title: 'Order placed', detail: 'Payment confirmed.', done: true },
    {
      title: 'Card created',
      detail: profile?.chipEncoded
        ? `Encoded${profile.encodedAt ? ` on ${new Date(profile.encodedAt).toLocaleDateString()}` : ''}.`
        : 'Waiting for our team to physically create your card.',
      done: Boolean(profile?.chipEncoded),
    },
    {
      title: 'Shipping',
      detail: dispatched
        ? `On its way${trackingId ? ` — tracking ID ${trackingId}` : ''}${dispatchedAt ? `, dispatched ${new Date(dispatchedAt).toLocaleDateString()}` : ''}.`
        : 'Not shipped yet.',
      done: dispatched,
    },
    {
      title: 'Delivered',
      detail: delivered
        ? `Delivered${deliveredAt ? ` on ${new Date(deliveredAt).toLocaleDateString()}` : ''}.`
        : 'Not delivered yet.',
      done: delivered,
    },
  ];
}

function posterSteps(order) {
  const statusIndex = POSTER_STATUS_ORDER.indexOf(order.status);
  return [
    {
      title: 'Order placed',
      detail: `Payment confirmed${order.createdAt ? ` on ${new Date(order.createdAt).toLocaleDateString()}` : ''}.`,
      done: true,
    },
    {
      title: 'Shipping',
      detail: order.trackingId ? `On its way — tracking ID ${order.trackingId}.` : 'Preparing your order for shipment.',
      done: statusIndex >= 1,
    },
    {
      title: 'Out for delivery',
      detail: statusIndex >= 2 ? 'Out for delivery to your address.' : 'Not out for delivery yet.',
      done: statusIndex >= 2,
    },
    {
      title: 'Completed',
      detail: statusIndex >= 3 ? 'Delivered — order completed.' : 'Not completed yet.',
      done: statusIndex >= 3,
    },
  ];
}

function TrackingSteps({ steps }) {
  const currentIndex = steps.findIndex((step) => !step.done);
  return (
    <div className="track-stepper unified-track-stepper">
      {steps.map((step, index) => (
        <div key={step.title} className={`track-step ${step.done ? 'done' : index === currentIndex ? 'current' : ''}`}>
          {index < steps.length - 1 && <div className="track-step-line" />}
          <div className="track-step-dot">{step.done ? '✓' : index + 1}</div>
          <div className="track-step-body">
            <div className="track-step-title">{step.title}</div>
            <div className="track-step-detail">{step.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrackingResult({ type, order, profile }) {
  const isCard = type === 'card';
  const Icon = isCard ? CreditCard : Image;
  const title = isCard ? order.requestedPlan || 'Physical card' : 'Magic Poster';
  const items = isCard
    ? (order.invoiceItems || []).map((item) => `${item.quantity}× ${item.name}`).join(', ')
    : (order.items || []).map((item) => `${item.quantity}× ${item.name || 'Poster'}`).join(', ');

  return (
    <article className="unified-track-result">
      <header className="unified-track-result-head">
        <span className="unified-track-type-icon"><Icon size={18} /></span>
        <div>
          <span className="unified-track-type">{isCard ? 'Card purchase' : 'Magic Poster purchase'}</span>
          <h2>{title}</h2>
          {items && <p>{items}</p>}
        </div>
        <div className="unified-track-identifiers">
          <span>Order</span><strong>{order.orderNumber || 'Not available'}</strong>
          <span>Tracking ID</span><strong>{order.trackingId || 'Not assigned'}</strong>
        </div>
      </header>
      <TrackingSteps steps={isCard ? cardSteps(order, profile) : posterSteps(order)} />
      <footer className="unified-track-result-foot">
        <span><Truck size={13} />{order.trackingId ? `Shipment ${order.trackingId}` : 'Shipment is being prepared'}</span>
        <Link to={isCard ? '/dashboard/upgrade' : '/dashboard/upgrade?history=poster'} className="link-out">
          View purchase history
        </Link>
      </footer>
    </article>
  );
}

function cardLabel(order) {
  const names = (order.invoiceItems || []).map((item) => item.name).filter(Boolean).join(', ');
  return `${names || order.requestedPlan || 'Physical card'} — ${order.orderNumber || 'No order number'}`;
}

function posterLabel(order) {
  const names = (order.items || []).map((item) => item.name || 'Poster').join(', ') || 'Magic Poster';
  return `${names} — ${order.orderNumber || 'No order number'}`;
}

export default function Track() {
  const [profile, setProfile] = useState(null);
  const [cardOrders, setCardOrders] = useState([]);
  const [posterOrders, setPosterOrders] = useState([]);
  const [tab, setTab] = useState('card');
  const [selectedId, setSelectedId] = useState({ card: '', poster: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProfile(), api.listMyRequests(), api.listMyMagicPosterOrders({ limit: 50 })])
      .then(([profileData, requestData, posterData]) => {
        const cards = requestData.filter((order) => order.type === 'upgrade' && order.paymentStatus === 'paid' && order.status !== 'rejected');
        const posters = posterData.orders || [];
        setProfile(profileData);
        setCardOrders(cards);
        setPosterOrders(posters);
        setSelectedId({ card: cards[0]?._id || '', poster: posters[0]?._id || '' });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="subtitle">Loading…</p>;

  const isCard = tab === 'card';
  const orders = isCard ? cardOrders : posterOrders;
  const selected = orders.find((order) => order._id === selectedId[tab]) || orders[0];

  return (
    <div className="unified-track-page">
      <div className="unified-track-heading">
        <span><PackageSearch size={22} /></span>
        <div>
          <p>All purchases</p>
          <h1>Track an order</h1>
          <div>Pick a card or Magic Poster order to see its shipment progress.</div>
        </div>
      </div>

      <div className="history-tabs" role="tablist">
        {[['card', 'Card track', CreditCard], ['poster', 'Magic Poster track', Image]].map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`history-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {orders.length === 0 ? (
        <div className="unified-track-empty">
          <PackageSearch size={28} />
          <h3>{isCard ? 'No card purchases yet' : 'No Magic Poster orders yet'}</h3>
          <p>
            {isCard
              ? <>You haven't bought a card yet. <Link to="/dashboard/upgrade" className="link-out">Browse cards</Link>.</>
              : <>You haven't ordered a Magic Poster yet. <Link to="/magic-art" className="link-out">Browse Magic Posters</Link>.</>}
          </p>
        </div>
      ) : (
        <>
          <div className="unified-track-search">
            <label htmlFor="trackOrderSelect">{isCard ? 'Select a card order' : 'Select a Magic Poster order'}</label>
            <ThemedSelect
              id="trackOrderSelect"
              className="track-order-select"
              value={selected._id}
              options={orders.map((order) => ({ value: order._id, label: isCard ? cardLabel(order) : posterLabel(order) }))}
              onChange={(value) => setSelectedId((prev) => ({ ...prev, [tab]: value }))}
            />
          </div>
          <section className="unified-track-latest">
            <TrackingResult type={tab} order={selected} profile={profile} />
          </section>
        </>
      )}
    </div>
  );
}
