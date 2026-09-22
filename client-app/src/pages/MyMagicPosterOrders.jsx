import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const PAGE_SIZE = 10;

const STATUS_COPY = {
  ordered: { label: 'Ordered', color: 'var(--warning)' },
  shipping: { label: 'Shipping', color: 'var(--holo-cyan)' },
  delivery: { label: 'Out for delivery', color: 'var(--holo-cyan)' },
  completed: { label: 'Completed', color: '#22c55e' },
};

const STATUS_ORDER = ['ordered', 'shipping', 'delivery', 'completed'];

// Same track-stepper shape/markup Track.jsx uses for card orders (see its
// own .track-stepper/.track-step CSS) -- reused here for a searched Magic
// Poster order's detail view instead of just the flat status dot the
// browse list shows.
function buildTrackSteps(order) {
  const statusIndex = STATUS_ORDER.indexOf(order.status);
  return [
    {
      title: 'Order placed',
      detail: `Payment confirmed${order.createdAt ? ' on ' + new Date(order.createdAt).toLocaleDateString() : ''}.`,
      done: true,
    },
    {
      title: 'Shipping',
      detail: order.trackingId
        ? `On its way — tracking ID ${order.trackingId}.`
        : 'Preparing your order for shipment.',
      done: statusIndex >= STATUS_ORDER.indexOf('shipping'),
    },
    {
      title: 'Out for delivery',
      detail: statusIndex >= STATUS_ORDER.indexOf('delivery') ? 'Out for delivery to your address.' : 'Not out for delivery yet.',
      done: statusIndex >= STATUS_ORDER.indexOf('delivery'),
    },
    {
      title: 'Completed',
      detail: statusIndex >= STATUS_ORDER.indexOf('completed') ? 'Delivered — order completed.' : 'Not completed yet.',
      done: statusIndex >= STATUS_ORDER.indexOf('completed'),
    },
  ];
}

// This client's own paid Magic Poster orders (see routes/profile.js's
// GET /magic-poster/orders) -- same Pending -> Delivery -> Completed
// pipeline the admin's own order-tracking page walks orders through.
// Loads 10 at a time via "Load more"; the search box switches into a
// separate tracking-ID lookup mode instead of filtering what's already
// loaded, since a match could be an order further back than what's
// currently on screen.
export default function MyMagicPosterOrders() {
  const [orders, setOrders] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = browsing, array = search mode
  const [searching, setSearching] = useState(false);

  async function loadFirstPage() {
    setLoading(true);
    setError('');
    try {
      const res = await api.listMyMagicPosterOrders({ limit: PAGE_SIZE });
      setOrders(res.orders);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFirstPage();
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    setError('');
    try {
      const res = await api.listMyMagicPosterOrders({ skip: orders.length, limit: PAGE_SIZE });
      setOrders((list) => [...list, ...res.orders]);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setError('');
    setSearching(true);
    try {
      const res = await api.listMyMagicPosterOrders({ q });
      setSearchResults(res.orders);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function handleClearSearch() {
    setQuery('');
    setSearchResults(null);
  }

  const displayed = searchResults !== null ? searchResults : orders;

  return (
    <div>
      <h1>Magic Poster orders</h1>
      <p className="subtitle">Everything you've ordered from the Magic Poster shop, and where it stands.</p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 420 }}>
        <input
          type="text"
          placeholder="Search by order number or tracking ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching} style={{ width: 'auto', padding: '0 18px' }}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        {searchResults !== null && (
          <button type="button" className="secondary" style={{ width: 'auto', padding: '0 18px' }} onClick={handleClearSearch}>
            Clear
          </button>
        )}
      </form>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : displayed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          {searchResults !== null ? (
            <p className="subtitle" style={{ margin: 0 }}>No order found with that order number or tracking ID.</p>
          ) : (
            <>
              <p className="subtitle" style={{ margin: '0 0 12px' }}>You haven't ordered a Magic Poster yet.</p>
              <Link to="/magic-art" className="link-out">Browse Magic Posters →</Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 14 }}>
            {displayed.map((o) => {
              const status = STATUS_COPY[o.status] || STATUS_COPY.ordered;
              return (
                <div key={o._id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{new Date(o.createdAt).toLocaleDateString()}</div>
                      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-dim)' }}>
                        Order #{o.orderNumber}
                      </div>
                      {(o.items || []).map((item, i) => (
                        <div key={i} style={{ fontSize: 14 }}>
                          {item.quantity}× {item.name || '(deleted poster)'}
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>₹{o.amountPaid ?? o.amount}</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
                        {status.label}
                      </div>
                    </div>
                  </div>

                  {searchResults !== null ? (
                    <div className="track-stepper" style={{ margin: '18px 0 4px', maxWidth: 420 }}>
                      {buildTrackSteps(o).map((step, i, steps) => {
                        const currentIndex = steps.findIndex((s) => !s.done);
                        return (
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
                        );
                      })}
                    </div>
                  ) : (
                    o.trackingId && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                        Tracking ID: <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{o.trackingId}</span>
                      </div>
                    )
                  )}

                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                    Delivering to {o.delivery?.name} — {o.delivery?.line1}
                    {o.delivery?.line2 ? `, ${o.delivery.line2}` : ''}, {o.delivery?.city}, {o.delivery?.state},{' '}
                    {o.delivery?.country} - {o.delivery?.pincode}
                  </div>

                  <button
                    type="button"
                    className="secondary"
                    style={{ marginTop: 10, width: 'auto', padding: '4px 12px', fontSize: 12 }}
                    onClick={() => api.downloadMagicPosterInvoice(o._id, o.orderNumber).catch((err) => setError(err.message))}
                  >
                    Download Invoice
                  </button>
                </div>
              );
            })}
          </div>

          {searchResults === null && hasMore && (
            <button
              type="button"
              className="secondary"
              disabled={loadingMore}
              style={{ width: 'auto', padding: '8px 20px', margin: '18px auto 0', display: 'block' }}
              onClick={handleLoadMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
