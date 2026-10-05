// Business details used across the public site. Fill these in with real,
// truthful values -- anything left empty is hidden rather than shown as a
// placeholder or a broken link.
export const SITE = {
  // WhatsApp business number in international format, digits only
  // (e.g. '919876543210'). Empty = WhatsApp buttons are hidden.
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER || '',
  whatsappMessage: 'Hi HuntsTAG, I would like to know more about your NFC cards / Magic Posters.',
  // Real numbers only. Empty = that proof item is hidden.
  cardsDelivered: import.meta.env.VITE_CARDS_DELIVERED || '',
  deliveryTime: import.meta.env.VITE_DELIVERY_TIME || '',
  // Set to 'true' only once you really offer a free design preview.
  freeDesignPreview: import.meta.env.VITE_FREE_PREVIEW === 'true',
  fromPrice: import.meta.env.VITE_FROM_PRICE || '',
  businessAddress: import.meta.env.VITE_BUSINESS_ADDRESS || '',
  gstNumber: import.meta.env.VITE_GST_NUMBER || '',
  phone: import.meta.env.VITE_PHONE || '',
};

export function whatsappLink(message = SITE.whatsappMessage) {
  if (!SITE.whatsappNumber) return null;
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

// Fire an analytics event if GA4 / Meta Pixel are loaded (see analytics.js).
export function trackEvent(name, params = {}) {
  try {
    if (window.gtag) window.gtag('event', name, params);
    if (window.fbq) window.fbq('trackCustom', name, params);
  } catch { /* analytics must never break the page */ }
}

// Real customer quotes only. Each: { name, role, text }. Empty = section hidden.
export const TESTIMONIALS = [];

// URL of a sample public profile for the "try it live" block (e.g. '/c/your-slug'). Empty = hidden.
export const DEMO_PROFILE_URL = import.meta.env.VITE_DEMO_PROFILE_URL || '';
