// Sitemap tests. Run: node --test test/*.test.js
// No database: lastmod lookups are replaced with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildSitemapXml, createSitemapHandler } = require('../utils/sitemap');
const { paths, siteUrl } = require('../utils/seoPaths.json');

function fakeRes() {
  const res = { headers: {}, body: null };
  res.set = (k, v) => { res.headers[k] = v; };
  res.send = (b) => { res.body = b; };
  return res;
}

test('sitemap lists every public page and no private page', () => {
  const xml = buildSitemapXml();
  for (const p of paths) assert.ok(xml.includes(`<loc>${siteUrl}${p}</loc>`), `${p} missing`);
  for (const bad of ['/login', '/dashboard', '/register', '/c/', '/magic-camera', '/chat', '?']) {
    assert.ok(!xml.includes(`${siteUrl}${bad}`), `${bad} must not be listed`);
  }
  assert.equal((xml.match(/<url>/g) || []).length, paths.length);
});

test('lastmod only appears for pages backed by database content', () => {
  const xml = buildSitemapXml({ faq: new Date('2026-03-04T10:00:00Z'), plans: null });
  assert.match(xml, /<loc>https:\/\/huntstag\.com\/faq<\/loc><lastmod>2026-03-04<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/huntstag\.com\/shop<\/loc><\/url>/); // no date in DB, none invented
  assert.match(xml, /<loc>https:\/\/huntstag\.com\/about<\/loc><\/url>/);
});

test('XML special characters are escaped', () => {
  const xml = buildSitemapXml({}, ['/a&b'], 'https://x.test');
  assert.ok(xml.includes('https://x.test/a&amp;b'));
});

test('handler caches for 10 minutes, then refreshes', async () => {
  let clock = 1_000_000;
  let lookups = 0;
  const handler = createSitemapHandler({ getLastmods: async () => { lookups += 1; return {}; }, now: () => clock });
  const call = async () => { const r = fakeRes(); await handler({}, r); return r; };
  const first = await call();
  await call();
  assert.equal(lookups, 1, 'second call within 10 minutes uses the cache');
  clock += 9 * 60 * 1000;
  await call();
  assert.equal(lookups, 1);
  clock += 2 * 60 * 1000;
  await call();
  assert.equal(lookups, 2, 'refreshes after 10 minutes');
  assert.equal(first.headers['Content-Type'], 'application/xml; charset=utf-8');
  assert.match(first.body, /^<\?xml/);
});

test('handler still answers when the database fails', async () => {
  const handler = createSitemapHandler({ getLastmods: async () => { throw new Error('db down'); } });
  const res = fakeRes();
  const orig = console.error; console.error = () => {};
  await handler({}, res);
  console.error = orig;
  assert.match(res.body, /<loc>https:\/\/huntstag\.com\/<\/loc>/);
});

test('seoPaths.json matches the client app pages (run npm run seo:export if this fails)', async () => {
  const clientData = path.join(__dirname, '..', '..', 'client-app', 'src', 'seoData.js');
  const { PUBLIC_PAGES } = await import(pathToFileURL(clientData).href);
  assert.deepEqual(paths, Object.keys(PUBLIC_PAGES));
});
