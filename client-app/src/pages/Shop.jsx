import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, isLoggedIn } from '../api.js';
import { loadRazorpayScript } from '../razorpay.js';

const PLAN_DISPLAY_ORDER = ['premium', 'elite', 'nova', 'custom', 'apex'];

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

// Which of the plan's boolean feature flags (set by admin on the Card
// Plans screen, see models/CardPlan.js) actually apply, shown as small
// badges so a shopper can see what they're getting before they buy --
// mirrors the admin's own checkbox labels exactly.
const PLAN_FEATURE_BADGES = [
  {
    key: 'arEnabled',
    icon: '🥽',
    label: 'AR feature',
    note: 'Anyone who scans your card can point their phone camera at it to unlock an AR experience.',
  },
  {
    key: 'zingEnabled',
    icon: '⚡',
    label: 'Zing',
    note: 'Share your contact card instantly from your dashboard with a tap — no app needed on their end.',
  },
  {
    key: 'requiresDesignUpload',
    icon: '🎨',
    label: 'Requires design upload',
    note: "You'll upload your own front and back artwork for this card during checkout.",
  },
  {
    key: 'magicEnabled',
    icon: '✨',
    label: 'Magic AR feature',
    note: 'Add your own photo or video effect that plays when someone scans your card in Magic Camera.',
  },
  {
    key: 'isSpecialEdition',
    icon: '🔊',
    label: 'Special Edition (Sound)',
    note: 'Comes with a custom sound effect that plays when your card is scanned.',
  },
];

