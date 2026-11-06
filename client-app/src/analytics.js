// Loads Google Analytics 4 and/or Meta Pixel only when their IDs are set in
// client-app/.env (VITE_GA_ID, VITE_META_PIXEL_ID). Without IDs it does nothing.
function addScript(src) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

// GA4 measurement ID (public, not a secret). VITE_GA_ID overrides it.
const DEFAULT_GA_ID = 'G-VEB4HK0P8L';
// No tracking while developing on this machine.
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export function initAnalytics() {
  const pixelId = import.meta.env.VITE_META_PIXEL_ID;
  const GA_ID = import.meta.env.VITE_GA_ID || DEFAULT_GA_ID;

  if (GA_ID && !isLocal()) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // Page views are sent from code (see trackPageView) so the title is already set.
    window.gtag('config', GA_ID, { send_page_view: false });
    // The 177 KB tag loads after the page is ready, so it never competes with the first paint.
    // gtag() calls made before it arrives are queued in dataLayer and sent when it loads.
    const loadTag = () => addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`);
    const whenIdle = () => (window.requestIdleCallback ? window.requestIdleCallback(loadTag, { timeout: 4000 }) : setTimeout(loadTag, 2000));
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
  }

  // Meta Pixel: the dataset ID is digits only (public, not a secret). Off on localhost, and the
  // 60 KB script loads after the page is ready. PageView is sent per route by trackPageView.
  if (/^\d{8,20}$/.test(pixelId || '') && !isLocal()) {
    /* eslint-disable */
    (function (f, n) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    })(window);
    /* eslint-enable */
    window.fbq('init', pixelId); // fbq() calls made before the script arrives are queued
    const loadPixel = () => addScript('https://connect.facebook.net/en_US/fbevents.js');
    const whenIdle = () => (window.requestIdleCallback ? window.requestIdleCallback(loadPixel, { timeout: 4000 }) : setTimeout(loadPixel, 2000));
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
  }
}

// Meta has its own names for a few events; the rest are sent as custom events.
const META_STANDARD = { sign_up: 'CompleteRegistration', generate_lead: 'Lead', purchase: 'Purchase' };

function metaTrack(name, params) {
  const std = META_STANDARD[name];
  if (!std) return window.fbq('trackCustom', name, params);
  if (name === 'purchase') {
    // value and currency only; the order id lets Meta drop a repeated event
    return window.fbq('track', std, { value: params.value, currency: params.currency }, { eventID: params.transaction_id });
  }
  return window.fbq('track', std, params);
}

// Send one page_view for the current page. Path only: no query string (it can hold
// reset tokens) and profile pages are grouped, so no personal data is sent.
let lastView = { path: '', at: 0 };
export function trackPageView(pathname) {
  try {
    if (!window.gtag && !window.fbq) return;
    const path = pathname.startsWith('/c/') ? '/c/:id' : pathname;
    const now = Date.now();
    if (path === lastView.path && now - lastView.at < 1000) return; // duplicate guard
    lastView = { path, at: now };
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: document.title,
        page_path: path,
        page_location: `${window.location.origin}${path}`,
      });
    }
    if (window.fbq) window.fbq('track', 'PageView');
  } catch { /* analytics must never break the page */ }
}

// Fire an analytics event if GA4 / Meta Pixel are loaded. Never throws, so analytics
// can never break the page. Do not pass names, phone numbers or emails.
export function trackEvent(name, params = {}) {
  try {
    if (window.gtag) window.gtag('event', name, params);
    if (window.fbq) metaTrack(name, params);
  } catch { /* analytics must never break the page */ }
}

// GA4 'purchase' once a payment is confirmed. Sends the amount and currency only
// (Razorpay amounts are in paise) plus the order id so GA can drop duplicates.
export function trackPurchase(order) {
  try {
    trackEvent('purchase', {
      transaction_id: order.orderId,
      value: Number(order.amount) / 100,
      currency: order.currency || 'INR',
    });
  } catch { /* analytics must never break the page */ }
}
