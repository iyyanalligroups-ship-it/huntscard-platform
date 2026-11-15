import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Image, PackageSearch, RefreshCw, Truck } from 'lucide-react';
import { api } from '../api.js';
import ThemedSelect from '../components/ThemedSelect.jsx';

const POSTER_STATUS_ORDER = ['ordered', 'shipping', 'delivery', 'completed'];

// The account-level fields on `profile` (dispatched / delivered / chipEncoded / tracking) describe the
// FIRST card an account ever bought, from before shipments were tracked per order. They are only a valid
// fallback for that oldest order -- using them for a newer order made every new purchase show as already
// shipped and delivered. A newer order with no shipment data of its own is simply "not shipped yet".
function cardSteps(order, profile, useAccountFallback) {
  const hasOrderShipment = Boolean(order?.trackingId || order?.dispatchedAt || order?.deliveredAt);
  const fb = !hasOrderShipment && useAccountFallback ? profile : null;
  const trackingId = hasOrderShipment ? order?.trackingId : fb?.trackingId;
  const dispatchedAt = hasOrderShipment ? order?.dispatchedAt : fb?.dispatchedAt;
  const deliveredAt = hasOrderShipment ? order?.deliveredAt : fb?.deliveredAt;
  const dispatched = hasOrderShipment ? Boolean(order?.dispatchedAt) : Boolean(fb?.dispatched);
  const delivered = hasOrderShipment ? Boolean(order?.deliveredAt) : Boolean(fb?.delivered);
  // A card that has shipped or been delivered has obviously been created.
  const created = Boolean((useAccountFallback && profile?.chipEncoded) || dispatched || delivered);

  return [
    { title: 'Order placed', detail: 'Payment confirmed.', done: true },
    {
      title: 'Card created',
      detail: created
        ? `Encoded${useAccountFallback && profile?.encodedAt ? ` on ${new Date(profile.encodedAt).toLocaleDateString()}` : ''}.`
        : 'Waiting for our team to physically create your card.',
      done: created,
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

// What is happening right now, in plain words, keyed by the step that is still pending. No dates or promises.
const NOW_HAPPENING = {
  card: {
    'Card created': "Your order is confirmed. Our team is creating your NFC card -- this page updates as it moves forward.",
    Shipping: 'Your card is created and is being prepared for dispatch.',
    Delivered: 'Your card is on its way. Use the tracking ID above to follow it with the courier.',
  },
  poster: {
    Shipping: 'Your order is confirmed and is being prepared for dispatch.',
    'Out for delivery': 'Your order has shipped and is on its way to you.',
    Completed: 'Your order is out for delivery.',
  },
};

function TrackingSteps({ steps, kind = 'card' }) {
  const currentIndex = steps.findIndex((step) => !step.done);
  const nowText = currentIndex === -1 ? 'All done -- this order is complete.' : NOW_HAPPENING[kind]?.[steps[currentIndex].title];
  return (
    <>
    {nowText && <p className="track-now-line" role="status"><strong>{currentIndex === -1 ? 'Complete' : 'Right now'}:</strong> {nowText}</p>}
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
    </>
  );
}

function TrackingResult({ type, order, profile, isOldestCardOrder }) {
  const isCard = type === 'card';
  const Icon = isCard ? CreditCard : Image;
  // requestedPlan is the plan's internal key, which keeps its old value if the plan is later renamed;
  // the invoice items carry the name the customer actually bought ("Elite card - Dark Night").
  const planName = (order.invoiceItems?.[0]?.name || '').split(' - ')[0].trim();
  const title = isCard ? planName || order.planName || order.requestedPlan || 'Physical card' : 'Magic Poster';
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
      <TrackingSteps kind={isCard ? 'card' : 'poster'} steps={isCard ? cardSteps(order, profile, isOldestCardOrder) : posterSteps(order)} />
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
  return `${names || order.planName || order.requestedPlan || 'Physical card'} — ${order.orderNumber || 'No order number'}`;
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

  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  // Loads (or reloads) everything on this page. A refresh keeps the order the person already picked, if it still exists.
  function loadData({ refresh = false } = {}) {
    if (refresh) setRefreshing(true);
    setError('');
    return Promise.all([api.getProfile(), api.listMyRequests(), api.listMyMagicPosterOrders({ limit: 50 })])
      .then(([profileData, requestData, posterData]) => {
        const cards = requestData.filter((order) => order.type === 'upgrade' && order.paymentStatus === 'paid' && order.status !== 'rejected');
        const posters = posterData.orders || [];
        setProfile(profileData);
        setCardOrders(cards);
        setPosterOrders(posters);
        setSelectedId((prev) => ({
          card: cards.some((o) => o._id === prev.card) ? prev.card : cards[0]?._id || '',
          poster: posters.some((o) => o._id === prev.poster) ? prev.poster : posters[0]?._id || '',
        }));
        setUpdatedAt(new Date());
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="subtitle">Loading…</p>;

  const isCard = tab === 'card';
  const orders = isCard ? cardOrders : posterOrders;
  const selected = orders.find((order) => order._id === selectedId[tab]) || orders[0];
  const oldestCardOrderId = cardOrders.reduce((oldest, o) => (!oldest || new Date(o.createdAt) < new Date(oldest.createdAt) ? o : oldest), null)?._id;

  return (
    <div className="unified-track-page">
      <div className="unified-track-heading">
        <span><PackageSearch size={22} /></span>
        <div>
          <p>All purchases</p>
          <h1>Track an order</h1>
          <div>Pick a card or Magic Poster order to see its shipment progress.</div>
        </div>
        <div className="track-refresh">
          <button type="button" className="secondary track-refresh-btn" onClick={() => loadData({ refresh: true })} disabled={refreshing}>
            <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'track-refresh-spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {updatedAt && <small>Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
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
            <TrackingResult type={tab} order={selected} profile={profile} isOldestCardOrder={isCard && selected._id === oldestCardOrderId} />
          </section>
        </>
      )}
    </div>
  );
}