// Compact pills give the at-a-glance summary; the plain-language notes
// right below spell out what each one actually means for someone who's
// never heard "Zing" or "Magic AR" before deciding whether to buy.
function PlanFeatureBadges({ plan }) {
  const active = PLAN_FEATURE_BADGES.filter((f) => plan?.[f.key]);
  if (active.length === 0) return null;
  return (
    <>
      <div className="plan-feature-badges">
        {active.map((f) => (
          <span key={f.key} className="plan-feature-badge">
            <span aria-hidden="true">{f.icon}</span> {f.label}
          </span>
        ))}
      </div>
      <ul className="plan-feature-notes">
        {active.map((f) => (
          <li key={f.key}>
            <span aria-hidden="true">{f.icon}</span>
            <span>
              <strong>{f.label}</strong> — {f.note}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// One slot (front or back) of a variant's own product photo -- falls back
// to a plain labeled box when admin hasn't uploaded that side yet, rather
// than a broken image or blank gap.
function VariantPhoto({ url, label }) {
  return (
    <div
      style={{
        width: 52,
        height: 68,
        borderRadius: 7,
        overflow: 'hidden',
        background: 'var(--panel)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        color: 'var(--text-dim)',
        flexShrink: 0,
      }}
    >
      {url ? <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : label}
    </div>
  );
}

// Left-side image panel of the plan detail view -- a big side-by-side
// front + back preview of whichever variant is currently "focused" (both
// shown at once, not one hidden behind a hover), Prev/Next arrows, and a
// thumbnail strip of every variant below it for jumping straight to one.
// Purely browsing: it doesn't pick a style for purchase itself (that's
// the quantity steppers on the right, which support choosing several
// styles at once) -- clicking a thumbnail or Next/Prev just changes what's
// previewed here and which card is highlighted on the right.
function PlanHeroMedia({ variants, focusIndex, onFocusChange }) {
  const variant = variants[focusIndex] || variants[0];
  const multi = variants.length > 1;
  // Horizontal card designs are landscape -- squeezing front+back side by
  // side into two narrow portrait boxes (sized for vertical designs)
  // crushed them down to a sliver. Stacking front above back instead lets
  // each box use the landscape shape the design actually is.
  const isHorizontal = variant?.shape === 'horizontal';

  return (
    <div className="checkout-modal-media-col">
      <div className={`checkout-modal-media-pair${isHorizontal ? ' horizontal' : ''}`}>
        <div className="checkout-modal-media-single">
          {variant?.frontImageUrl ? (
            <img src={variant.frontImageUrl} alt={`${variant?.name} front`} />
          ) : (
            <span className="checkout-modal-media-empty">No front photo yet</span>
          )}
          <span className="checkout-modal-media-tag">Front</span>
        </div>
        <div className="checkout-modal-media-single">
          {variant?.backImageUrl ? (
            <img src={variant.backImageUrl} alt={`${variant?.name} back`} />
          ) : (
            <span className="checkout-modal-media-empty">No back photo yet</span>
          )}
          <span className="checkout-modal-media-tag">Back</span>
        </div>
      </div>
      <div className="checkout-modal-media-caption">
        {variant?.name}
        {variant?.shape ? ` · ${variant.shape === 'vertical' ? 'Vertical' : 'Horizontal'}` : ''}
      </div>
      {multi && (
        <div className="plan-hero-thumbs-row">
          <button
            type="button"
            className="checkout-modal-media-nav"
            onClick={() => onFocusChange((focusIndex - 1 + variants.length) % variants.length)}
            aria-label="Previous style"
          >
            ‹
          </button>
          <div className="plan-hero-thumbs">
            {variants.map((v, i) => (
              <button
                key={v._id}
                type="button"
                className={`plan-hero-thumb${i === focusIndex ? ' active' : ''}`}
                onClick={() => onFocusChange(i)}
                title={v.name}
              >
                {v.frontImageUrl ? <img src={v.frontImageUrl} alt={v.name} /> : <span>{i + 1}</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="checkout-modal-media-nav"
            onClick={() => onFocusChange((focusIndex + 1) % variants.length)}
            aria-label="Next style"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

// Browsing is open to everyone -- anyone can see plans and photos with no
// account. Actually buying requires being logged in: clicking "Choose
// this plan" while logged out sends you to Register instead of opening
// checkout, rather than letting an anonymous guest pay straight through.
// Once logged in, picking a plan and paying updates YOUR OWN account --
// no extra fields needed, we already know who you are.
export default function Shop() {
  const loggedIn = isLoggedIn();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [selectedKey, setSelectedKey] = useState('');
  // Which variant the detail view's left-side image preview is showing --
  // browsing-only, independent of which styles/quantities are actually
  // in the order (variantQuantities, below).
  const [focusIndex, setFocusIndex] = useState(0);
  // { [variantId]: quantity } -- lets one order mix several of the
  // plan's own variants (e.g. 1x "White Night" + 1x "Revenge Red"),
  // instead of forcing a single style for the whole order. Only used
  // for a plan that actually has variants; a plan with none keeps using
  // the plain `quantity` state below unchanged.
  const [variantQuantities, setVariantQuantities] = useState({});
  const [designFrontUrl, setDesignFrontUrl] = useState('');
  const [designBackUrl, setDesignBackUrl] = useState('');
  const [uploadingDesign, setUploadingDesign] = useState(null); // 'front' | 'back' | null
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgraded, setUpgraded] = useState(false);
  const [requests, setRequests] = useState([]);
  // Same admin-toggled setting PublicLayout.jsx's header/footer follow --
  // fetched independently here (rather than threaded down as a prop)
  // because this page is mounted two different ways: standalone on the
  // public site at /shop, and inside the dashboard at /dashboard/upgrade
  // (where .dash-shell already carries .theme-orange from Layout.jsx, so
  // this is redundant-but-harmless there). Only the public /shop mount
  // actually needs it -- nothing else on that route puts .theme-orange
  // anywhere near this page's own content.
  const [homeTheme, setHomeTheme] = useState('default');

  useEffect(() => {
    api
      .getSiteSettings()
      .then((s) => setHomeTheme(s.homeTheme || 'default'))
      .catch(() => {});
  }, []);

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
  // (/shop?plan=<key>) -- pre-selects that plan in the detail view below,
  // same as clicking its switcher pill directly. Runs once plans have
  // actually loaded, so the key can be matched against a real plan.
  useEffect(() => {
    const planKey = searchParams.get('plan');
    if (!planKey || plans.length === 0) return;
    if (plans.some((p) => p.key === planKey)) selectPlan(planKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const hasCard = Boolean(myProfile?.cardType);
  // Show every plan, including the client's current one -- it's marked
  // as "Current Plan" in the card below instead of being hidden, so
  // they can see where they stand relative to the other tiers.
  function isCurrentPlan(p) {
    return loggedIn && hasCard && p.key === myProfile.cardType;
  }
  // Fixed display order (Premium, Elite, Nova, Custom, then Apex last) --
  // independent of the plans' own DB insertion order/keys, which don't
  // line up with this at all (e.g. the "Premium" plan's key is "basic").
  // Matched by name keyword rather than key since that's the stable,
  // human-meaningful identifier here. Anything that doesn't match one of
  // these keywords (a future new plan) falls back to the end, not lost.
  const visiblePlans = [...plans].sort((a, b) => {
    const rank = (p) => {
      const i = PLAN_DISPLAY_ORDER.findIndex((k) => p.name.toLowerCase().includes(k));
      return i === -1 ? PLAN_DISPLAY_ORDER.length : i;
    };
    return rank(a) - rank(b);
  });
  const selectedPlan = visiblePlans.find((p) => p.key === selectedKey);

  // Switching plans is just browsing -- unlike the old "Choose this plan"
  // button, it never requires being logged in (only the actual Pay step,
  // in handleCheckout, does that).
  function selectPlan(key) {
    setSelectedKey(key);
    setVariantQuantities({});
    setFocusIndex(0);
    setDesignFrontUrl('');
    setDesignBackUrl('');
    setQuantity(1);
    setError('');
    setUpgraded(false);
  }

  // Default to a plan as soon as there's one to show: the client's
  // current plan if they have one (so "Upgrade your card" opens already
  // showing what they're on), otherwise just the first plan in the list.
  useEffect(() => {
    if (loading || selectedKey || visiblePlans.length === 0) return;
    const current = loggedIn && hasCard ? visiblePlans.find((p) => p.key === myProfile.cardType) : null;
    setSelectedKey((current || visiblePlans[0]).key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visiblePlans, selectedKey]);

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
  const hasVariants = Boolean(selectedPlan?.variants?.length);
  const hasVariantImages = hasVariants && selectedPlan.variants.some((v) => v.frontImageUrl || v.backImageUrl);
  // Only entries someone actually bumped above 0 -- a variant left at 0
  // isn't part of the order at all, same as never having touched it.
  const variantEntries = Object.entries(variantQuantities)
    .filter(([, qty]) => qty > 0)
    .map(([variantId, qty]) => ({ variantId, quantity: qty }));
  const variantTotalQuantity = variantEntries.reduce((sum, e) => sum + e.quantity, 0);
  // Whichever quantity concept actually applies to this plan -- the
  // per-variant sum for one with styles to choose from, the plain
  // stepper's value for one without.
  const effectiveQuantity = hasVariants ? variantTotalQuantity : quantity;
  const totalAmount = selectedPlan?.chargeAmount ? selectedPlan.chargeAmount * effectiveQuantity : null;

  function adjustVariantQuantity(variantId, delta) {
    setVariantQuantities((prev) => {
      const current = prev[variantId] || 0;
      const others = variantTotalQuantity - current;
      const next = Math.max(0, Math.min(MAX_QUANTITY - others, current + delta));
      return { ...prev, [variantId]: next };
    });
  }

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
        name: 'huntsTAG',
        description,
        prefill: { name: myProfile?.fullName, email: myProfile?.loginEmail },
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

  const variantOk = !hasVariants || variantTotalQuantity > 0;
  const designOk = !selectedPlan?.requiresDesignUpload || Boolean(designFrontUrl && designBackUrl);

  async function handleCheckout(e) {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!loggedIn) {
      navigate('/register');
      return;
    }
    if (!selectedPlan.chargeAmount) {
      setError('This plan isn\'t available for instant checkout yet — please contact us to order it.');
      return;
    }
    if (!variantOk) {
      setError('Choose at least one card style and quantity before checking out.');
      return;
    }
    if (!designOk) {
      setError('Upload both a front and back design before checking out.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const qtySuffix = effectiveQuantity > 1 ? ` × ${effectiveQuantity}` : '';
      // Buy/upgrade your own account. Quantity = spare physical copies of
      // your own profile, still just the one account.
      const result = await runCheckout({
        createOrder: () => api.createUpgradeOrder(selectedKey, quantity, hasVariants ? variantEntries : undefined),
        confirmPayment: (response) =>
          api.confirmUpgradePayment({
            requestedPlan: selectedKey,
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
      setSelectedKey('');
      setVariantQuantities({});
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

  return (
    <div className={homeTheme === 'orange' ? 'theme-orange' : undefined}>
      <h1 className="section-heading" style={{ marginTop: 0 }}>
        {loggedIn ? (hasCard ? 'Upgrade your card' : 'Get your card') : 'Choose your card'}
      </h1>
      <p className="section-subheading">
        {loggedIn
          ? hasCard
            ? `You're currently on ${myProfile.cardType}.`
            : "You don't have a card yet — pick a plan below."
          : "Browse freely — you'll need an account to actually buy."}
      </p>

      {upgraded && !error && (
        <p className="section-subheading" style={{ color: 'var(--holo-cyan)', fontWeight: 600 }}>
          Payment successful — your card is {hasCard ? 'updated' : 'ready'}!
          {upgraded > 1 ? ` You're getting ${upgraded} physical cards, all with your profile.` : ''}
        </p>
      )}

      {visiblePlans.length === 0 ? (
        <p className="subtitle" style={{ textAlign: 'center' }}>No other plans available right now.</p>
      ) : (
        <>
          {visiblePlans.length > 1 && (
            <div className="plan-switcher">
              {visiblePlans.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`plan-switch-pill${selectedKey === p.key ? ' active' : ''}`}
                  onClick={() => selectPlan(p.key)}
                >
                  {p.name}
                  {isCurrentPlan(p) && <span className="current-badge">Current</span>}
                </button>
              ))}
            </div>
          )}

          {selectedPlan && (
            <div className={`checkout-panel plan-detail-panel${hasVariantImages || selectedPlan.images?.length ? ' checkout-modal-card-wide' : ''}`}>
            <div className="card shop-detail-card">
            <div className="plan-detail-header">
              {isCurrentPlan(selectedPlan) && <span className="current-plan-badge">Current Plan</span>}
              <h2 className="plan-detail-name">{selectedPlan.name}</h2>
              {selectedPlan.chargeAmount && (
                <p className="plan-detail-price">
                  ₹{selectedPlan.chargeAmount}
                  <span>/ card</span>
                </p>
              )}
              <p className="shop-plan-desc">
                {selectedPlan.description || 'A huntsTAG smart card, tap-to-share ready.'}
              </p>
              <PlanFeatureBadges plan={selectedPlan} />
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className={hasVariantImages || selectedPlan.images?.length ? 'checkout-modal-layout' : undefined}>
            {hasVariantImages ? (
              <PlanHeroMedia variants={selectedPlan.variants} focusIndex={focusIndex} onFocusChange={setFocusIndex} />
            ) : selectedPlan.images?.length ? (
              <div className="checkout-modal-media-col">
                <PlanImageGallery images={selectedPlan.images} />
              </div>
            ) : null}
            <div className="checkout-modal-form-col">
            {hasVariantImages && (
              <div className="plan-spec-strip">
                <div className="plan-spec-item">
                  <span className="plan-spec-label">Style</span>
                  <span className="plan-spec-value">
                    {(selectedPlan.variants[focusIndex] || selectedPlan.variants[0])?.name}
                  </span>
                </div>
                <div className="plan-spec-item">
                  <span className="plan-spec-label">Shape</span>
                  <span className="plan-spec-value">
                    {(selectedPlan.variants[focusIndex] || selectedPlan.variants[0])?.shape === 'vertical'
                      ? 'Vertical'
                      : 'Horizontal'}
                  </span>
                </div>
              </div>
            )}
            <form onSubmit={handleCheckout}>
              {hasVariants && (
                <div className="field">
                  <label>
                    Card style{' '}
                    {variantTotalQuantity > 0 && (
                      <span className="hint" style={{ fontWeight: 400 }}>
                        ({variantTotalQuantity} card{variantTotalQuantity > 1 ? 's' : ''} total)
                      </span>
                    )}
                  </label>
                  {/* Card grid, Amazon-style: photo first, small label
                      below, a crisp ring (border + glow) marking any style
                      with a quantity above 0 -- background stays the same
                      either way so the ring does all the work, not a color
                      swap. Each card carries its OWN quantity, so one order
                      can mix several styles (e.g. 1x "White Night" + 1x
                      "Revenge Red") instead of forcing one style for the
                      whole order. */}
                  <div className="plan-variant-grid">
                    {selectedPlan.variants.map((v, i) => {
                      const qty = variantQuantities[v._id] || 0;
                      const active = qty > 0;
                      const focused = hasVariantImages && i === focusIndex;
                      return (
                        <div
                          key={v._id}
                          className={`plan-variant-card${active ? ' active' : ''}${!active && focused ? ' focused' : ''}`}
                        >
                          <div
                            className="plan-variant-photos"
                            style={{ cursor: hasVariantImages ? 'pointer' : 'default' }}
                            onClick={hasVariantImages ? () => setFocusIndex(i) : undefined}
                          >
                            <VariantPhoto url={v.frontImageUrl} label="Front" />
                            <VariantPhoto url={v.backImageUrl} label="Back" />
                          </div>
                          <span className="plan-variant-name">{v.name}</span>
                          <span className="plan-variant-shape">{v.shape === 'vertical' ? 'Vertical' : 'Horizontal'}</span>
                          <div className="plan-variant-stepper">
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => adjustVariantQuantity(v._id, -1)}
                              disabled={qty <= 0}
                              aria-label={`Fewer ${v.name}`}
                            >
                              −
                            </button>
                            <span className="qty-value">{qty}</span>
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => adjustVariantQuantity(v._id, 1)}
                              disabled={variantTotalQuantity >= MAX_QUANTITY}
                              aria-label={`More ${v.name}`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {variantTotalQuantity === 0 ? (
                    <p className="hint" style={{ marginBottom: 0 }}>
                      Pick at least one style and quantity above.
                    </p>
                  ) : (
                    selectedPlan.chargeAmount && (
                      <p className="hint" style={{ marginBottom: 0 }}>
                        ₹{selectedPlan.chargeAmount} × {variantTotalQuantity} ={' '}
                        <strong style={{ color: 'var(--text)' }}>₹{totalAmount}</strong>
                      </p>
                    )
                  )}
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
              {selectedPlan.chargeAmount && !hasVariants && (
                <div className="field">
                  <label htmlFor="cardQuantity">
                    How many cards? <span className="hint" style={{ fontWeight: 400 }}>(extra physical copies of the same profile)</span>
                  </label>
                  <div className="plan-qty-row">
                    <button
                      type="button"
                      className="qty-btn"
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
                      className="plan-qty-input"
                    />
                    <button
                      type="button"
                      className="qty-btn"
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
              <button type="submit" disabled={submitting || !selectedPlan.chargeAmount || !variantOk || !designOk}>
                {submitting
                  ? 'Waiting for payment…'
                  : !loggedIn
                  ? 'Log in to buy'
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
            </div>
            </div>
          )}
        </>
      )}

      {loggedIn && requests.length > 0 && (
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
