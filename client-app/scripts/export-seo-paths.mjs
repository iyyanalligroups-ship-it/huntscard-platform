// Writes the list of public page paths from the client data (seoData.js + landingPages.js):
//   - client-app/public/sitemap.xml       static fallback sitemap (no lastmod)
//   - backend/utils/seoPaths.json         list the backend's dynamic /sitemap.xml builds on
// Runs before every build (npm run build). Re-run by hand: npm run seo:export
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PAGES, SITE_URL } from '../src/seoData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const paths = Object.keys(PUBLIC_PAGES);

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>\n`).join('') +
  '</urlset>\n';
fs.writeFileSync(path.join(here, '..', 'public', 'sitemap.xml'), xml);

const backendUtils = path.join(here, '..', '..', 'backend', 'utils');
if (fs.existsSync(backendUtils)) {
  fs.writeFileSync(path.join(backendUtils, 'seoPaths.json'), JSON.stringify({ siteUrl: SITE_URL, paths }, null, 2) + '\n');
}
console.log(`[seo] wrote sitemap fallback with ${paths.length} pages`);
