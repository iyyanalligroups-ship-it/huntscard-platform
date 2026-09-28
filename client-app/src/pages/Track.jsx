import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Image, PackageSearch, RotateCcw, Search, Truck } from 'lucide-react';
import { api } from '../api.js';

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
        <Link to={isCard ? '/dashboard/upgrade' : '/dashboard/magic-poster-orders'} className="link-out">
          View purchase history
        </Link>
      </footer>
    </article>
  );
}

export default function Track() {
  const [profile, setProfile] = useState(null);
  const [cardOrders, setCardOrders] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    Promise.all([api.getProfile(), api.listMyRequests()])
      .then(([profileData, requestData]) => {
        setProfile(profileData);
        setCardOrders(requestData.filter((order) => order.type === 'upgrade' && order.paymentStatus === 'paid' && order.status !== 'rejected'));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSearch(event) {
    event.preventDefault();
    const cleanQuery = query.trim().replace(/^#/, '');
    if (!cleanQuery) return;

    setSearching(true);
    setError('');
    try {
      const needle = cleanQuery.toLowerCase();
      const matchingCards = cardOrders.filter((order) =>
        [order.orderNumber, order.trackingId].some((value) => String(value || '').toLowerCase().includes(needle)),
      );
      const posterResponse = await api.listMyMagicPosterOrders({ q: cleanQuery });
      setResults({ cards: matchingCards, posters: posterResponse.orders || [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setResults(null);
    setError('');
  }

  if (loading) return <p className="subtitle">Loading…</p>;

  const latestCardOrder = cardOrders[0];
  const resultCount = results ? results.cards.length + results.posters.length : 0;

  return (
    <div className="unified-track-page">
      <div className="unified-track-heading">
        <span><PackageSearch size={22} /></span>
        <div>
          <p>All purchases</p>
          <h1>Track an order</h1>
          <div>Use one search for physical cards and Magic Poster shipments.</div>
        </div>
      </div>

      <form className="unified-track-search" onSubmit={handleSearch}>
        <label htmlFor="unifiedTrackingSearch">Order number or tracking ID</label>
        <div>
          <span><Search size={18} /></span>
          <input
            id="unifiedTrackingSearch"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Example: HT26021 or MPTSP8XBT8Q0"
          />
          <button type="submit" disabled={searching || !query.trim()}>{searching ? 'Searching…' : 'Track order'}</button>
          {results && <button type="button" className="secondary" onClick={clearSearch}><RotateCcw size={14} />Clear</button>}
        </div>
        <small>Searches your card purchases and Magic Poster purchases together.</small>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {results ? (
        <section className="unified-track-results">
          <div className="unified-track-results-title">
            <div><h2>Tracking results</h2><p>{resultCount} {resultCount === 1 ? 'order' : 'orders'} found</p></div>
          </div>
          {resultCount === 0 ? (
            <div className="unified-track-empty">
              <PackageSearch size={28} />
              <h3>No matching shipment</h3>
              <p>Check the order number or tracking ID and try again.</p>
            </div>
          ) : (
            <div className="unified-track-result-list">
              {results.cards.map((order) => <TrackingResult key={`card-${order._id}`} type="card" order={order} profile={profile} />)}
              {results.posters.map((order) => <TrackingResult key={`poster-${order._id}`} type="poster" order={order} profile={profile} />)}
            </div>
          )}
        </section>
      ) : latestCardOrder ? (
        <section className="unified-track-latest">
          <div className="unified-track-results-title">
            <div><h2>Latest card shipment</h2><p>Search above to track any other card or Magic Poster order.</p></div>
          </div>
          <TrackingResult type="card" order={latestCardOrder} profile={profile} />
        </section>
      ) : (
        <div className="unified-track-empty">
          <PackageSearch size={28} />
          <h3>No card purchases yet</h3>
          <p>You can still search for a Magic Poster order above, or <Link to="/dashboard/upgrade" className="link-out">browse cards</Link>.</p>
        </div>
      )}
    </div>
  );
}
