// Per-page SEO text. One entry per public page, keyed by path (no query string).
// Titles are about 60 characters and descriptions about 155. Only say things the
// site really does: no prices, delivery times, awards or "#1" claims.
import { LANDING_PAGES } from './landingPages.js';

export const SITE_URL = 'https://huntstag.com';
export const SITE_NAME = 'HuntsTAG';
export const DEFAULT_OG_IMAGE = '/assets/og-image.jpg'; // 1200x630
export const LOGO_URL = `${SITE_URL}/icon-512.png`;

export const PUBLIC_PAGES = {
  '/': {
    title: 'HuntsTAG | NFC Smart Business Cards & Magic Posters India',
    description:
      'Share your contact, WhatsApp and portfolio with one tap using an NFC smart business card. No app needed. Magic Posters play a video when scanned.',
  },
  '/shop': {
    title: 'Buy NFC Business Card Online in India | HuntsTAG Shop',
    description:
      'Choose your HuntsTAG NFC smart card plan and order online. Tap to share your profile with any phone, no app needed. All charges are shown at checkout.',
  },
  '/catalog': {
    title: 'NFC Smart Card Plans Compared | HuntsTAG Card Catalog',
    description:
      'See what each HuntsTAG NFC card plan includes, from simple name and logo cards to 3D avatar, intro video and AR cards. Compare and pick the right one.',
  },
  '/magic-art': {
    title: 'Magic Poster: Scan a Poster to Play a Video | HuntsTAG',
    description:
      'A HuntsTAG Magic Poster plays a video when someone scans it with a phone camera. No app to install. See the posters and how the scan works.',
  },
  '/faq': {
    title: 'NFC Card FAQ: Questions About HuntsTAG Cards | HuntsTAG',
    description:
      'Answers to common questions about HuntsTAG NFC smart business cards: how they work, how to order and how to use your card. Cannot find yours? Contact us.',
  },
  '/about': {
    title: 'About HuntsTAG: NFC Smart Business Cards in India',
    description:
      'HuntsTAG makes NFC smart business cards that share your contact, social links and portfolio with one tap. Learn how tap, QR and AR features work.',
  },
  '/huntsworld': {
    title: 'What is HuntsWorld? Link Your Listing to Your Card | HuntsTAG',
    description:
      'HuntsWorld is a business listing platform. Add your listing link to your HuntsTAG profile and anyone who taps your card can open it in one tap.',
  },
  '/contact': {
    title: 'Contact HuntsTAG | Questions About NFC Cards and Orders',
    description:
      'Questions about an NFC card plan, an order or Magic Posters? Send HuntsTAG a message through the contact form and our team will get back to you.',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | HuntsTAG',
    description: 'Read how HuntsTAG collects, uses and protects your information when you use our website, NFC smart cards, Magic Posters and mobile app.',
  },
  '/terms-condition': {
    title: 'Terms and Conditions | HuntsTAG',
    description: 'Read the terms that apply when you use the HuntsTAG website, create a card profile, or order HuntsTAG NFC smart cards and Magic Posters.',
  },
};

// Keyword landing pages (text in landingPages.js) are public pages too.
for (const p of LANDING_PAGES) {
  PUBLIC_PAGES[p.path] = { title: p.title, description: p.description, lang: p.lang };
}

// Pages that must never be indexed: sign-in, account, cart, tools, user profiles.
// Anything that is neither listed above nor here is an unknown address, also noindex.
export const PRIVATE_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/change-password',
  '/impersonate',
  '/dashboard',
  '/c/',
  '/magic-camera',
  '/magic-poster-cart',
  '/chat',
];

export const NOT_FOUND = {
  title: 'Page not found | HuntsTAG',
  description: 'This page does not exist. Go back to the HuntsTAG home page.',
};

// Structured data. Used by the React pages and by scripts/prerender-seo.mjs, so both write the same thing.
export function siteJsonLd() {
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: SITE_NAME, url: `${SITE_URL}/`, logo: LOGO_URL },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME, url: `${SITE_URL}/`, inLanguage: ['en-IN', 'hi'], publisher: { '@id': `${SITE_URL}/#organization` } },
  ];
}

export function landingJsonLd(page) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: page.crumb, item: `${SITE_URL}${page.path}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
}
