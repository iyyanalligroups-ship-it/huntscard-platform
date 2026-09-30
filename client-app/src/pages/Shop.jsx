import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Image as ImageIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  LoaderCircle,
  LogIn,
  MapPin,
  Minus,
  Palette,
  Plus,
  ScanLine,
  ShoppingBag,
  Sparkles,
  Ticket,
  Truck,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { api, isLoggedIn } from '../api.js';
import { loadRazorpayScript } from '../razorpay.js';
import GeoSelect from '../components/GeoSelect.jsx';
import MyMagicPosterOrders from './MyMagicPosterOrders.jsx';
import MagicArt from './MagicArt.jsx';

const PLAN_DISPLAY_ORDER = ['premium', 'elite', 'nova', 'custom', 'apex'];
const COUNTRY_ISO = 'IN';
const COUNTRY_NAME = 'India';
const EMPTY_ADDRESS_FORM = {
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
    Icon: ScanLine,
    label: 'AR feature',
    note: 'Anyone who scans your card can point their phone camera at it to unlock an AR experience.',
  },
  {
    key: 'zingEnabled',
    Icon: Zap,
    label: 'Zing',
    note: 'Share your contact card instantly from your dashboard with a tap — no app needed on their end.',
  },
  {
    key: 'requiresDesignUpload',
    Icon: Palette,
    label: 'Requires design upload',
    note: "You'll upload your own front and back artwork for this card during checkout.",
  },
  {
    key: 'magicEnabled',
    Icon: Sparkles,
    label: 'Magic AR feature',
    note: 'Add your own photo or video effect that plays when someone scans your card in Magic Camera.',
  },
  {
    key: 'isSpecialEdition',
    Icon: Volume2,
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
        {active.map((f) => {
          const FeatureIcon = f.Icon;
          return (
            <span key={f.key} className="plan-feature-badge">
              <FeatureIcon size={14} strokeWidth={2} aria-hidden="true" /> {f.label}
            </span>
          );
        })}
      </div>
      <ul className="plan-feature-notes">
        {active.map((f) => {
          const FeatureIcon = f.Icon;
          return (
            <li key={f.key}>
              <FeatureIcon size={17} strokeWidth={1.9} aria-hidden="true" />
              <span>
                <strong>{f.label}</strong> — {f.note}
              </span>
            </li>
          );
        })}
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
            <ChevronLeft size={18} aria-hidden="true" />
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
            <ChevronRight size={18} aria-hidden="true" />
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
  const [myCards, setMyCards] = useState([]); // every physical card this client owns, possibly across several DIFFERENT plans -- see api.getMyCards()
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
  const [addresses, setAddresses] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [savingAddress, setSavingAddress] = useState(false);
  const [checkoutPricing, setCheckoutPricing] = useState(null);
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  // Card Shop / Magic Poster Shop -- picks both the shop above and the history below it.
  const [shopTab, setShopTab] = useState(
    searchParams.get('tab') === 'poster' || searchParams.get('history') === 'poster' ? 'poster' : 'card'
  );
  // Same admin-toggled setting PublicLayout.jsx's header/footer follow --
  // fetched independently here (rather than threaded down as a prop)
  // because this page is mounted two different ways: standalone on the
  // public site at /shop, and inside the dashboard at /dashboard/upgrade
  // (where .dash-shell already carries .theme-orange from Layout.jsx, so
  // this is redundant-but-harmless there). Only the public /shop mount
  // actually needs it -- nothing else on that route puts .theme-orange
  // anywhere near this page's own content.
  const [homeTheme, setHomeTheme] = useState('default');

  // HuntsWorld free-card coupon -- a separate claim path alongside the
  // normal paid checkout above, not a variant of it. couponMode holds the
  // plan a verified code unlocks; while set, the plan switcher is hidden
  // (the coupon dictates the plan) and the variant picker/submit below
  // behave as a single-card, zero-payment claim instead of a purchase.
  const [couponInput, setCouponInput] = useState('');
  const [couponSectionOpen, setCouponSectionOpen] = useState(false);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponMode, setCouponMode] = useState(null); // { code, plan } once a code is verified
  const [couponClaiming, setCouponClaiming] = useState(false);
  const [couponClaimSuccess, setCouponClaimSuccess] = useState('');

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
      loggedIn ? api.getMyCards() : Promise.resolve([]),
    ])
      .then(([pl, profile, reqs, cards]) => {
        setPlans(pl);
        setMyProfile(profile);
        if (profile) {
          setAddressForm((current) => ({
            ...current,
            name: current.name || profile.fullName || '',
            phone: current.phone || profile.phone || '',
          }));
        }
        setRequests(reqs.filter((r) => r.type === 'upgrade'));
        setMyCards(cards);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    Promise.all([api.listAddresses(), api.getStates(COUNTRY_ISO)])
      .then(([savedAddresses, stateList]) => {
        setAddresses(savedAddresses);
        setStates(stateList);
        const preferred = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
        if (preferred) setSelectedAddressId(preferred._id);
        else setShowAddAddress(true);
      })
      .catch((err) => setError(err.message));
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

  // Deep-link from a HuntsWorld coupon email (/dashboard/upgrade?plan=
  // <key>&coupon=<code>) -- the ?plan= param above already pre-selects the
  // plan; this pre-fills the code and auto-checks it, so clicking the
  // email button lands straight on the claim panel instead of an empty
  // Shop page the merchant has to know to go find the coupon box on.
  useEffect(() => {
    const code = searchParams.get('coupon');
    if (!code || !loggedIn || couponMode) return;
    setCouponSectionOpen(true);
    setCouponInput(code);
    handleCheckCoupon(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, searchParams]);

  // A client can own cards across several DIFFERENT plans at once (see
  // routes/profile.js's upgrade-confirm) -- so "do they have a card at
  // all" and "is THIS plan one they already own" both come from the real
  // card list now, not the single legacy myProfile.cardType field (which
  // only ever reflects whichever plan became card #1).
  const ownedPlanKeys = new Set(myCards.map((c) => c.cardType).filter(Boolean));
  const hasCard = myCards.length > 0;
  // Show every plan, including any the client already owns -- marked as
  // "Current Plan" in the card below instead of being hidden, so they can
  // see where they stand relative to the other tiers.
  function isCurrentPlan(p) {
    return loggedIn && ownedPlanKeys.has(p.key);
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
    const current = loggedIn && hasCard ? visiblePlans.find((p) => ownedPlanKeys.has(p.key)) : null;
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
  const cardSubtotal = selectedPlan?.chargeAmount ? selectedPlan.chargeAmount * effectiveQuantity : 0;
  const selectedAddress = (addresses || []).find((address) => address._id === selectedAddressId);

  useEffect(() => {
    if (!loggedIn || !selectedPlan?.chargeAmount) return;
    api
      .getCardCheckoutPricing(selectedAddress?.state)
      .then(setCheckoutPricing)
      .catch(() => setCheckoutPricing(null));
  }, [loggedIn, selectedPlan?.key, selectedAddress?.state]);

  const deliveryFee = checkoutPricing?.deliveryFee ?? 0;
  const gstPercent = checkoutPricing?.gstPercent ?? 0;
  // GST applies to the card subtotal only, not delivery -- matches the
  // backend's computeMagicPosterTotals (utils/pricing.js), which actually
  // computes the charged amount. This is a display-only estimate.
  const gstAmount = Math.round(cardSubtotal * (gstPercent / 100));
  const checkoutTotal = cardSubtotal + deliveryFee + gstAmount;

  function adjustVariantQuantity(variantId, delta) {
    // Coupon claims are locked to exactly one card of one style -- picking
    // a different variant replaces the previous choice rather than adding
    // to it, unlike the normal multi-style order above.
    if (couponMode) {
      setVariantQuantities(delta > 0 ? { [variantId]: 1 } : {});
      return;
    }
    setVariantQuantities((prev) => {
      const current = prev[variantId] || 0;
      const others = variantTotalQuantity - current;
      const next = Math.max(0, Math.min(MAX_QUANTITY - others, current + delta));
      return { ...prev, [variantId]: next };
    });
  }

  async function handleCheckCoupon(codeOverride) {
    const code = (codeOverride ?? couponInput).trim();
    if (!code) {
      setCouponError('Enter a coupon code.');
      return;
    }
    if (!loggedIn) {
      navigate('/register');
      return;
    }
    setCouponChecking(true);
    setCouponError('');
    try {
      const result = await api.previewCoupon(code);
      selectPlan(result.plan.key);
      setCouponMode({ code, plan: result.plan });
    } catch (err) {
      setCouponError(err.message);
    } finally {
      setCouponChecking(false);
    }
  }

  function handleRemoveCoupon() {
    setCouponMode(null);
    setCouponInput('');
    setCouponError('');
    setVariantQuantities({});
    setDesignFrontUrl('');
    setDesignBackUrl('');
  }

  async function handleClaimCoupon(e) {
    e.preventDefault();
    if (!couponMode) return;
    if (!variantOk) {
      setError('Choose a card style before claiming.');
      return;
    }
    if (!designOk) {
      setError('Upload both a front and back design before claiming.');
      return;
    }
    if (!selectedAddress) {
      setError('Choose or add a delivery address before claiming.');
      return;
    }

    setError('');
    setCouponClaiming(true);
    try {
      const chosenVariantId = hasVariants ? variantEntries[0]?.variantId : undefined;
      await api.claimCoupon({
        code: couponMode.code,
        variantId: chosenVariantId,
        deliveryAddressId: selectedAddress._id,
        designFrontUrl: designFrontUrl || undefined,
        designBackUrl: designBackUrl || undefined,
      });
      setCouponClaimSuccess(`Your free ${couponMode.plan.name} card has been claimed!`);
      const [fresh, reqs] = await Promise.all([api.getProfile(), api.listMyRequests()]);
      setMyProfile(fresh);
      setRequests(reqs.filter((r) => r.type === 'upgrade'));
      handleRemoveCoupon();
    } catch (err) {
      setError(err.message);
    } finally {
      setCouponClaiming(false);
    }
  }

  function updateAddressField(field, value) {
    setAddressForm((current) => ({ ...current, [field]: value }));
  }

  function handleAddressStateChange(option) {
    setAddressForm((current) => ({ ...current, stateIso: option.value, stateName: option.label, cityName: '' }));
    setCities([]);
    api.getCities(COUNTRY_ISO, option.value).then(setCities).catch(() => {});
  }

  async function handleSaveAddress() {
    setError('');
    if (!addressForm.name.trim() || !addressForm.line1.trim()) {
      setError('Enter the delivery name and street address.');
      return;
    }
    if (addressForm.phone.length !== 10) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    if (addressForm.pincode.length !== 6) {
      setError('Enter a valid 6-digit pincode.');
      return;
    }
    if (!addressForm.stateName || !addressForm.cityName) {
      setError('Choose a state and city.');
      return;
    }

    setSavingAddress(true);
    try {
      const created = await api.createAddress({
        label: addressForm.label,
        name: addressForm.name,
        phone: addressForm.phone,
        line1: addressForm.line1,
        line2: addressForm.line2,
        country: COUNTRY_NAME,
        state: addressForm.stateName,
        city: addressForm.cityName,
        pincode: addressForm.pincode,
        isDefault: (addresses?.length || 0) === 0,
      });
      setAddresses((current) => [created, ...(current || [])]);
      setSelectedAddressId(created._id);
      setShowAddAddress(false);
      setAddressForm((current) => ({ ...EMPTY_ADDRESS_FORM, name: current.name, phone: current.phone }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAddress(false);
    }
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
        name: 'HuntsTAG',
        description,
        prefill: {
          name: selectedAddress?.name || myProfile?.fullName,
          email: myProfile?.loginEmail,
          contact: selectedAddress?.phone || myProfile?.phone,
        },
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
    if (!selectedAddress) {
      setError('Choose or add a delivery address before checking out.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const qtySuffix = effectiveQuantity > 1 ? ` × ${effectiveQuantity}` : '';
      // Buy/upgrade your own account. Quantity = spare physical copies of
      // your own profile, still just the one account.
      const result = await runCheckout({
        createOrder: () =>
          api.createUpgradeOrder(selectedKey, quantity, hasVariants ? variantEntries : undefined, selectedAddress._id),
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
      <div className="history-tabs shop-main-tabs" role="tablist">
        {[
          ['card', 'Card Shop', CreditCard],
          ['poster', 'Magic Poster Shop', ImageIcon],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={shopTab === key}
            className={`history-tab ${shopTab === key ? 'active' : ''}`}
            onClick={() => setShopTab(key)}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {shopTab === 'card' && (
        <>
      <h1 className="section-heading shop-page-heading" style={{ marginTop: 0 }}>
        <span className="shop-page-heading-icon" aria-hidden="true">
          <ShoppingBag size={22} strokeWidth={1.9} />
        </span>
        {loggedIn ? (hasCard ? 'Upgrade your card' : 'Get your card') : 'Choose your card'}
      </h1>
      <p className="section-subheading">
        {loggedIn
          ? hasCard
            ? `You're currently on ${[...ownedPlanKeys]
                .map((key) => visiblePlans.find((p) => p.key === key)?.name || key)
                .join(', ')}.`
            : "You don't have a card yet — pick a plan below."
          : "Browse freely — you'll need an account to actually buy."}
      </p>

      {upgraded && !error && (
        <p className="section-subheading shop-success-message" style={{ color: 'var(--holo-cyan)', fontWeight: 600 }}>
          <BadgeCheck size={17} aria-hidden="true" />
          Payment successful — your card is {hasCard ? 'updated' : 'ready'}!
          {upgraded > 1 ? ` You're getting ${upgraded} physical cards, all with your profile.` : ''}
        </p>
      )}

      {couponClaimSuccess && !error && (
        <p className="section-subheading shop-success-message" style={{ color: 'var(--holo-cyan)', fontWeight: 600 }}>
          <BadgeCheck size={17} aria-hidden="true" />
          {couponClaimSuccess}
        </p>
      )}

      {/* HuntsWorld coupon entry -- a separate claim path from browsing/
          buying a plan below. Collapsed by default so it doesn't compete
          with the main "pick a plan" flow for most visitors; the email
          deep-link (?coupon=) opens it pre-filled automatically. */}
      {!couponMode ? (
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          {!couponSectionOpen ? (
            <button type="button" className="secondary" style={{ width: 'auto' }} onClick={() => setCouponSectionOpen(true)}>
              Have a coupon code?
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Enter your HuntsWorld coupon code"
                style={{ flex: '1 1 220px', margin: 0 }}
                disabled={couponChecking}
              />
              <button type="button" style={{ width: 'auto' }} disabled={couponChecking} onClick={() => handleCheckCoupon()}>
                {couponChecking ? <LoaderCircle className="shop-icon-spin" size={15} aria-hidden="true" /> : 'Apply'}
              </button>
            </div>
          )}
          {couponError && <p className="error-banner" style={{ marginTop: 10 }}>{couponError}</p>}
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>
            🎟 Coupon <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{couponMode.code}</strong> applied —
            claiming your <strong>{couponMode.plan.name}</strong>, free.
          </span>
          <button type="button" className="secondary" style={{ width: 'auto' }} onClick={handleRemoveCoupon}>
            Remove coupon
          </button>
        </div>
      )}

      {visiblePlans.length === 0 ? (
        <p className="subtitle" style={{ textAlign: 'center' }}>No other plans available right now.</p>
      ) : (
        <>
          {!couponMode && visiblePlans.length > 1 && (
            <div className="plan-switcher">
              {visiblePlans.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`plan-switch-pill${selectedKey === p.key ? ' active' : ''}`}
                  onClick={() => selectPlan(p.key)}
                >
                  {p.name}
                  {isCurrentPlan(p) && (
                    <span className="current-badge"><BadgeCheck size={11} aria-hidden="true" />Current</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {selectedPlan && (
            <div className={`checkout-panel plan-detail-panel${hasVariantImages || selectedPlan.images?.length ? ' checkout-modal-card-wide' : ''}`}>
            <div className="card shop-detail-card">
            <div className="plan-detail-header">
              {isCurrentPlan(selectedPlan) && (
                <span className="current-plan-badge"><BadgeCheck size={13} aria-hidden="true" />Current Plan</span>
              )}
              <h2 className="plan-detail-name">{selectedPlan.name}</h2>
              {selectedPlan.chargeAmount && (
                <p className="plan-detail-price">
                  ₹{selectedPlan.chargeAmount}
                  <span>/ card</span>
                </p>
              )}
              <p className="shop-plan-desc">
                {selectedPlan.description || 'A HuntsTAG smart card, tap-to-share ready.'}
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
            <form onSubmit={couponMode ? handleClaimCoupon : handleCheckout}>
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
                              <Minus size={14} aria-hidden="true" />
                            </button>
                            <span className="qty-value">{qty}</span>
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => adjustVariantQuantity(v._id, 1)}
                              disabled={couponMode ? active : variantTotalQuantity >= MAX_QUANTITY}
                              aria-label={`More ${v.name}`}
                            >
                              <Plus size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {variantTotalQuantity === 0 ? (
                    <p className="hint" style={{ marginBottom: 0 }}>
                      {couponMode ? 'Pick a card style above.' : 'Pick at least one style and quantity above.'}
                    </p>
                  ) : couponMode ? (
                    <p className="hint" style={{ marginBottom: 0, color: 'var(--holo-cyan)', fontWeight: 600 }}>
                      Free with your coupon
                    </p>
                  ) : (
                    selectedPlan.chargeAmount && (
                      <p className="hint" style={{ marginBottom: 0 }}>
                        ₹{selectedPlan.chargeAmount} × {variantTotalQuantity} ={' '}
                        <strong style={{ color: 'var(--text)' }}>₹{cardSubtotal}</strong>
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
              {selectedPlan.chargeAmount && !hasVariants && !couponMode && (
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
                      <Minus size={14} aria-hidden="true" />
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
                      <Plus size={14} aria-hidden="true" />
                    </button>
                    {quantity > 1 && (
                      <span className="hint" style={{ marginBottom: 0 }}>
                        ₹{selectedPlan.chargeAmount} × {quantity} = <strong style={{ color: 'var(--text)' }}>₹{cardSubtotal}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
              {loggedIn && selectedPlan.chargeAmount && variantOk && (
                <section className="card-checkout-delivery" aria-labelledby="card-delivery-heading">
                  <div className="card-checkout-section-title">
                    <span><MapPin size={17} strokeWidth={2} aria-hidden="true" /></span>
                    <div>
                      <h3 id="card-delivery-heading">Delivery address</h3>
                      <p>Your invoice and physical card will use this address.</p>
                    </div>
                  </div>

                  {addresses === null ? (
                    <p className="hint">Loading your addresses…</p>
                  ) : (
                    <div className="card-checkout-address-list">
                      {addresses.map((address) => (
                        <label
                          key={address._id}
                          className={`card-checkout-address${selectedAddressId === address._id ? ' selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="cardDeliveryAddress"
                            checked={selectedAddressId === address._id}
                            onChange={() => {
                              setSelectedAddressId(address._id);
                              setShowAddAddress(false);
                            }}
                          />
                          <span>
                            <strong>{address.label ? `${address.label} — ` : ''}{address.name} · {address.phone}</strong>
                            <small>
                              {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state}, {address.country} - {address.pincode}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="secondary card-checkout-add-address"
                    onClick={() => setShowAddAddress((current) => !current)}
                  >
                    {showAddAddress
                      ? <X size={14} aria-hidden="true" />
                      : <Plus size={14} aria-hidden="true" />}
                    {showAddAddress ? 'Cancel' : 'Add new address'}
                  </button>

                  {showAddAddress && (
                    <div className="card-checkout-address-form">
                      <label>
                        Label <span>(optional)</span>
                        <input value={addressForm.label} onChange={(e) => updateAddressField('label', e.target.value)} placeholder="Home" />
                      </label>
                      <label>
                        Full name
                        <input value={addressForm.name} onChange={(e) => updateAddressField('name', e.target.value)} />
                      </label>
                      <label>
                        Phone
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          value={addressForm.phone}
                          onChange={(e) => updateAddressField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                        />
                      </label>
                      <label className="wide">
                        Address line 1
                        <input value={addressForm.line1} onChange={(e) => updateAddressField('line1', e.target.value)} />
                      </label>
                      <label className="wide">
                        Address line 2 <span>(optional)</span>
                        <input value={addressForm.line2} onChange={(e) => updateAddressField('line2', e.target.value)} />
                      </label>
                      <label>
                        Country
                        <GeoSelect value={COUNTRY_ISO} options={[{ value: COUNTRY_ISO, label: COUNTRY_NAME }]} onChange={() => {}} disabled />
                      </label>
                      <label>
                        State
                        <GeoSelect
                          value={addressForm.stateIso}
                          options={states.map((state) => ({ value: state.isoCode, label: state.name }))}
                          onChange={handleAddressStateChange}
                          placeholder="Select state"
                          searchPlaceholder="Search states…"
                        />
                      </label>
                      <label>
                        City
                        <GeoSelect
                          value={addressForm.cityName}
                          options={cities.map((city) => ({ value: city, label: city }))}
                          onChange={(option) => updateAddressField('cityName', option.value)}
                          placeholder="Select city"
                          searchPlaceholder="Search cities…"
                          disabled={!addressForm.stateIso}
                        />
                      </label>
                      <label>
                        Pincode
                        <input
                          inputMode="numeric"
                          maxLength={6}
                          value={addressForm.pincode}
                          onChange={(e) => updateAddressField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                      </label>
                      <button type="button" disabled={savingAddress} onClick={handleSaveAddress}>
                        {savingAddress
                          ? <LoaderCircle className="shop-icon-spin" size={15} aria-hidden="true" />
                          : <BadgeCheck size={15} aria-hidden="true" />}
                        <span>{savingAddress ? 'Saving…' : 'Save address'}</span>
                      </button>
                    </div>
                  )}
                </section>
              )}

              {couponMode ? (
                <div className="card-checkout-summary">
                  <div><span>Card</span><strong style={{ textDecoration: selectedPlan.chargeAmount ? 'line-through' : 'none', opacity: selectedPlan.chargeAmount ? 0.6 : 1 }}>₹{selectedPlan.chargeAmount || 0}</strong></div>
                  <div className="total"><span>Total</span><strong style={{ color: 'var(--holo-cyan)' }}>FREE — coupon applied</strong></div>
                </div>
              ) : (
                selectedPlan.chargeAmount && loggedIn && variantOk && (
                  <div className="card-checkout-summary">
                    <div><span>Card subtotal</span><strong>₹{cardSubtotal}</strong></div>
                    <div><span>Delivery</span><strong>₹{deliveryFee}</strong></div>
                    <div><span>GST ({gstPercent}%)</span><strong>₹{gstAmount}</strong></div>
                    <div className="total"><span>Total</span><strong>₹{checkoutTotal}</strong></div>
                  </div>
                )
              )}

              <button
                type="submit"
                className="shop-checkout-button"
                disabled={
                  couponMode
                    ? couponClaiming || !variantOk || !designOk || !selectedAddress
                    : submitting || !selectedPlan.chargeAmount || !variantOk || !designOk || (loggedIn && !selectedAddress)
                }
              >
                {(couponMode ? couponClaiming : submitting) ? (
                  <LoaderCircle className="shop-icon-spin" size={17} aria-hidden="true" />
                ) : !loggedIn ? (
                  <LogIn size={17} aria-hidden="true" />
                ) : (
                  <CreditCard size={17} aria-hidden="true" />
                )}
                <span>{couponMode
                  ? (couponClaiming
                      ? 'Claiming…'
                      : !variantOk
                      ? 'Choose a card style'
                      : !designOk
                      ? 'Upload front & back design'
                      : !selectedAddress
                      ? 'Choose delivery address'
                      : 'Claim free card')
                  : submitting
                  ? 'Waiting for payment…'
                  : !loggedIn
                  ? 'Log in to buy'
                  : !selectedPlan.chargeAmount
                  ? 'Not available for instant checkout'
                  : !variantOk
                  ? 'Choose a card style'
                  : !designOk
                  ? 'Upload front & back design'
                  : loggedIn && !selectedAddress
                  ? 'Choose delivery address'
                  : `Pay ₹${loggedIn ? checkoutTotal : cardSubtotal}`}</span>
              </button>
            </form>
            {!couponMode && !selectedPlan.chargeAmount && (
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

        </>
      )}

      {shopTab === 'poster' && <MagicArt embedded />}

      {loggedIn && (
        <div className="checkout-panel" style={{ marginTop: 32 }}>
          <p className="hint" style={{ marginBottom: 8 }}>
            {shopTab === 'poster' ? 'Your Magic Poster purchase history' : 'Your card purchase history'}
          </p>
          {shopTab === 'poster' ? (
            <MyMagicPosterOrders embedded />
          ) : requests.length === 0 ? (
            <p className="subtitle" style={{ margin: '12px 0 0' }}>You haven't purchased a card yet.</p>
          ) : requests.map((r) => {
            const requestPlan = visiblePlans.find((p) => p.key === r.requestedPlan);
            const planName = requestPlan?.name || r.requestedPlan;
            const expanded = expandedRequestId === r._id;
            const items = r.invoiceItems && r.invoiceItems.length > 0 ? r.invoiceItems : [{ name: planName, unitPrice: null, quantity: r.quantity }];
            const selectedVariants = (r.variantBreakdown || []).map((selection, index) => {
              const variant = requestPlan?.variants?.find((item) => String(item._id) === String(selection.variantId));
              return { ...variant, ...selection, name: variant?.name || items[index]?.name || `Card style ${index + 1}` };
            });
            const primaryVariant = selectedVariants[0] || requestPlan?.variants?.[0];
            const frontImage = primaryVariant?.frontImageUrl || requestPlan?.images?.[0];
            const backImage = primaryVariant?.backImageUrl || requestPlan?.images?.[1];
            const activeFeatures = PLAN_FEATURE_BADGES.filter((feature) => requestPlan?.[feature.key]);
            function toggle() {
              setExpandedRequestId(expanded ? null : r._id);
            }
            return (
              <div key={r._id} className="request-row-wrap">
                <div
                  className="request-row request-row-toggle"
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={toggle}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                >
                  <span>
                    {planName}
                    {r.quantity > 1 && <span className="hint" style={{ marginLeft: 4 }}>× {r.quantity}</span>}
                    {r.paymentStatus === 'paid' && <span style={{ color: 'var(--holo-cyan)' }}> · Paid</span>}
                    {r.orderNumber && <small className="card-order-number">{r.orderNumber}</small>}
                    {r.couponCode && (
                      <small className="card-coupon-tag" title={`Claimed free via ${r.couponSource || 'coupon'} code ${r.couponCode}`}>
                        <Ticket size={10} aria-hidden="true" />{r.couponSource === 'huntsworld' ? 'HuntsWorld' : r.couponSource || 'Coupon'}
                      </small>
                    )}
                  </span>
                  <span className="card-request-actions">
                    <span className="request-status">{r.status}</span>
                    {r.paymentStatus === 'paid' && (
                      <button
                        type="button"
                        className="secondary card-invoice-button"
                        onClick={(e) => { e.stopPropagation(); api.downloadCardInvoice(r._id, r.orderNumber).catch((err) => setError(err.message)); }}
                      >
                        <Download size={14} aria-hidden="true" />Invoice
                      </button>
                    )}
                    <ChevronDown size={16} className="request-row-chevron" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                  </span>
                </div>

                {expanded && (
                  <div className="request-row-detail">
                    <div className="purchase-detail-hero">
                      <div className="purchase-detail-media">
                        <div className={`purchase-detail-card-face ${primaryVariant?.shape === 'vertical' ? 'is-vertical' : ''}`}>
                          {frontImage ? <img src={frontImage} alt={`${planName} front`} /> : <CreditCard size={34} aria-hidden="true" />}
                          <span>Front</span>
                        </div>
                        {backImage && (
                          <div className={`purchase-detail-card-face ${primaryVariant?.shape === 'vertical' ? 'is-vertical' : ''}`}>
                            <img src={backImage} alt={`${planName} back`} />
                            <span>Back</span>
                          </div>
                        )}
                      </div>
                      <div className="purchase-detail-plan">
                        <span className="purchase-detail-kicker">Purchased plan</span>
                        <h3>{planName}</h3>
                        <code>{r.requestedPlan}</code>
                        {requestPlan?.description && <p>{requestPlan.description}</p>}
                        <div className="purchase-detail-meta">
                          <div><span>Quantity</span><strong>{r.quantity || 1}</strong></div>
                          <div><span>Plan price</span><strong>{requestPlan?.price || (requestPlan?.chargeAmount != null ? `₹${requestPlan.chargeAmount}` : 'Not set')}</strong></div>
                          <div><span>Order number</span><strong>{r.orderNumber || 'Not available'}</strong></div>
                          <div><span>Status</span><strong>{r.status}</strong></div>
                          {r.couponCode && (
                            <div>
                              <span>Claimed via</span>
                              <strong>{r.couponSource === 'huntsworld' ? 'HuntsWorld' : r.couponSource || 'Coupon'} · {r.couponCode}</strong>
                            </div>
                          )}
                        </div>
                        {activeFeatures.length > 0 && (
                          <div className="purchase-detail-features">
                            {activeFeatures.map(({ key, Icon, label }) => <span key={key}><Icon size={12} aria-hidden="true" />{label}</span>)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="purchase-detail-sections">
                      <section className="purchase-detail-section">
                        <div className="purchase-detail-section-title"><ShoppingBag size={15} /><div><strong>Order items</strong><span>Selected card styles and quantities</span></div></div>
                        <div className="purchase-detail-items">
                          {(selectedVariants.length > 0 ? selectedVariants : items).map((item, i) => (
                            <div key={item.variantId || i} className="purchase-detail-item">
                              <div className={`purchase-detail-item-image ${item.shape === 'vertical' ? 'is-vertical' : ''}`}>
                                {item.frontImageUrl ? <img src={item.frontImageUrl} alt={item.name} /> : <CreditCard size={18} aria-hidden="true" />}
                              </div>
                              <div><strong>{item.name}</strong><span>{item.shape ? `${item.shape} · ` : ''}{item.quantity} {Number(item.quantity) === 1 ? 'card' : 'cards'}</span></div>
                              {item.unitPrice != null && <b>₹{item.unitPrice * item.quantity}</b>}
                            </div>
                          ))}
                        </div>
                      </section>

                      {r.amount != null && (
                        <section className="purchase-detail-section">
                          <div className="purchase-detail-section-title"><CreditCard size={15} /><div><strong>Payment summary</strong><span>Verified checkout amount</span></div></div>
                          <div className="request-detail-totals purchase-detail-totals">
                            <div><span>Card subtotal</span><span>₹{r.subtotal}</span></div>
                            <div><span>Delivery</span><span>₹{r.deliveryFee}</span></div>
                            <div><span>GST ({r.gstPercent}%)</span><span>₹{r.gstAmount}</span></div>
                            <div className="request-detail-total"><span>Total paid</span><span>₹{r.amount}</span></div>
                          </div>
                        </section>
                      )}

                      {r.delivery?.line1 && (
                        <section className="purchase-detail-section">
                          <div className="purchase-detail-section-title"><MapPin size={15} /><div><strong>Delivery address</strong><span>Shipping destination</span></div></div>
                          <div className="request-detail-address purchase-detail-address">
                            <strong>{r.delivery.name} · {r.delivery.phone}</strong>
                            <span>{r.delivery.line1}{r.delivery.line2 ? `, ${r.delivery.line2}` : ''}</span>
                            <span>{r.delivery.city}, {r.delivery.state} - {r.delivery.pincode}</span>
                            <span>{r.delivery.country}</span>
                          </div>
                        </section>
                      )}

                      <section className="purchase-detail-section">
                        <div className="purchase-detail-section-title"><Truck size={15} /><div><strong>Fulfillment</strong><span>Tracking and delivery progress</span></div></div>
                        <div className="purchase-fulfillment-grid">
                          <div><span>Tracking ID</span><strong>{r.trackingId || 'Not dispatched yet'}</strong></div>
                          <div><span>Dispatched</span><strong>{r.dispatchedAt ? new Date(r.dispatchedAt).toLocaleString() : 'Pending'}</strong></div>
                          <div><span>Delivered</span><strong>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : 'Pending'}</strong></div>
                        </div>
                      </section>

                      <section className="purchase-detail-section purchase-detail-date-section">
                        <div className="purchase-detail-section-title"><Clock3 size={15} /><div><strong>Order date</strong><span>{r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not available'}</span></div></div>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
