// Runs after `vite build` (npm "postbuild"). The app is a single-page React app, so every address would
// otherwise download the same index.html with the home page title. This writes a copy of dist/index.html
// for each public page with that page's own title, description, canonical link, share tags and structured
// data, plus the readable text of the keyword pages, so crawlers that do not run JavaScript still see it.
//   dist/index.html                    the home page
//   dist/<path>/index.html             every other public page (nginx serves it, see deploy/nginx-seo.conf.example)
//   dist/app-shell.html                plain noindex shell for login, dashboard, profiles and unknown addresses
// React replaces the readable text when it starts, and removes the build-time structured data
// (script[data-prerender]) before adding its own, so nothing is shown or counted twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_OG_IMAGE, PUBLIC_PAGES, SITE_NAME, SITE_URL, landingJsonLd, siteJsonLd } from '../src/seoData.js';
import { LANDING_BY_PATH } from '../src/landingPages.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (data) => `<script type="application/ld+json" data-prerender="true">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// Tags this script owns. Anything already in the template with these names is replaced.
const OWNED = [
  /<title>[\s\S]*?<\/title>\s*/i,
  /<meta\s+name="description"[^>]*>\s*/i,
  /<meta\s+name="robots"[^>]*>\s*/i,
  /<link\s+rel="canonical"[^>]*>\s*/i,
  /<meta\s+property="og:[a-z:_]+"[^>]*>\s*/gi,
  /<meta\s+name="twitter:[a-z:_]+"[^>]*>\s*/gi,
  /<script type="application\/ld\+json" data-prerender="true">[\s\S]*?<\/script>\s*/gi,
];

function stripOwned(html) {
  let out = html;
  for (const re of OWNED) out = out.replace(re, '');
  return out;
}

function bodyFor(page) {
  const sections = page.sections.map((s) => `<section class="lp-section"><h2>${esc(s.h2)}</h2>${s.body.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('');
  const faq = page.faq.map((f) => `<details class="lp-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  const related = page.related.map((r) => `<li><a href="${esc(r)}">${esc(LANDING_BY_PATH[r]?.crumb || r)}</a></li>`).join('');
  return (
    `<div class="au-page lp-page" lang="${esc(page.lang || 'en')}">` +
    `<nav class="lp-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>${esc(page.crumb)}</span></nav>` +
    `<header class="lp-hero"><h1>${esc(page.h1)}</h1>${page.lead.map((p) => `<p class="lp-lead">${esc(p)}</p>`).join('')}` +
    `<a class="btn-primary au-cta" href="${esc(page.cta.to)}">${esc(page.cta.label)} →</a></header>` +
    `${sections}<section class="lp-section"><h2>Questions and answers</h2><div class="lp-faq">${faq}</div></section>` +
    `<section class="lp-section"><h2>Related pages</h2><ul class="lp-related">${related}</ul></section></div>`
  );
}

// Pure: template HTML in, page HTML out. `pathname` must be a key of PUBLIC_PAGES.
export function renderPage(template, pathname) {
  const seo = PUBLIC_PAGES[pathname];
  if (!seo) throw new Error(`not a public page: ${pathname}`);
  const url = `${SITE_URL}${pathname}`;
  const image = `${SITE_URL}${DEFAULT_OG_IMAGE}`;
  const landing = LANDING_BY_PATH[pathname];
  const head = [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(seo.title)}" />`,
    `<meta property="og:description" content="${esc(seo.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(seo.title)}" />`,
    `<meta name="twitter:description" content="${esc(seo.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    pathname === '/' ? jsonLd(siteJsonLd()) : '',
    landing ? jsonLd(landingJsonLd(landing)) : '',
  ].filter(Boolean).join('\n    ');

  let html = stripOwned(template);
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${esc(seo.lang || 'en')}"`);
  html = html.replace('</head>', `    ${head}\n  </head>`);
  if (landing) html = html.replace('<div id="root"></div>', `<div id="root">${bodyFor(landing)}</div>`);
  return html;
}

// Plain shell for pages that must not be indexed. The app sets the real title once it starts.
export function renderShell(template) {
  const html = stripOwned(template);
  return html.replace('</head>', `    <title>${SITE_NAME}</title>\n    <meta name="robots" content="noindex, nofollow" />\n  </head>`);
}

function main() {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(dist, 'app-shell.html'), renderShell(template));
  const paths = Object.keys(PUBLIC_PAGES);
  for (const p of paths) {
    const file = p === '/' ? path.join(dist, 'index.html') : path.join(dist, p, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderPage(template, p));
  }
  console.log(`[seo] wrote ${paths.length} page files and app-shell.html`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
