import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Clock3, CreditCard, Download, Image, MapPin, ShoppingBag, Truck } from 'lucide-react';
import { api } from '../api.js';

const PAGE_SIZE = 10;

const STATUS_COPY = {
  ordered: 'Ordered',
  shipping: 'Shipping',
  delivery: 'Out for delivery',
  completed: 'Completed',
};

// This client's own paid Magic Poster orders (see routes/profile.js's
// GET /magic-poster/orders) -- same Pending -> Delivery -> Completed
// pipeline the admin's own order-tracking page walks orders through.
// Rendered with the same expandable-row style as the card purchase
// history in Shop.jsx (it lives in that page's "Magic Poster history"
// tab). Loads 10 at a time via "Load more". Cross-product tracking lives
// on /dashboard/track.
export default function MyMagicPosterOrders({ embedded = false }) {
  const [orders, setOrders] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

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

  return (
    <div>
      {!embedded && (
        <>
          <h1>Magic Poster orders</h1>
          <p className="subtitle">Your Magic Poster purchase history. Use <Link to="/dashboard/track" className="link-out">Track Orders</Link> to look up any shipment.</p>
        </>
      )}

      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 8px' }}>
          <span className="hint">Your Magic Poster orders</span>
          <Link to="/magic-art" className="link-out">Buy a Magic Poster →</Link>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <p className="subtitle" style={{ margin: '0 0 12px' }}>You haven't ordered a Magic Poster yet.</p>
          <Link to="/magic-art" className="link-out">Browse Magic Posters →</Link>
        </div>
      ) : (
        <>
          {orders.map((o) => {
            const expanded = expandedId === o._id;
            const items = o.items || [];
            const first = items[0];
            const title = first ? first.name || '(deleted poster)' : 'Magic Poster';
            const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const status = STATUS_COPY[o.status] || STATUS_COPY.ordered;
            function toggle() {
              setExpandedId(expanded ? null : o._id);
            }
            return (
              <div key={o._id} className="request-row-wrap">
                <div
                  className="request-row request-row-toggle"
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={toggle}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                >
                  <span>
                    {title}
                    {items.length > 1 && <span className="hint" style={{ marginLeft: 4 }}>+ {items.length - 1} more</span>}
                    {totalQty > 1 && items.length === 1 && <span className="hint" style={{ marginLeft: 4 }}>× {totalQty}</span>}
                    <span style={{ color: 'var(--holo-cyan)' }}> · Paid</span>
                    <small className="card-order-number">{o.orderNumber}</small>
                  </span>
                  <span className="card-request-actions">
                    <span className="request-status">{status}</span>
                    <button
                      type="button"
                      className="secondary card-invoice-button"
                      onClick={(e) => { e.stopPropagation(); api.downloadMagicPosterInvoice(o._id, o.orderNumber).catch((err) => setError(err.message)); }}
                    >
                      <Download size={14} aria-hidden="true" />Invoice
                    </button>
                    <ChevronDown size={16} className="request-row-chevron" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                  </span>
                </div>

                {expanded && (
                  <div className="request-row-detail">
                    <div className="purchase-detail-sections">
                      <section className="purchase-detail-section">
                        <div className="purchase-detail-section-title"><ShoppingBag size={15} /><div><strong>Order items</strong><span>Posters and quantities</span></div></div>
                        <div className="purchase-detail-items">
                          {items.map((item, i) => (
                            <div key={i} className="purchase-detail-item">
                              <div className="purchase-detail-item-image"><Image size={18} aria-hidden="true" /></div>
                              <div><strong>{item.name || '(deleted poster)'}</strong><span>{item.quantity} {Number(item.quantity) === 1 ? 'poster' : 'posters'}</span></div>
                              {item.unitPrice != null && <b>₹{item.unitPrice * item.quantity}</b>}
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="purchase-detail-section">
                        <div className="purchase-detail-section-title"><CreditCard size={15} /><div><strong>Payment summary</strong><span>Verified checkout amount</span></div></div>
                        <div className="request-detail-totals purchase-detail-totals">
                          {o.subtotal != null && <div><span>Poster subtotal</span><span>₹{o.subtotal}</span></div>}
                          {o.deliveryFee != null && <div><span>Delivery</span><span>₹{o.deliveryFee}</span></div>}
                          {o.gstAmount != null && <div><span>GST ({o.gstPercent}%)</span><span>₹{o.gstAmount}</span></div>}
                          <div className="request-detail-total"><span>Total paid</span><span>₹{o.amountPaid ?? o.amount}</span></div>
                        </div>
                      </section>

                      {o.delivery?.line1 && (
                        <section className="purchase-detail-section">
                          <div className="purchase-detail-section-title"><MapPin size={15} /><div><strong>Delivery address</strong><span>Shipping destination</span></div></div>
                          <div className="request-detail-address purchase-detail-address">
                            <strong>{o.delivery.name}{o.delivery.phone ? ` · ${o.delivery.phone}` : ''}</strong>
                            <span>{o.delivery.line1}{o.delivery.line2 ? `, ${o.delivery.line2}` : ''}</span>
                            <span>{o.delivery.city}, {o.delivery.state} - {o.delivery.pincode}</span>
                            <span>{o.delivery.country}</span>
                          </div>
                        </section>
                      )}

                      <section className="purchase-detail-section">
                        <div className="purchase-detail-section-title"><Truck size={15} /><div><strong>Fulfillment</strong><span>Tracking and delivery progress</span></div></div>
                        <div className="purchase-fulfillment-grid">
                          <div><span>Status</span><strong>{status}</strong></div>
                          <div><span>Tracking ID</span><strong>{o.trackingId || 'Not dispatched yet'}</strong></div>
                        </div>
                      </section>

                      <section className="purchase-detail-section purchase-detail-date-section">
                        <div className="purchase-detail-section-title"><Clock3 size={15} /><div><strong>Order date</strong><span>{o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not available'}</span></div></div>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
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
