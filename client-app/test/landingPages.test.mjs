import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_PAGES, LANDING_BY_PATH } from '../src/landingPages.js';
import { PUBLIC_PAGES } from '../src/seoData.js';

const words = (page) =>
  [page.h1, ...page.lead, ...page.sections.flatMap((s) => [s.h2, ...s.body]), ...page.faq.flatMap((f) => [f.q, f.a])]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

// Things we must never claim on the page (no invented prices, awards or rankings).
const BANNED = [/₹/, /\brs\.?\s?\d/i, /\bfree shipping\b/i, /#\s?1\b/, /\bbest\b/i, /\baward/i, /\bnumber one\b/i, /\d+\s*(days|hours)\b/i];

for (const page of LANDING_PAGES) {
  test(`${page.path}: copy checks`, () => {
    const n = words(page);
    assert.ok(n >= 250 && n <= 500, `${n} words, want 250-500`);
    assert.ok(page.faq.length >= 3 && page.faq.length <= 4, 'needs 3-4 FAQ items');
    assert.ok(page.title.length <= 65, `title ${page.title.length} chars`);
    assert.ok(page.description.length >= 100 && page.description.length <= 165, `description ${page.description.length} chars`);
    assert.ok(page.related.length >= 2);
    for (const r of page.related) assert.ok(LANDING_BY_PATH[r], `related path ${r} does not exist`);
    const all = JSON.stringify(page);
    for (const re of BANNED) assert.ok(!re.test(all), `banned claim ${re} found`);
  });
}

test('landing pages are registered as public pages and paths are unique', () => {
  const paths = LANDING_PAGES.map((p) => p.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const p of paths) assert.ok(PUBLIC_PAGES[p], `${p} missing from PUBLIC_PAGES`);
});
