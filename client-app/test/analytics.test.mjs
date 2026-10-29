import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser stand-ins so analytics.js can run in node.
const sent = [];
globalThis.document = { title: 'Page Title' };
globalThis.window = { location: { origin: 'https://huntstag.com' }, gtag: (...a) => sent.push(a) };
const { trackPageView, trackEvent, trackPurchase } = await import('../src/analytics.js');
const views = () => sent.filter((a) => a[1] === 'page_view');

test('page_view uses the current title and the path only', () => {
  trackPageView('/shop');
  assert.deepEqual(views().at(-1)[2], { page_title: 'Page Title', page_path: '/shop', page_location: 'https://huntstag.com/shop' });
});

test('profile pages are grouped, so no client id is sent', () => {
  trackPageView('/c/some-client');
  assert.equal(views().at(-1)[2].page_path, '/c/:id');
});

test('same page twice within one second sends one page_view', async () => {
  const n = views().length;
  trackPageView('/faq');
  trackPageView('/faq');
  assert.equal(views().length, n + 1);
  trackPageView('/about'); // a different page is never dropped
  assert.equal(views().length, n + 2);
});

test('purchase sends value in rupees, currency and order id only', () => {
  trackPurchase({ orderId: 'order_X', amount: 249900, currency: 'INR', secret: 'x' });
  const ev = sent.filter((a) => a[1] === 'purchase').at(-1);
  assert.deepEqual(ev[2], { transaction_id: 'order_X', value: 2499, currency: 'INR' });
});

test('helpers never throw, even without gtag', () => {
  delete globalThis.window.gtag;
  assert.doesNotThrow(() => { trackPageView('/x'); trackEvent('sign_up', { method: 'phone_otp' }); trackPurchase(undefined); });
});
