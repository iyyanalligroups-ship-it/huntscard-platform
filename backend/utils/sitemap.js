// Dynamic /sitemap.xml. The page list comes from seoPaths.json (exported from the client app's
// seoData.js + landingPages.js by `npm run seo:export`), and lastmod comes from real database
// content: a page only gets a lastmod when the database holds its content.
const { siteUrl, paths } = require('./seoPaths.json');

const TTL_MS = 10 * 60 * 1000; // cache for about 10 minutes

// Which database collection backs which page. Pages not listed get no lastmod.
const LASTMOD_SOURCES = {
  '/faq': 'faq',
  '/shop': 'plans',
  '/catalog': 'catalog',
  '/magic-art': 'magicArt',
};

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function buildSitemapXml(lastmods = {}, pageList = paths, base = siteUrl) {
  const rows = pageList.map((p) => {
    const d = lastmods[LASTMOD_SOURCES[p]];
    const lastmod = d ? `<lastmod>${new Date(d).toISOString().slice(0, 10)}</lastmod>` : '';
    return `  <url><loc>${escapeXml(base + p)}</loc>${lastmod}</url>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('')}</urlset>\n`;
}

// Latest updatedAt of each content collection. Models are loaded lazily so tests can inject their own.
async function loadLastmods() {
  const latest = async (Model, filter = {}) => {
    const doc = await Model.findOne(filter).sort({ updatedAt: -1 }).select('updatedAt').lean();
    return doc ? doc.updatedAt : null;
  };
  const [faq, plans, catalog, magicArt] = await Promise.all([
    latest(require('../models/FaqEntry'), { active: true }),
    latest(require('../models/CardPlan'), { active: true }),
    latest(require('../models/CatalogEntry'), { active: true }),
    latest(require('../models/MagicArt')),
  ]);
  return { faq, plans, catalog, magicArt };
}

// Express handler with a small in-memory cache. If the database fails, it serves the last good
// copy, or a sitemap with no lastmod dates, so the sitemap never returns an error.
function createSitemapHandler({ getLastmods = loadLastmods, ttlMs = TTL_MS, now = Date.now } = {}) {
  let cached = null;
  let cachedAt = 0;
  return async function sitemapHandler(req, res) {
    if (!cached || now() - cachedAt >= ttlMs) {
      try {
        cached = buildSitemapXml(await getLastmods());
      } catch (err) {
        console.error('[sitemap] lastmod lookup failed:', err.message);
        cached = cached || buildSitemapXml();
      }
      cachedAt = now();
    }
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=600');
    res.send(cached);
  };
}

module.exports = { buildSitemapXml, createSitemapHandler, LASTMOD_SOURCES };
