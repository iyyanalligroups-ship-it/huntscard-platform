import { Linking } from 'react-native';

// Business details shown on the home screen. Mirrors client-app/src/siteConfig.js
// (VITE_* there, EXPO_PUBLIC_* here). Anything left empty is hidden, never shown
// as a placeholder or a dead link.
export const SITE = {
  // WhatsApp business number, international format, digits only (e.g. 919876543210).
  whatsappNumber: (process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
  whatsappMessage: 'Hi HuntsTAG, I would like to know more about your NFC cards / Magic Posters.',
  cardsDelivered: process.env.EXPO_PUBLIC_CARDS_DELIVERED || '',
  deliveryTime: process.env.EXPO_PUBLIC_DELIVERY_TIME || '',
  freeDesignPreview: process.env.EXPO_PUBLIC_FREE_PREVIEW === 'true',
  fromPrice: process.env.EXPO_PUBLIC_FROM_PRICE || '',
  phone: process.env.EXPO_PUBLIC_PHONE || '',
  businessAddress: process.env.EXPO_PUBLIC_BUSINESS_ADDRESS || '',
  gstNumber: process.env.EXPO_PUBLIC_GST_NUMBER || '',
};

export function whatsappUrl(message = SITE.whatsappMessage) {
  if (!SITE.whatsappNumber) return null;
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(message) {
  const url = whatsappUrl(message);
  if (url) Linking.openURL(url).catch(() => {});
}

// Hook point for analytics (GA / Meta have no RN equivalent wired up yet).
// Kept so call sites match the website's trackEvent and can be filled in later.
export function trackEvent() {}

export function initialsOf(fullName) {
  return (fullName || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}
