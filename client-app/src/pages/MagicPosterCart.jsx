import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, isLoggedIn } from '../api.js';
import { loadRazorpayScript } from '../razorpay.js';
import { useCart } from '../cart.jsx';
import GeoSelect from '../components/GeoSelect.jsx';

// India only, on purpose -- deliveries only ever ship within India, so
// there's no real Country field for the person to fill in, just State ->
// City. Kept as ISO code + display name (like the state/city values
// below) so handleStateChange's api.getStates/getCities calls don't need
// their own special case for it.
const COUNTRY_ISO = 'IN';
const COUNTRY_NAME = 'India';

const EMPTY_FORM = {
  label: '',
  name: '',
  phone: '',
  line1: '',
  line2: '',
  countryIso: COUNTRY_ISO,
  countryName: COUNTRY_NAME,
  stateIso: '',
  stateName: '',
  cityName: '',
  pincode: '',
};

// Checkout for the Magic Poster cart (see cart.jsx) -- gated entirely
// behind login (PublicLayout's openLogin, via Outlet context, pops the
// real login modal and sends the visitor straight back here on success),
// then a saved-address book (pick one, or add a new one via a cascading
// State -> City dropdown, pincode typed manually -- see routes/public.js's
// geo endpoints for why pincode isn't auto-loaded), then Razorpay
// payment. Same runCheckout wrapper pattern Shop.jsx uses.
export default function MagicPosterCart() {
  const cart = useCart();
  const { openLogin } = useOutletContext();
  const loggedIn = isLoggedIn();

  const [addresses, setAddresses] = useState(null); // null = loading
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [savingAddress, setSavingAddress] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(null); // { amount } once an order is successfully paid

  useEffect(() => {
    if (!loggedIn) openLogin('/magic-poster-cart');
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    api
      .listAddresses()
      .then((list) => {
        setAddresses(list);
        const preferred = list.find((a) => a.isDefault) || list[0];
        if (preferred) setSelectedAddressId(preferred._id);
        else setShowAddForm(true);
      })
      .catch((err) => setError(err.message));
    api
      .getProfile()
      .then((profile) => setForm((f) => ({ ...f, name: f.name || profile.fullName || '', phone: f.phone || profile.phone || '' })))
      .catch(() => {});
    api.getStates(COUNTRY_ISO).then(setStates).catch(() => {});
  }, [loggedIn]);

  function handleStateChange(option) {
    setForm((f) => ({ ...f, stateIso: option.value, stateName: option.label, cityName: '' }));
    setCities([]);
    api.getCities(COUNTRY_ISO, option.value).then(setCities).catch(() => {});
  }

  function handleCityChange(option) {
    updateField('cityName', option.value);
  }

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Digits only, capped at the real-world max length -- filtered as the
  // person types rather than only checked on submit, so a pasted/typed
  // non-digit or 11th digit just never shows up in the field.
  function handlePhoneChange(raw) {
    updateField('phone', raw.replace(/\D/g, '').slice(0, 10));
  }
  function handlePincodeChange(raw) {
    updateField('pincode', raw.replace(/\D/g, '').slice(0, 6));
  }

  async function handleSaveAddress(e) {
    e.preventDefault();
    setError('');
    if (form.phone.length !== 10) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    if (form.pincode.length !== 6) {
      setError('Enter a valid 6-digit pincode.');
      return;
    }
    if (!form.countryName || !form.stateName || !form.cityName) {
      setError('Choose a country, state and city.');
      return;
    }
    setSavingAddress(true);
    try {
      const created = await api.createAddress({
        label: form.label,
        name: form.name,
        phone: form.phone,
        line1: form.line1,
        line2: form.line2,
        country: form.countryName,
        state: form.stateName,
        city: form.cityName,
        pincode: form.pincode,
        isDefault: (addresses?.length || 0) === 0,
      });
      setAddresses((list) => [created, ...(list || [])]);
      setSelectedAddressId(created._id);
      setShowAddForm(false);
      setForm((f) => ({ ...EMPTY_FORM, name: f.name, phone: f.phone }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAddress(false);
    }
  }

  async function runCheckout({ createOrder, confirmPayment, description, contact }) {
    const order = await createOrder();
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) throw new Error('Could not load the payment window. Check your connection and try again.');

    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'HuntsTAG',
        description,
        prefill: contact,
        handler: async (response) => {
          try {
            resolve(await confirmPayment(response, order));
          } catch (err) {
            reject(err);
          }
        },
        modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
        theme: { color: '#8b5cf6' },
      });
      rzp.on('payment.failed', (resp) => reject(new Error(resp.error?.description || 'Payment failed.')));
      rzp.open();
    });
  }

  async function handlePay(e) {
    e.preventDefault();
    if (cart.items.length === 0) return;
    const selected = (addresses || []).find((a) => a._id === selectedAddressId);
    if (!selected) {
      setError('Choose or add a delivery address first.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = await runCheckout({
        createOrder: () =>
          api.createMagicPosterOrder(
            cart.items.map((i) => ({ magicArtId: i.magicArtId, quantity: i.quantity })),
            {
              name: selected.name,
              phone: selected.phone,
              line1: selected.line1,
              line2: selected.line2,
              country: selected.country,
              state: selected.state,
              city: selected.city,
              pincode: selected.pincode,
            }
          ),
        confirmPayment: (response, order) =>
          api.confirmMagicPosterPayment({
            mongoOrderId: order.mongoOrderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        description: `${cart.totalCount} Magic Poster item${cart.totalCount > 1 ? 's' : ''}`,
        contact: { name: selected.name, contact: selected.phone },
      });
      setPlaced({ amount: result.amountPaid });
      cart.clear();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '60px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20 }}>Log in to view your cart</h1>
        <p className="subtitle">Your Magic Poster cart and delivery details are saved to your account.</p>
        <button onClick={() => openLogin('/magic-poster-cart')}>Log in</button>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>Order placed 🎉</h1>
        <p className="subtitle">
          Thanks! Your payment of ₹{placed.amount} went through and your order is now <b>Pending</b>. We'll get it
          on its way soon.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 className="section-heading" style={{ marginTop: 0 }}>Your cart</h1>

      {error && <div className="error-banner">{error}</div>}

      {cart.items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="subtitle" style={{ margin: 0 }}>Your cart is empty.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            {cart.items.map((item) => (
              <div
                key={item.magicArtId}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}
              >
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} style={{ width: 48, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div className="hint">₹{item.unitPrice} each</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: 28, height: 28, padding: 0 }}
                    onClick={() => cart.updateQuantity(item.magicArtId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span style={{ minWidth: 18, textAlign: 'center' }}>{item.quantity}</span>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: 28, height: 28, padding: 0 }}
                    onClick={() => cart.updateQuantity(item.magicArtId, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <div style={{ minWidth: 70, textAlign: 'right', fontWeight: 600 }}>₹{item.unitPrice * item.quantity}</div>
                <button
                  type="button"
                  className="secondary"
                  style={{ width: 'auto', padding: '4px 10px', color: 'var(--danger)' }}
                  onClick={() => cart.removeItem(item.magicArtId)}
                >
                  Remove
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 700 }}>
              <span>Total</span>
              <span>₹{cart.totalAmount}</span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Deliver to</h2>

            {addresses === null ? (
              <p className="subtitle">Loading your addresses…</p>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                {addresses.map((a) => (
                  <label
                    key={a._id}
                    className="card"
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      border: selectedAddressId === a._id ? '2px solid var(--accent, #8b5cf6)' : '1px solid var(--border)',
                    }}
                  >
                    <input
                      type="radio"
                      name="deliveryAddress"
                      checked={selectedAddressId === a._id}
                      onChange={() => {
                        setSelectedAddressId(a._id);
                        setShowAddForm(false);
                      }}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>
                      <div style={{ fontWeight: 600 }}>
                        {a.label ? `${a.label} — ` : ''}
                        {a.name} · {a.phone}
                      </div>
                      <div style={{ color: 'var(--text-dim)' }}>
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state}, {a.country} - {a.pincode}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button type="button" className="secondary" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => setShowAddForm((s) => !s)}>
              {showAddForm ? 'Cancel' : '+ Add new address'}
            </button>

            {showAddForm && (
              <form onSubmit={handleSaveAddress} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Label (optional)
                  <input type="text" placeholder="e.g. Home" value={form.label} onChange={(e) => updateField('label', e.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1 }}>
                    Full name
                    <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1 }}>
                    Phone
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={form.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Address line 1
                  <input type="text" value={form.line1} onChange={(e) => updateField('line1', e.target.value)} required />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Address line 2 (optional)
                  <input type="text" value={form.line2} onChange={(e) => updateField('line2', e.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1, minWidth: 140 }}>
                    Country
                    <GeoSelect
                      value={COUNTRY_ISO}
                      options={[{ value: COUNTRY_ISO, label: COUNTRY_NAME }]}
                      onChange={() => {}}
                      disabled
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1, minWidth: 140 }}>
                    State
                    <GeoSelect
                      value={form.stateIso}
                      options={states.map((s) => ({ value: s.isoCode, label: s.name }))}
                      onChange={handleStateChange}
                      placeholder="Select state"
                      searchPlaceholder="Search states…"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1, minWidth: 140 }}>
                    City
                    <GeoSelect
                      value={form.cityName}
                      options={cities.map((cityName) => ({ value: cityName, label: cityName }))}
                      onChange={handleCityChange}
                      placeholder="Select city"
                      searchPlaceholder="Search cities…"
                      disabled={!form.stateIso}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1, minWidth: 100 }}>
                    Pincode
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={form.pincode}
                      onChange={(e) => handlePincodeChange(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <button type="submit" disabled={savingAddress} style={{ width: 'auto', padding: '8px 16px' }}>
                  {savingAddress ? 'Saving…' : 'Save address'}
                </button>
              </form>
            )}
          </div>

          <button type="button" disabled={submitting || !selectedAddressId} onClick={handlePay}>
            {submitting ? 'Processing…' : `Pay ₹${cart.totalAmount}`}
          </button>
        </>
      )}
    </div>
  );
}
