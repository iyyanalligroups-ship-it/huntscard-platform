// Loads Google Analytics 4 and/or Meta Pixel only when their IDs are set in
// client-app/.env (VITE_GA_ID, VITE_META_PIXEL_ID). Without IDs it does nothing.
function addScript(src) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function initAnalytics() {
  const gaId = import.meta.env.VITE_GA_ID;
  const pixelId = import.meta.env.VITE_META_PIXEL_ID;

  if (gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', gaId);
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`);
  }

  if (pixelId) {
    /* eslint-disable */
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }
}
