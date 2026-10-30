import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, renderShell } from '../scripts/prerender-seo.mjs';
import { LANDING_PAGES } from '../src/landingPages.js';
import { PUBLIC_PAGES } from '../src/seoData.js';

// A cut-down copy of client-app/index.html: same tags the script has to replace.
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Old title</title>
    <meta name="description" content="old" />
    <meta property="og:title" content="old" />
    <meta property="og:image" content="old.png" />
    <meta name="twitter:card" content="summary" />
    <script type="application/ld+json" data-prerender="true">{"old":true}</script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
const count = (html, re) => (html.match(re) || []).length;

test('every public page gets its own title, description, canonical and robots, once', () => {
  for (const p of Object.keys(PUBLIC_PAGES)) {
    const html = renderPage(TEMPLATE, p);
    assert.equal(count(html, /<title>/g), 1, p);
    assert.equal(count(html, /name="description"/g), 1, p);
    assert.equal(count(html, /rel="canonical"/g), 1, p);
    assert.equal(count(html, /property="og:title"/g), 1, p);
    assert.equal(count(html, /name="twitter:card"/g), 1, p);
    assert.ok(html.includes(`<link rel="canonical" href="https://huntstag.com${p}" />`), p);
    assert.ok(!html.includes('Old title') && !html.includes('"old":true'), 'old tags are replaced');
    assert.ok(html.includes('content="index, follow"'));
    assert.ok(!html.includes('?'.concat('utm')), 'no query string');
  }
});

test('keyword pages carry their readable text and FAQ / breadcrumb data', () => {
  for (const page of LANDING_PAGES) {
    const html = renderPage(TEMPLATE, page.path);
    assert.equal(count(html, /<h1>/g), 1, page.path);
    assert.ok(html.includes(page.h1.replace(/&/g, '&amp;')) || html.includes(page.h1), page.path);
    assert.equal(count(html, /<details/g), page.faq.length);
    assert.ok(html.includes('"@type":"FAQPage"') && html.includes('"@type":"BreadcrumbList"'));
    assert.ok(html.includes(`<html lang="${page.lang || 'en'}"`));
  }
});

test('home page has Organization and WebSite data and an empty root', () => {
  const html = renderPage(TEMPLATE, '/');
  assert.ok(html.includes('"@type":"Organization"') && html.includes('"@type":"WebSite"'));
  assert.ok(html.includes('<div id="root"></div>'));
});

test('the noindex shell has no canonical, no page data and says noindex', () => {
  const shell = renderShell(renderPage(TEMPLATE, '/'));
  assert.ok(shell.includes('content="noindex, nofollow"'));
  assert.ok(!shell.includes('canonical') && !shell.includes('ld+json') && !shell.includes('og:title'));
  assert.equal(count(shell, /<title>/g), 1);
});

test('text is escaped so page data cannot break the HTML', () => {
  const html = renderPage(TEMPLATE, '/shop');
  assert.ok(!/<title>[^<]*[<>][^<]*<\/title>/.test(html));
});
