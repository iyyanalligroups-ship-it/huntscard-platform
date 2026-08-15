import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, isLoggedIn } from '../api.js';
import { loadRazorpayScript } from '../razorpay.js';

function PlanImageGallery({ images }) {
  const [index, setIndex] = useState(0);
  if (!images || images.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--panel-raised)',
          marginBottom: images.length > 1 ? 8 : 0,
        }}
      >
        <img src={images[index]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {images.map((img, i) => (
            <button
              key={img}
              onClick={() => setIndex(i)}
              style={{
                width: 40,
                height: 40,
                padding: 0,
                borderRadius: 6,
                overflow: 'hidden',
                border: i === index ? '2px solid var(--holo-cyan)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Browsing is open to everyone -- anyone can see plans and photos with no
// account. Actually buying requires being logged in: clicking "Choose
// this plan" while logged out sends you to Register instead of opening
// checkout, rather than letting an anonymous guest pay straight through.
//
// Once logged in, two paths:
// - For yourself: pick a plan, pay -- updates YOUR OWN account. No fields
//   needed, we already know who you are.
// - "Buying for someone else" toggled on: pick a plan, enter the
//   recipient's name + email, pay -- creates a SEPARATE new account for
//   them (audit-tracked as purchased by you).
export default function Shop() {
  const loggedIn = isLoggedIn();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [designFrontUrl, setDesignFrontUrl] = useState('');
  const [designBackUrl, setDesignBackUrl] = useState('');
  const [uploadingDesign, setUploadingDesign] = useState(null); // 'front' | 'back' | null
  const [quantity, setQuantity] = useState(1);
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [handoff, setHandoff] = useState(null);
  const [upgraded, setUpgraded] = useState(false);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    Promise.all([
      api.listShopPlans(),
      loggedIn ? api.getProfile() : Promise.resolve(null),
      loggedIn ? api.listMyRequests() : Promise.resolve([]),
    ])
      .then(([pl, profile, reqs]) => {
        setPlans(pl);
        setMyProfile(profile);
        setRequests(reqs.filter((r) => r.type === 'upgrade'));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn]);

  // Deep-link from Catalog.jsx's "Get free design preview" button
  // (/shop?plan=<key>) -- pre-selects that plan and scrolls to checkout,
  // same as clicking "Choose this plan" directly. Runs once plans have
  // actually loaded, so the key can be matched against a real plan.
  useEffect(() => {
    const planKey = searchParams.get('plan');
    if (!planKey || plans.length === 0) return;
    if (plans.some((p) => p.key === planKey)) pickPlan(planKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const hasCard = Boolean(myProfile?.cardType);
  // Show every plan, including the client's current one -- it's marked
  // as "Current Plan" in the card below instead of being hidden, so
  // they can see where they stand relative to the other tiers. Buying
  // for someone else never marks anything as "current" (that's about
  // the client's own account, not the recipient's).
  function isCurrentPlan(p) {
    return loggedIn && hasCard && !forSomeoneElse && p.key === myProfile.cardType;
  }
  const visiblePlans = plans;
  const selectedPlan = visiblePlans.find((p) => p.key === selectedKey);

  function pickPlan(key) {
    if (!loggedIn) {
      navigate('/register');
      return;
    }
    setSelectedKey(key);
    setSelectedVariantId('');
    setDesignFrontUrl('');
    setDesignBackUrl('');
    setQuantity(1);
    setError('');
    setHandoff(null);
    setUpgraded(false);
    setTimeout(() => document.getElementById('checkout-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function handleDesignUpload(side, file) {
    if (!file) return;
    setUploadingDesign(side);
    setError('');
    try {
      const { url } = await api.uploadDesign(file);
      if (side === 'front') setDesignFrontUrl(url);
      else setDesignBackUrl(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingDesign(null);
    }
  }

  const MAX_QUANTITY = 20; // matches the backend's cap
  const totalAmount = selectedPlan?.chargeAmount ? selectedPlan.chargeAmount * quantity : null;

  async function runCheckout({ createOrder, confirmPayment, description }) {
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
        prefill: forSomeoneElse ? { name: fullName, email: loginEmail } : { name: myProfile?.fullName, email: myProfile?.loginEmail },
        handler: async (response) => {
          try {
            const result = await confirmPayment(response);
            resolve(result);
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

  const variantOk = !selectedPlan?.variants?.length || Boolean(selectedVariantId);
  const designOk = !selectedPlan?.requiresDesignUpload || Boolean(designFrontUrl && designBackUrl);

  async function handleCheckout(e) {
    e.preventDefault();
    if (!loggedIn || !selectedPlan) return;
    if (forSomeoneElse && (!fullName || !loginEmail)) return;

    if (!selectedPlan.chargeAmount) {
      setError('This plan isn\'t available for instant checkout yet — please contact us to order it.');
      return;
    }
    if (!variantOk) {
      setError('Choose a card style before checking out.');
      return;
    }
    if (!designOk) {
      setError('Upload both a front and back design before checking out.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const qtySuffix = quantity > 1 ? ` × ${quantity}` : '';
      if (forSomeoneElse) {
        // Buy for someone else -- new account, audit-tracked as purchased by
        // you. Quantity here means N physical copies of THEIR one profile,
        // not N separate people.
        const result = await runCheckout({
          createOrder: () =>
            api.createNewCardOrder({ requestedPlan: selectedKey, recipientName: fullName, recipientEmail: loginEmail, quantity }),
          confirmPayment: (response) =>
            api.confirmNewCardPayment({
              requestedPlan: selectedKey,
              recipientName: fullName,
              recipientEmail: loginEmail,
              cardVariantId: selectedVariantId || undefined,
              designFrontUrl: designFrontUrl || undefined,
              designBackUrl: designBackUrl || undefined,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          description: `${selectedPlan.name} card${qtySuffix} — for ${fullName}`,
        });
        setHandoff(result);
        setFullName('');
        setLoginEmail('');
      } else {
        // Buy/upgrade your own account. Quantity = spare physical copies of
        // your own profile, still just the one account.
        const result = await runCheckout({
          createOrder: () => api.createUpgradeOrder(selectedKey, quantity),
          confirmPayment: (response) =>
            api.confirmUpgradePayment({
              requestedPlan: selectedKey,
              cardVariantId: selectedVariantId || undefined,
              designFrontUrl: designFrontUrl || undefined,
              designBackUrl: designBackUrl || undefined,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          description: `${selectedPlan.name} card${qtySuffix}`,
        });
        setUpgraded(result.quantity || 1);
        const [fresh, reqs] = await Promise.all([api.getProfile(), api.listMyRequests()]);
        setMyProfile(fresh);
        setRequests(reqs.filter((r) => r.type === 'upgrade'));
      }
      setSelectedKey('');
      setSelectedVariantId('');
      setDesignFrontUrl('');
      setDesignBackUrl('');
      setQuantity(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="subtitle" style={{ textAlign: 'center' }}>Loading plans…</p>;

  if (handoff) {
    return (
      <div className="checkout-panel">
        <h2 className="section-heading" style={{ marginTop: 0 }}>Card created! 🎉</h2>
        <p className="section-subheading">Send these to the card owner — shown once.</p>
        <div className="handoff-ticket">
          <div className="handoff-title">
            <span className="ripple-glyph">
              <span className="ring" />
            </span>
            Login details
          </div>
          <div className="handoff-row">
            <span>Login email</span>
            <span>{handoff.loginEmail}</span>
          </div>
          <div className="handoff-row">
            <span>Temporary password</span>
            <span>{handoff.tempPassword}</span>
          </div>
          <div className="handoff-row">
            <span>Card type</span>
            <span>{handoff.cardType}</span>
          </div>
          <div className="handoff-row">
            <span>Their card page</span>
            <span>{handoff.publicUrl}</span>
          </div>
          {handoff.quantity > 1 && (
            <div className="handoff-row">
              <span>Physical cards to encode</span>
              <span>{handoff.quantity} (same profile)</span>
            </div>
          )}
        </div>
        <button
          style={{ marginTop: 20 }}
          onClick={() => {
            setHandoff(null);
            setForSomeoneElse(false);
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>
        {forSomeoneElse ? 'Buy a card for someone else' : loggedIn ? (hasCard ? 'Upgrade your card' : 'Get your card') : 'Choose your card'}
      </h1>
      <p className="section-subheading">
        {forSomeoneElse
          ? 'Creates a separate account for them — pick a plan, enter their details, pay.'
          : loggedIn
          ? hasCard
            ? `You're currently on ${myProfile.cardType}.`
            : "You don't have a card yet — pick a plan below."
          : "Browse freely — you'll need an account to actually buy."}
      </p>

      {loggedIn && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'center',
            marginBottom: 24,
            fontSize: 13,
            color: 'var(--text-dim)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={forSomeoneElse}
            onChange={(e) => {
              setForSomeoneElse(e.target.checked);
              setSelectedKey('');
              setError('');
              setHandoff(null);
            }}
            style={{ width: 'auto' }}
          />
          Buying this for someone else?
        </label>
      )}

      {upgraded && !error && (
        <p className="section-subheading" style={{ color: 'var(--holo-cyan)', fontWeight: 600 }}>
          Payment successful — your card is {hasCard ? 'updated' : 'ready'}!
          {upgraded > 1 ? ` You're getting ${upgraded} physical cards, all with your profile.` : ''}
        </p>
      )}

      {visiblePlans.length === 0 ? (
        <p className="subtitle" style={{ textAlign: 'center' }}>No other plans available right now.</p>
      ) : (
        <div className="shop-grid">
          {visiblePlans.map((p) => {
            const current = isCurrentPlan(p);
            return (
              <div key={p.key} className={`shop-plan-card${selectedKey === p.key ? ' selected' : ''}${current ? ' current' : ''}`}>
                {current && (
                  <div
                    style={{
                      display: 'inline-block',
                      background: 'var(--holo-gradient)',
                      color: '#06120f',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      marginBottom: 8,
                    }}
                  >
                    Current Plan
                  </div>
                )}
                <PlanImageGallery images={p.images} />
                <div className="shop-plan-name">{p.name}</div>
                <div className="shop-plan-price">{p.chargeAmount ? `₹${p.chargeAmount}` : p.price || 'Contact us'}</div>
                <p className="shop-plan-desc">{p.description || 'A HuntsTAG smart card, tap-to-share ready.'}</p>
                {p.variants?.length > 0 && (
                  <p className="shop-plan-desc" style={{ color: 'var(--holo-cyan)', fontSize: 12, fontWeight: 600, marginTop: -8 }}>
                    Available in: {p.variants.map((v) => `${v.name} (${v.shape === 'vertical' ? 'Vertical' : 'Horizontal'})`).join(', ')}
                  </p>
                )}
                <button onClick={() => pickPlan(p.key)}>
                  {!loggedIn
                    ? 'Log in to buy'
                    : selectedKey === p.key
                    ? 'Selected'
                    : current
                    ? 'Buy again'
                    : 'Choose this plan'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {loggedIn && selectedPlan && (
        <div className="checkout-panel" id="checkout-panel">
          <div className="card">
            <h2 style={{ fontSize: 16, marginTop: 0 }}>
              Checkout — {selectedPlan.name}{' '}
              {selectedPlan.chargeAmount ? <span style={{ color: 'var(--holo-cyan)' }}>₹{selectedPlan.chargeAmount}</span> : null}
            </h2>

            {error && <div className="error-banner">{error}</div>}

            <form onSubmit={handleCheckout}>
              {selectedPlan.variants?.length > 0 && (
                <div className="field">
                  <label htmlFor="cardVariant">Card style</label>
                  <select
                    id="cardVariant"
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    required
                  >
                    <option value="">Choose a style…</option>
                    {selectedPlan.variants.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.name} — {v.shape === 'vertical' ? 'Vertical' : 'Horizontal'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedPlan.requiresDesignUpload && (
                <>
                  <div className="field">
                    <label htmlFor="designFront">Front design (image)</label>
                    <input
                      id="designFront"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleDesignUpload('front', e.target.files[0])}
                      disabled={uploadingDesign === 'front'}
                    />
                    {uploadingDesign === 'front' && <p className="hint">Uploading…</p>}
                    {designFrontUrl && (
                      <img src={designFrontUrl} alt="Front design preview" style={{ width: 120, marginTop: 8, borderRadius: 6 }} />
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="designBack">Back design (image)</label>
                    <input
                      id="designBack"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleDesignUpload('back', e.target.files[0])}
                      disabled={uploadingDesign === 'back'}
                    />
                    {uploadingDesign === 'back' && <p className="hint">Uploading…</p>}
                    {designBackUrl && (
                      <img src={designBackUrl} alt="Back design preview" style={{ width: 120, marginTop: 8, borderRadius: 6 }} />
                    )}
                  </div>
                  <p className="hint">We'll print this artwork on your card exactly as uploaded.</p>
                </>
              )}
              {selectedPlan.chargeAmount && (
                <div className="field">
                  <label htmlFor="cardQuantity">
                    How many cards? <span className="hint" style={{ fontWeight: 400 }}>(extra physical copies of the same profile)</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: 40, padding: 0 }}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      id="cardQuantity"
                      type="number"
                      min={1}
                      max={MAX_QUANTITY}
                      value={quantity}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setQuantity(Number.isFinite(n) ? Math.min(MAX_QUANTITY, Math.max(1, n)) : 1);
                      }}
                      style={{ width: 64, textAlign: 'center' }}
                    />
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: 40, padding: 0 }}
                      onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                      disabled={quantity >= MAX_QUANTITY}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    {quantity > 1 && (
                      <span className="hint" style={{ marginBottom: 0 }}>
                        ₹{selectedPlan.chargeAmount} × {quantity} = <strong style={{ color: 'var(--text)' }}>₹{totalAmount}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
              {forSomeoneElse && (
                <>
                  <div className="field">
                    <label htmlFor="fullName">Card owner's full name</label>
                    <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="field">
                    <label htmlFor="loginEmail">Card owner's login email</label>
                    <input
                      id="loginEmail"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                    <p className="hint" style={{ marginBottom: 0 }}>Must be different from your own login.</p>
                  </div>
                </>
              )}
              <button type="submit" disabled={submitting || !selectedPlan.chargeAmount || !variantOk || !designOk}>
                {submitting
                  ? 'Waiting for payment…'
                  : !selectedPlan.chargeAmount
                  ? 'Not available for instant checkout'
                  : !variantOk
                  ? 'Choose a card style'
                  : !designOk
                  ? 'Upload front & back design'
                  : `Pay ₹${totalAmount}`}
              </button>
            </form>
            {!selectedPlan.chargeAmount && (
              <p className="hint" style={{ marginTop: 10 }}>
                This plan needs manual setup — <Link to="/contact" className="link-out">contact us</Link> to order it.
              </p>
            )}
          </div>
        </div>
      )}

      {loggedIn && !forSomeoneElse && requests.length > 0 && (
        <div className="checkout-panel" style={{ marginTop: 32 }}>
          <p className="hint" style={{ marginBottom: 8 }}>Your purchase history</p>
          {requests.map((r) => (
            <div key={r._id} className="request-row">
              <span>
                {r.requestedPlan}
                {r.paymentStatus === 'paid' && <span style={{ color: 'var(--holo-cyan)' }}> · Paid</span>}
              </span>
              <span className="request-status">{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
