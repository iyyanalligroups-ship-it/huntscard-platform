const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { requireAdmin, requireSeniorAdmin, requireEncodeAccess, requireAdminPrime } = require('../middleware/auth');
const Client = require('../models/Client');
const Admin = require('../models/Admin');
const CardPlan = require('../models/CardPlan');
const CatalogEntry = require('../models/CatalogEntry');
const ArLayout = require('../models/ArLayout');
const ArIcon = require('../models/ArIcon');
const MagicArt = require('../models/MagicArt');
const MagicBusinessCard = require('../models/MagicBusinessCard');
const AttributeDefinition = require('../models/AttributeDefinition');
const CardRequest = require('../models/CardRequest');
const ContactMessage = require('../models/ContactMessage');
const Contact = require('../models/Contact');
const CatalogVideo = require('../models/CatalogVideo');
const Card = require('../models/Card');
const CardTicket = require('../models/CardTicket');
const CardInventory = require('../models/CardInventory');
const SiteSetting = require('../models/SiteSetting');
const cardCrypto = require('../utils/crypto'); // named apart from the built-in `crypto` above (line 4)
const { getChargeAmount } = require('../utils/pricing');

const router = express.Router();

// ---------------------------------------------------------------------
// Plan product photo upload -- up to 6 images per plan, shown on Shop so
// clients see the physical card before buying.
// ---------------------------------------------------------------------
const THEME_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']; // name kept generic, used for plan images too
const planImageStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'plans'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `plan-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const uploadPlanImages = multer({
  storage: planImageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!THEME_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------
// Catalog entry (card variant) photo upload -- up to 6 images per entry,
// shown on the public Catalog page (client-app's Catalog.jsx). Same
// shape as plan images above, own directory since these are a distinct
// concept from CardPlan (see models/CatalogEntry.js's own comment).
// ---------------------------------------------------------------------
const CATALOG_ENTRY_IMAGES_DIR = path.join(__dirname, '..', 'uploads', 'catalog-entries');
fs.mkdirSync(CATALOG_ENTRY_IMAGES_DIR, { recursive: true });
const catalogEntryImageStorage = multer.diskStorage({
  destination: CATALOG_ENTRY_IMAGES_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `catalog-entry-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const uploadCatalogEntryImages = multer({
  storage: catalogEntryImageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!THEME_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------
// Catalog video upload -- one showcase video per card type (Basic, Pro,
// Elite, etc.), shown on the public Catalog page. Same size class as the
// AR green-screen video (see profile.js) -- short clips easily run
// 20-50MB, so this needs a much larger limit than a compressed photo.
// ---------------------------------------------------------------------
const CATALOG_VIDEOS_DIR = path.join(__dirname, '..', 'uploads', 'catalog');
fs.mkdirSync(CATALOG_VIDEOS_DIR, { recursive: true });
const ALLOWED_CATALOG_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'];
const catalogVideoStorage = multer.diskStorage({
  destination: CATALOG_VIDEOS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `catalog-${req.params.cardType}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const uploadCatalogVideo = multer({
  storage: catalogVideoStorage,
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB, matches the AR video limit
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_CATALOG_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only MP4 or MOV videos are allowed'));
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------
// AR Logo -- a small icon per attribute (Contact Info, Portfolio, Social
// Icons, Huntsworld Link, AR Video/Photo), shown instead of the plain
// colored text pill in HuntsAR World once uploaded. Same singleton-doc
// pattern as the AR Layout default template above.
// ---------------------------------------------------------------------
// Not a fixed list anymore -- the four built-ins are always valid, any
// section an admin has created via the Attributes page becomes valid too
// the moment an attribute exists in it (same discovery the Attributes page
// itself uses), and any individual attribute flagged arComponent gets its
// OWN icon slot too (a section groups multiple tab fields together, but
// an AR panel component is its own single draggable element, so it needs
// a per-attribute-key slot, not just a per-section one).
async function getValidArIconKeys() {
  const customSections = await AttributeDefinition.distinct('section');
  const arComponentKeys = await AttributeDefinition.distinct('key', { active: true, arComponent: true });
  return new Set(['video', 'contact', 'portfolio', 'social', 'huntsworld', ...customSections, ...arComponentKeys]);
}

// Every upload writes into sectionIcons now (works for any key); the five
// named fields below are read only as a fallback for icons uploaded before
// sectionIcons existed, so nothing already live gets lost.
function mergeArIcons(doc) {
  if (!doc) return {};
  return {
    video: doc.video,
    contact: doc.contact,
    portfolio: doc.portfolio,
    social: doc.social,
    huntsworld: doc.huntsworld,
    ...Object.fromEntries(doc.sectionIcons || []),
    updatedBy: doc.updatedBy,
  };
}

const AR_ICONS_DIR = path.join(__dirname, '..', 'uploads', 'ar-icons');
fs.mkdirSync(AR_ICONS_DIR, { recursive: true });
const arIconStorage = multer.diskStorage({
  destination: AR_ICONS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${req.params.key}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const uploadArIcon = multer({
  storage: arIconStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB -- these are small badge/icon images, not photos
  fileFilter: (req, file, cb) => {
    if (!THEME_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// Generates a readable-but-random temporary password -- avoids visually
// ambiguous characters (0/O, 1/l/I) since this gets read off a screen and
// typed back in by whoever receives it (client or invited admin).
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomFillSync(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// -----------------------------------------------------------------------
// Site settings (currently just the homepage theme toggle)
// -----------------------------------------------------------------------

// GET /api/admin/site-settings -- so the admin toggle can show which
// theme is actually live right now, not just optimistically assume.
router.get('/site-settings', requireAdmin, async (req, res) => {
  try {
    const doc = await SiteSetting.findOne({ key: 'global' });
    res.json({ homeTheme: doc?.homeTheme || 'default' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/site-settings -- upserts the singleton doc, since
// nobody's touched this setting yet the first time it's ever changed.
router.patch('/site-settings', requireAdmin, async (req, res) => {
  const { homeTheme } = req.body;
  if (!['default', 'orange'].includes(homeTheme)) {
    return res.status(400).json({ error: 'homeTheme must be "default" or "orange"' });
  }
  try {
    const doc = await SiteSetting.findOneAndUpdate(
      { key: 'global' },
      { homeTheme, updatedBy: req.admin?.email || 'unknown' },
      { upsert: true, new: true }
    );
    res.json({ homeTheme: doc.homeTheme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------
// Dashboard stats
// -----------------------------------------------------------------------

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  const [totalClients, paid, encoded, adminCount, planCount, latestClient, monthlyAgg, pendingRequests, cardsByPlanAgg, recentClients, unclaimedOrders, unreadMessages, openCardTickets] = await Promise.all([
    Client.countDocuments({}),
    Client.countDocuments({ paid: true }),
    Client.countDocuments({ chipEncoded: true }),
    Admin.countDocuments({}),
    CardPlan.countDocuments({ active: true }),
    Client.findOne({}).sort({ createdAt: -1 }).select('fullName clientId cardType createdAt'),
    // Real client counts per month, last 6 months -- not fabricated
    // demo data, this is an actual aggregation over createdAt.
    Client.aggregate([
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 6 },
    ]),
    CardRequest.countDocuments({ status: 'pending' }),
    // Real count of clients per plan -- a client with a cardType assigned
    // represents a card sale, so this is a genuine sales-by-tier breakdown.
    Client.aggregate([
      { $match: { cardType: { $ne: null } } },
      { $group: { _id: '$cardType', count: { $sum: 1 } } },
    ]),
    Client.find({})
      .select('fullName clientId cardType paid chipEncoded createdAt')
      .sort({ createdAt: -1 })
      .limit(8),
    // Fulfillment badge count -- paid orders nobody has claimed yet.
    Client.countDocuments({ paid: true, claimedBy: null }),
    ContactMessage.countDocuments({ read: false }),
    CardTicket.countDocuments({ status: 'open' }),
  ]);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const clientsByMonth = monthlyAgg.map((m) => ({
    label: MONTH_NAMES[m._id.month - 1],
    count: m.count,
  }));

  // Attach plan display names to the raw key-based aggregation.
  const allPlans = await CardPlan.find({}).select('key name price priceAmount');
  const planByKey = Object.fromEntries(allPlans.map((p) => [p.key, p]));
  const planNameByKey = Object.fromEntries(allPlans.map((p) => [p.key, p.name]));
  const cardsByPlan = cardsByPlanAgg.map((c) => ({
    key: c._id,
    name: planNameByKey[c._id] || c._id,
    count: c.count,
  }));

  const stats = {
    totalClients,
    paid,
    unpaid: totalClients - paid,
    encoded,
    pendingEncode: paid - encoded,
    adminCount,
    activePlanCount: planCount,
    latestClient: latestClient || null,
    clientsByMonth,
    pendingRequests,
    cardsByPlan,
    recentClients,
    unclaimedOrders,
    unreadMessages,
    openCardTickets,
  };

  // Revenue -- Admin Prime only (see models/Admin.js's role comment).
  // Computed from real sales data (cardsByPlanAgg counts x each plan's
  // actual charge amount), not a placeholder -- everyone else's response
  // is unchanged from before this field existed.
  if (req.admin.role === 'primeadmin') {
    stats.revenue = cardsByPlanAgg.reduce((sum, c) => {
      const plan = planByKey[c._id];
      const amount = plan ? getChargeAmount(plan) : null;
      return sum + (amount || 0) * c.count;
    }, 0);
  }

  res.json(stats);
});

// -----------------------------------------------------------------------
// Card plans
// -----------------------------------------------------------------------

// GET /api/admin/plans?active=true
router.get('/plans', requireAdmin, async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.active = true;
  const plans = await CardPlan.find(filter).sort({ createdAt: 1 });
  res.json(plans);
});

// Shared validation for a plan's `variants` array -- used by both create
// and edit below. Each entry needs a non-empty name and a real shape;
// anything else means the request is malformed, not just "some fields
// missing" (there's no partial-variant concept).
function validateVariants(variants) {
  if (!Array.isArray(variants)) return 'variants must be an array';
  for (const v of variants) {
    if (!v || typeof v.name !== 'string' || !v.name.trim()) {
      return 'Each variant needs a non-empty name';
    }
    if (!['horizontal', 'vertical'].includes(v.shape)) {
      return 'Each variant needs a shape of "horizontal" or "vertical"';
    }
  }
  return null;
}

// POST /api/admin/plans
router.post('/plans', requireAdmin, (req, res) => {
  uploadPlanImages.array('images', 6)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { name, price, priceAmount, description, arEnabled, zingEnabled, magicEnabled, requiresDesignUpload, variants } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      // multipart/form-data can't carry a real nested array -- the
      // frontend sends `variants` as a JSON string, parsed here.
      let parsedVariants = [];
      if (variants) {
        try {
          parsedVariants = JSON.parse(variants);
        } catch {
          return res.status(400).json({ error: 'variants must be valid JSON' });
        }
        const variantError = validateVariants(parsedVariants);
        if (variantError) return res.status(400).json({ error: variantError });
      }

      let key = slugify(name);
      // Handle a name that collapses to an existing key (e.g. "Elite" and
      // "elite!!" both slugify to "elite") by appending a short suffix.
      const existing = await CardPlan.findOne({ key });
      if (existing) key = `${key}-${crypto.randomBytes(2).toString('hex')}`;

      const images = (req.files || []).map((f) => `${process.env.BACKEND_URL}/uploads/plans/${f.filename}`);

      const plan = await CardPlan.create({
        name,
        key,
        price,
        priceAmount: priceAmount !== undefined && priceAmount !== '' ? Number(priceAmount) : null,
        description,
        images,
        arEnabled: arEnabled === 'true' || arEnabled === true,
        zingEnabled: zingEnabled === 'true' || zingEnabled === true,
        magicEnabled: magicEnabled === 'true' || magicEnabled === true,
        variants: parsedVariants,
        requiresDesignUpload: requiresDesignUpload === 'true' || requiresDesignUpload === true,
      });
      res.status(201).json(plan);
    } catch (err2) {
      console.error('[admin/plans POST]', err2);
      res.status(500).json({ error: 'Failed to create plan' });
    }
  });
});

// PATCH /api/admin/plans/:id -- edit details or toggle active/inactive.
// Deliberately no DELETE: retiring a plan (active: false) keeps it valid
// for clients already assigned to it, just removes it from the "create
// client" dropdown going forward.
//
// `variants` is a WHOLE-ARRAY REPLACE, not a merge -- the admin frontend
// must send back the existing `_id` for every variant row it isn't newly
// adding. Mongoose only keeps a subdocument's `_id` stable if the object
// sent still carries that `_id`; omitting it mints a brand new one on
// save, which silently orphans any Client.cardVariantId already pointing
// at the old one. This is enforced client-side (Plans.jsx always
// round-trips loaded variant `_id`s), not re-validated here -- there's no
// way to distinguish "intentionally re-created variant" from "frontend
// bug that dropped the id" from the server side alone.
router.patch('/plans/:id', requireAdmin, async (req, res) => {
  try {
    const { name, price, priceAmount, description, active, arEnabled, zingEnabled, magicEnabled, requiresDesignUpload, variants } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = price;
    if (priceAmount !== undefined) updates.priceAmount = priceAmount === '' ? null : Number(priceAmount);
    if (description !== undefined) updates.description = description;
    if (active !== undefined) updates.active = active;
    if (arEnabled !== undefined) updates.arEnabled = arEnabled === 'true' || arEnabled === true;
    if (zingEnabled !== undefined) updates.zingEnabled = zingEnabled === 'true' || zingEnabled === true;
    if (magicEnabled !== undefined) updates.magicEnabled = magicEnabled === 'true' || magicEnabled === true;
    if (requiresDesignUpload !== undefined) updates.requiresDesignUpload = requiresDesignUpload === 'true' || requiresDesignUpload === true;
    if (variants !== undefined) {
      const variantError = validateVariants(variants);
      if (variantError) return res.status(400).json({ error: variantError });
      updates.variants = variants;
    }

    const plan = await CardPlan.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (err) {
    console.error('[admin/plans PATCH]', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// DELETE /api/admin/plans/:id
// Real delete, unlike Retire -- blocked if any client is currently on
// this plan, since deleting out from under them would leave their
// cardType pointing at nothing. Retire (active: false) is the safe
// option for a plan you're phasing out; Delete is for cleaning up a
// mistake (wrong name, duplicate, never actually used).
router.delete('/plans/:id', requireAdmin, async (req, res) => {
  try {
    const plan = await CardPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const clientsOnPlan = await Client.countDocuments({ cardType: plan.key });
    if (clientsOnPlan > 0) {
      return res.status(409).json({
        error: `${clientsOnPlan} client(s) are currently on this plan. Reassign them first, or use Retire instead of Delete.`,
      });
    }

    await CardPlan.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/plans DELETE]', err);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// POST /api/admin/plans/:id/images -- multipart/form-data, field "images" (multiple)
// Appends to whatever images the plan already has, capped at 6 total.
router.post('/plans/:id/images', requireAdmin, (req, res) => {
  uploadPlanImages.array('images', 6)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files received' });
    }

    try {
      const plan = await CardPlan.findById(req.params.id);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });

      const newUrls = req.files.map((f) => `${process.env.BACKEND_URL}/uploads/plans/${f.filename}`);
      const combined = [...plan.images, ...newUrls];
      if (combined.length > 6) {
        return res.status(400).json({ error: `This plan already has ${plan.images.length} image(s) -- max 6 total. Remove some first.` });
      }

      plan.images = combined;
      await plan.save();
      res.status(201).json(plan);
    } catch (err2) {
      console.error('[admin/plans images POST]', err2);
      res.status(500).json({ error: 'Failed to save images' });
    }
  });
});

// DELETE /api/admin/plans/:id/images -- body: { url } removes one specific image
router.delete('/plans/:id/images', requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const plan = await CardPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  plan.images = plan.images.filter((img) => img !== url);
  await plan.save();
  res.json(plan);
});

// ---------------------------------------------------------------------
// Card Plan VARIANT front/back photo -- a single variant's own product
// shot (e.g. the "White night" vs "Black sun" finish of a plan looking
// visibly different), distinct from the plan-level `images` above (which
// show the plan generally, not any one specific variant). Two fixed
// slots per variant, same pattern as CatalogEntry's own front/back
// routes -- just addressed by both the plan's id AND the variant
// subdocument's own id, since a variant lives inside CardPlan.variants
// rather than being its own top-level document. Only works for a variant
// that's already been saved (has a real _id) -- a brand-new row the
// admin just added client-side has nothing to upload against yet.
// ---------------------------------------------------------------------
const CARD_PLAN_VARIANTS_DIR = path.join(__dirname, '..', 'uploads', 'plan-variants');
fs.mkdirSync(CARD_PLAN_VARIANTS_DIR, { recursive: true });
const cardPlanVariantImageStorage = multer.diskStorage({
  destination: CARD_PLAN_VARIANTS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `plan-variant-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const uploadCardPlanVariantImage = multer({
  storage: cardPlanVariantImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!THEME_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

function cardPlanVariantImageSlotRoutes(slot, field) {
  router.post(`/plans/:planId/variants/:variantId/${slot}-image`, requireAdmin, (req, res) => {
    uploadCardPlanVariantImage.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No image file received' });

      try {
        const plan = await CardPlan.findById(req.params.planId);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        const variant = plan.variants.id(req.params.variantId);
        if (!variant) return res.status(404).json({ error: 'Variant not found' });

        const previousUrl = variant[field];
        variant[field] = `${process.env.BACKEND_URL}/uploads/plan-variants/${req.file.filename}`;
        await plan.save();
        if (previousUrl) {
          fs.unlink(path.join(CARD_PLAN_VARIANTS_DIR, path.basename(previousUrl)), () => {});
        }
        res.status(201).json(plan);
      } catch (err2) {
        console.error(`[admin/plans variant ${slot}-image POST]`, err2);
        res.status(500).json({ error: 'Failed to save image' });
      }
    });
  });

  router.delete(`/plans/:planId/variants/:variantId/${slot}-image`, requireAdmin, async (req, res) => {
    try {
      const plan = await CardPlan.findById(req.params.planId);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const variant = plan.variants.id(req.params.variantId);
      if (!variant) return res.status(404).json({ error: 'Variant not found' });

      const previousUrl = variant[field];
      variant[field] = null;
      await plan.save();
      if (previousUrl) {
        fs.unlink(path.join(CARD_PLAN_VARIANTS_DIR, path.basename(previousUrl)), () => {});
      }
      res.json(plan);
    } catch (err2) {
      console.error(`[admin/plans variant ${slot}-image DELETE]`, err2);
      res.status(500).json({ error: 'Failed to remove image' });
    }
  });
}
cardPlanVariantImageSlotRoutes('front', 'frontImageUrl');
cardPlanVariantImageSlotRoutes('back', 'backImageUrl');

// -----------------------------------------------------------------------
// Catalog entries (card variant showcase, see models/CatalogEntry.js)
// -----------------------------------------------------------------------

// GET /api/admin/catalog-entries
router.get('/catalog-entries', requireAdmin, async (req, res) => {
  const entries = await CatalogEntry.find().sort({ sortOrder: 1, createdAt: 1 });
  res.json(entries);
});

// POST /api/admin/catalog-entries -- multipart/form-data (fields "front"
// and "back", each a single optional file) + JSON-ish text fields.
// `features` arrives as a JSON string (same reason CardPlan's `variants`
// does, see POST /plans above).
router.post('/catalog-entries', requireAdmin, (req, res) => {
  uploadCatalogEntryImages.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { name, price, printingType, material, nfcChipSize, engravedTextColor, durability, colorCount, linkedPlanKey, features, active, sortOrder, viewLayout } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      let parsedFeatures = [];
      if (features) {
        try {
          parsedFeatures = JSON.parse(features);
        } catch {
          return res.status(400).json({ error: 'features must be valid JSON' });
        }
        if (!Array.isArray(parsedFeatures) || parsedFeatures.some((f) => typeof f !== 'string')) {
          return res.status(400).json({ error: 'features must be an array of strings' });
        }
      }

      let key = slugify(name);
      const existing = await CatalogEntry.findOne({ key });
      if (existing) key = `${key}-${crypto.randomBytes(2).toString('hex')}`;

      const frontFile = req.files?.front?.[0];
      const backFile = req.files?.back?.[0];

      const entry = await CatalogEntry.create({
        key,
        name,
        price: price !== undefined && price !== '' ? Number(price) : null,
        printingType,
        material,
        nfcChipSize,
        engravedTextColor,
        durability,
        colorCount: colorCount !== undefined && colorCount !== '' ? Number(colorCount) : null,
        features: parsedFeatures,
        frontImageUrl: frontFile ? `${process.env.BACKEND_URL}/uploads/catalog-entries/${frontFile.filename}` : null,
        backImageUrl: backFile ? `${process.env.BACKEND_URL}/uploads/catalog-entries/${backFile.filename}` : null,
        linkedPlanKey: linkedPlanKey || null,
        active: active === 'true' || active === true || active === undefined,
        sortOrder: sortOrder !== undefined && sortOrder !== '' ? Number(sortOrder) : 0,
        viewLayout: viewLayout === 'horizontal' ? 'horizontal' : 'vertical',
        updatedBy: req.admin?.email || 'unknown',
      });
      res.status(201).json(entry);
    } catch (err2) {
      console.error('[admin/catalog-entries POST]', err2);
      res.status(500).json({ error: 'Failed to create catalog entry' });
    }
  });
});

// PATCH /api/admin/catalog-entries/:id -- edit details, no images (see the
// dedicated images routes below for that).
router.patch('/catalog-entries/:id', requireAdmin, async (req, res) => {
  try {
    const { name, price, printingType, material, nfcChipSize, engravedTextColor, durability, colorCount, linkedPlanKey, features, active, sortOrder, viewLayout } = req.body;
    const updates = { updatedBy: req.admin?.email || 'unknown' };
    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = price === '' ? null : Number(price);
    if (printingType !== undefined) updates.printingType = printingType;
    if (material !== undefined) updates.material = material;
    if (nfcChipSize !== undefined) updates.nfcChipSize = nfcChipSize;
    if (engravedTextColor !== undefined) updates.engravedTextColor = engravedTextColor;
    if (durability !== undefined) updates.durability = durability;
    if (colorCount !== undefined) updates.colorCount = colorCount === '' ? null : Number(colorCount);
    if (linkedPlanKey !== undefined) updates.linkedPlanKey = linkedPlanKey || null;
    if (active !== undefined) updates.active = active === 'true' || active === true;
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder) || 0;
    if (viewLayout !== undefined) updates.viewLayout = viewLayout === 'horizontal' ? 'horizontal' : 'vertical';
    if (features !== undefined) {
      if (!Array.isArray(features) || features.some((f) => typeof f !== 'string')) {
        return res.status(400).json({ error: 'features must be an array of strings' });
      }
      updates.features = features;
    }

    const entry = await CatalogEntry.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!entry) return res.status(404).json({ error: 'Catalog entry not found' });
    res.json(entry);
  } catch (err) {
    console.error('[admin/catalog-entries PATCH]', err);
    res.status(500).json({ error: 'Failed to update catalog entry' });
  }
});

// DELETE /api/admin/catalog-entries/:id
router.delete('/catalog-entries/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await CatalogEntry.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Catalog entry not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/catalog-entries DELETE]', err);
    res.status(500).json({ error: 'Failed to delete catalog entry' });
  }
});

// Front/back are two fixed, named slots (not a growable list) -- each of
// these four routes sets or clears exactly one of them, deleting the
// previous file from disk on replace/clear (same pattern as the Magic
// Business Card image/video routes above).
function catalogEntryImageSlotRoutes(slot, field) {
  router.post(`/catalog-entries/:id/${slot}-image`, requireAdmin, (req, res) => {
    uploadCatalogEntryImages.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No image file received' });

      try {
        const entry = await CatalogEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Catalog entry not found' });

        const previousUrl = entry[field];
        entry[field] = `${process.env.BACKEND_URL}/uploads/catalog-entries/${req.file.filename}`;
        entry.updatedBy = req.admin?.email || 'unknown';
        await entry.save();
        if (previousUrl) {
          fs.unlink(path.join(CATALOG_ENTRY_IMAGES_DIR, path.basename(previousUrl)), () => {});
        }
        res.status(201).json(entry);
      } catch (err2) {
        console.error(`[admin/catalog-entries ${slot}-image POST]`, err2);
        res.status(500).json({ error: 'Failed to save image' });
      }
    });
  });

  router.delete(`/catalog-entries/:id/${slot}-image`, requireAdmin, async (req, res) => {
    const entry = await CatalogEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Catalog entry not found' });

    const previousUrl = entry[field];
    entry[field] = null;
    entry.updatedBy = req.admin?.email || 'unknown';
    await entry.save();
    if (previousUrl) {
      fs.unlink(path.join(CATALOG_ENTRY_IMAGES_DIR, path.basename(previousUrl)), () => {});
    }
    res.json(entry);
  });
}
catalogEntryImageSlotRoutes('front', 'frontImageUrl');
catalogEntryImageSlotRoutes('back', 'backImageUrl');

// -----------------------------------------------------------------------
// Clients
// -----------------------------------------------------------------------
// Two ways to become a client now: admin creates the account directly
// (this route -- for people admin already has a personal relationship
// with, deals with in person, over phone, etc) or self-registration via
// POST /api/auth/register (for a new/unknown customer who finds the
// website and signs themselves up). Both land in the same Clients list.

// POST /api/admin/clients
// Creates a client account and returns the plaintext temp password ONCE,
// in this response only -- it is never stored or retrievable again after
// this call. Admin is responsible for passing it on to the client.
router.post('/clients', requireAdmin, async (req, res) => {
  try {
    const { fullName, loginEmail, cardType, phone, cardVariantId } = req.body;
    if (!fullName || !loginEmail) {
      return res.status(400).json({ error: 'fullName and loginEmail are required' });
    }

    let resolvedVariantId = null;
    if (cardType) {
      const plan = await CardPlan.findOne({ key: cardType.toLowerCase(), active: true });
      if (!plan) return res.status(400).json({ error: 'cardType must match an active card plan' });
      if (cardVariantId) {
        if (!plan.variants.some((v) => v._id.toString() === cardVariantId)) {
          return res.status(400).json({ error: 'cardVariantId must match a variant on the selected plan' });
        }
        resolvedVariantId = cardVariantId;
      }
    }

    const existing = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'A client with this email already exists' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const clientId = nanoid(10); // this becomes the tap URL: /c/{clientId}

    const client = await Client.create({
      clientId,
      loginEmail: loginEmail.toLowerCase(),
      passwordHash,
      fullName,
      phone,
      cardType: cardType ? cardType.toLowerCase() : null,
      cardVariantId: resolvedVariantId,
      mustChangePassword: true,
    });

    res.status(201).json({
      clientId: client.clientId,
      loginEmail: client.loginEmail,
      tempPassword, // shown once -- copy it now to send to the client
      cardType: client.cardType,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${client.clientId}`,
    });
  } catch (err) {
    console.error('[admin/clients POST]', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// GET /api/admin/clients?status=pending-encode
router.get('/clients', requireAdmin, async (req, res) => {
  const filter = {};
  if (req.query.status === 'pending-encode') {
    filter.paid = true;
    filter.chipEncoded = false;
  }
  const clients = await Client.find(filter)
    .select('clientId fullName loginEmail phone gender dateOfBirth cardType logoUrl paid blocked chipEncoded encodedAt encodedBy createdAt')
    .sort({ createdAt: -1 });
  res.json(clients);
});

// GET /api/admin/clients/:clientId -- one client's full detail, for the
// admin's per-client detail page (see client-app... err, admin
// ClientDetail.jsx). Same field whitelist as the list route above, plus
// bannerUrl/customDesignFrontUrl/cardShape -- needed for the AR tracking
// target download (see profile.js's withPlanFlags / public.js's own
// cardShape resolution for the client-facing equivalent of this).
router.get('/clients/:clientId', requireAdmin, async (req, res) => {
  const client = await Client.findOne({ clientId: req.params.clientId })
    .select(
      'clientId fullName loginEmail phone gender dateOfBirth cardType logoUrl paid blocked chipEncoded encodedAt encodedBy createdAt bannerUrl customDesignFrontUrl cardVariantId'
    );
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const plan = await CardPlan.findOne({ key: client.cardType }).select('variants');
  const clientObj = client.toObject();
  const variant = plan?.variants?.find((v) => v._id.toString() === String(client.cardVariantId));
  clientObj.cardShape = variant?.shape || 'horizontal';
  res.json(clientObj);
});

// PATCH /api/admin/clients/:clientId/paid
router.patch('/clients/:clientId/paid', requireAdmin, async (req, res) => {
  const client = await Client.findOneAndUpdate(
    { clientId: req.params.clientId },
    { $set: { paid: true } },
    { new: true }
  ).select('clientId fullName paid');

  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

// PATCH /api/admin/clients/:clientId
// General edit -- account-level fields only (name, login email, phone,
// card type). Deliberately does NOT touch the client's own profile
// content (bio, social links, photo) -- that's their content to manage,
// not admin's to overwrite without cause.
router.patch('/clients/:clientId', requireAdmin, async (req, res) => {
  try {
    const {
      fullName, loginEmail, phone, cardType, cardVariantId, blocked,
      jobTitle, bio, whatsapp, publicEmail, instagramUrl, twitterUrl, portfolioUrl, huntsworldUrl,
      chipEncoded,
    } = req.body;
    const updates = {};

    if (fullName !== undefined) updates.fullName = fullName;
    if (phone !== undefined) updates.phone = phone;
    if (blocked !== undefined) updates.blocked = blocked;
    // Deliberately narrow: chipEncoded can only be reset to FALSE here (to
    // allow writing a replacement/second physical card for someone who
    // already has one -- lost card, backup, etc.). It can never be set to
    // TRUE through this route -- that only happens for real, via the
    // encode tool actually writing and locking a chip.
    if (chipEncoded === false) updates.chipEncoded = false;
    if (jobTitle !== undefined) updates.jobTitle = jobTitle;
    if (bio !== undefined) updates.bio = bio;
    if (whatsapp !== undefined) updates.whatsapp = whatsapp;
    if (publicEmail !== undefined) updates.publicEmail = publicEmail;
    if (instagramUrl !== undefined) updates.instagramUrl = instagramUrl;
    if (twitterUrl !== undefined) updates.twitterUrl = twitterUrl;
    if (portfolioUrl !== undefined) updates.portfolioUrl = portfolioUrl;
    if (huntsworldUrl !== undefined) updates.huntsworldUrl = huntsworldUrl;

    if (loginEmail !== undefined) {
      const existing = await Client.findOne({
        loginEmail: loginEmail.toLowerCase(),
        clientId: { $ne: req.params.clientId },
      });
      if (existing) return res.status(409).json({ error: 'Another client already uses this email' });
      updates.loginEmail = loginEmail.toLowerCase();
    }

    if (cardType !== undefined) {
      if (cardType) {
        const plan = await CardPlan.findOne({ key: cardType.toLowerCase() });
        if (!plan) return res.status(400).json({ error: 'cardType must match an existing card plan' });
        if (cardVariantId) {
          if (!plan.variants.some((v) => v._id.toString() === cardVariantId)) {
            return res.status(400).json({ error: 'cardVariantId must match a variant on the selected plan' });
          }
          updates.cardVariantId = cardVariantId;
        } else if (cardVariantId !== undefined) {
          updates.cardVariantId = null;
        }
      } else {
        // Clearing the plan clears whatever variant it was carrying too.
        updates.cardVariantId = null;
      }
      updates.cardType = cardType ? cardType.toLowerCase() : null;
    } else if (cardVariantId !== undefined) {
      // cardType isn't changing -- validate the variant against the
      // client's CURRENT plan instead.
      const existingClient = await Client.findOne({ clientId: req.params.clientId }).select('cardType');
      if (!existingClient) return res.status(404).json({ error: 'Client not found' });
      if (cardVariantId) {
        const plan = existingClient.cardType ? await CardPlan.findOne({ key: existingClient.cardType }) : null;
        if (!plan || !plan.variants.some((v) => v._id.toString() === cardVariantId)) {
          return res.status(400).json({ error: "cardVariantId must match a variant on the client's current plan" });
        }
      }
      updates.cardVariantId = cardVariantId || null;
    }

    const client = await Client.findOneAndUpdate(
      { clientId: req.params.clientId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash -chipPasswordHash');

    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('[admin/clients PATCH]', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/admin/clients/:clientId
// Real delete -- no "reassign first" block like plans, since the client
// IS the thing being removed, not something other data points at. Note
// left for the caller: if the card was already physically encoded, its
// tap URL (/c/{clientId}) will show "Card not found" after this, since
// the chip's URL never changes and can't point anywhere else without
// re-encoding. CardRequest history for this clientId is left in place
// (Requests already shows "(deleted client)" for orphaned entries) --
// not cascade-deleted, since that's a real audit trail of what happened.
router.delete('/clients/:clientId', requireAdmin, async (req, res) => {
  const client = await Client.findOneAndDelete({ clientId: req.params.clientId });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({ ok: true, wasEncoded: client.chipEncoded });
});

// GET /api/admin/clients/:clientId/contacts -- read-only view into a
// client's own phone-contacts backup (see models/Contact.js, normally
// strictly private to that client -- see routes/contacts.js). Admin
// visibility into this data, per explicit request, is the groundwork for
// later cross-referencing the same phone number across multiple clients'
// contacts (a caller-ID-style lookup) -- that cross-client matching isn't
// built yet, this is just the per-client read.
router.get('/clients/:clientId/contacts', requireAdmin, async (req, res) => {
  const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId fullName');
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const contacts = await Contact.find({ clientId: req.params.clientId }).sort({ name: 1 });
  res.json({ client: { clientId: client.clientId, fullName: client.fullName }, contacts });
});

// -----------------------------------------------------------------------
// Fulfillment pipeline -- one row per PHYSICAL CARD (see models/Card.js),
// not per client. A paid purchase (first-time or a repeat/extra-quantity
// one) pre-creates a Card placeholder per unit paid for (see
// routes/profile.js's createCardsForPurchase), so a client who buys more
// than once, or more than one at a time, gets an independently trackable
// row for each card instead of just their first ever showing up here.
// Stages, derived from existing fields rather than a separate status to
// keep in sync: Paid -> claimedBy set -> assignedTo set -> encoded true
// (the encode tool sets this directly -- "Created" IS this flag, not a
// parallel one) -> dispatched true -> delivered true.
// Claim/assign/dispatch/deliver are requireSeniorAdmin -- subadmins can be
// assigned work and the encode tool still works for them exactly as
// before, they just can't claim or hand off orders themselves.
//
// Card #1 specifically is mirrored back onto the legacy Client fields on
// every mutation below, same precedent already established by
// POST /cards/:cardId/mark-encoded further down -- everything that still
// reads Client.dispatched/delivered/trackingId/etc directly (the client's
// own Track/Dashboard pages) keeps working for a client's first card
// without needing to be migrated itself. Cards 2+ are Card-only.
// -----------------------------------------------------------------------

function mirrorCardOneToClient(card, fields) {
  if (card.cardNumber !== 1) return Promise.resolve();
  return Client.updateOne({ clientId: card.clientId }, { $set: fields });
}

// GET /api/admin/fulfillment
// Every card on file, grouped by client, for the fulfillment pipeline view.
// Includes already-delivered ones too (filter client-side) so the page can
// show history.
router.get('/fulfillment', requireAdmin, async (req, res) => {
  const cards = await Card.find({})
    .select('clientId cardNumber cardType cardVariantId claimedBy assignedTo encoded encodedAt dispatched dispatchedAt dispatchedBy trackingId delivered deliveredAt createdAt')
    .sort({ createdAt: -1 });

  const clientIds = [...new Set(cards.map((c) => c.clientId))];
  const clients = await Client.find({ clientId: { $in: clientIds } }).select('clientId fullName');
  const nameMap = Object.fromEntries(clients.map((c) => [c.clientId, c.fullName]));

  // Resolve each card's cardVariantId into a real name/shape, same join
  // pattern GET /requests already uses for CardRequest.variantBreakdown.
  const planKeys = [...new Set(cards.map((c) => c.cardType).filter(Boolean))];
  const plans = await CardPlan.find({ key: { $in: planKeys } }).select('key variants');
  const variantMap = {}; // `${planKey}:${variantId}` -> { name, shape }
  plans.forEach((p) => {
    p.variants.forEach((v) => {
      variantMap[`${p.key}:${v._id.toString()}`] = { name: v.name, shape: v.shape };
    });
  });

  const byClient = {};
  for (const c of cards) {
    const obj = c.toObject();
    const variant = c.cardVariantId ? variantMap[`${c.cardType}:${String(c.cardVariantId)}`] : null;
    (byClient[c.clientId] ||= []).push({
      cardId: obj._id,
      cardNumber: obj.cardNumber,
      cardType: obj.cardType,
      variantName: variant?.name || null,
      shape: variant?.shape || null,
      claimedBy: obj.claimedBy,
      assignedTo: obj.assignedTo,
      encoded: obj.encoded,
      encodedAt: obj.encodedAt,
      dispatched: obj.dispatched,
      dispatchedAt: obj.dispatchedAt,
      dispatchedBy: obj.dispatchedBy,
      trackingId: obj.trackingId,
      delivered: obj.delivered,
      deliveredAt: obj.deliveredAt,
    });
  }

  res.json(
    clientIds.map((clientId) => ({
      clientId,
      fullName: nameMap[clientId] || '(deleted client)',
      cards: byClient[clientId],
    }))
  );
});

// PATCH /api/admin/fulfillment/cards/:cardId/claim
router.patch('/fulfillment/cards/:cardId/claim', requireSeniorAdmin, async (req, res) => {
  const card = await Card.findById(req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (card.claimedBy) return res.status(409).json({ error: `Already claimed by ${card.claimedBy}` });

  card.claimedBy = req.admin.email;
  await card.save();
  await mirrorCardOneToClient(card, { claimedBy: card.claimedBy });
  res.json(card);
});

// PATCH /api/admin/fulfillment/cards/:cardId/assign
// body: { subadminEmail }
router.patch('/fulfillment/cards/:cardId/assign', requireSeniorAdmin, async (req, res) => {
  try {
    const { subadminEmail } = req.body;
    if (!subadminEmail) return res.status(400).json({ error: 'subadminEmail is required' });

    const subadmin = await Admin.findOne({ email: subadminEmail.toLowerCase() });
    if (!subadmin) return res.status(400).json({ error: 'No admin account with that email' });

    const card = await Card.findById(req.params.cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (!card.claimedBy) {
      return res.status(400).json({ error: 'Claim this card before assigning it.' });
    }

    card.assignedTo = subadmin.email;
    await card.save();
    await mirrorCardOneToClient(card, { assignedTo: card.assignedTo });
    res.json(card);
  } catch (err) {
    console.error('[admin/fulfillment assign]', err);
    res.status(500).json({ error: 'Failed to assign' });
  }
});

// PATCH /api/admin/fulfillment/cards/:cardId/dispatch
// Blocked until the card is actually encoded -- can't ship what doesn't
// physically exist yet. Requires a tracking ID, since that's what the
// client-facing Track page shows them once it's shipped.
router.patch('/fulfillment/cards/:cardId/dispatch', requireSeniorAdmin, async (req, res) => {
  const { trackingId } = req.body;
  if (!trackingId) return res.status(400).json({ error: 'trackingId is required to mark as dispatched' });

  const card = await Card.findById(req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!card.encoded) {
    return res.status(400).json({ error: 'Card must be encoded before it can be dispatched.' });
  }

  card.dispatched = true;
  card.dispatchedAt = new Date();
  card.dispatchedBy = req.admin.email;
  card.trackingId = trackingId;
  await card.save();
  await mirrorCardOneToClient(card, {
    dispatched: card.dispatched,
    dispatchedAt: card.dispatchedAt,
    dispatchedBy: card.dispatchedBy,
    trackingId: card.trackingId,
  });
  res.json(card);
});

// PATCH /api/admin/fulfillment/cards/:cardId/deliver
// Final stage -- confirms the card actually reached the client.
router.patch('/fulfillment/cards/:cardId/deliver', requireSeniorAdmin, async (req, res) => {
  const card = await Card.findById(req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!card.dispatched) {
    return res.status(400).json({ error: 'Card must be dispatched before it can be marked delivered.' });
  }

  card.delivered = true;
  card.deliveredAt = new Date();
  await card.save();
  await mirrorCardOneToClient(card, { delivered: card.delivered, deliveredAt: card.deliveredAt });
  res.json(card);
});

// -----------------------------------------------------------------------
// Team (other admin / support accounts)
// -----------------------------------------------------------------------

// GET /api/admin/team
router.get('/team', requireAdmin, async (req, res) => {
  const team = await Admin.find({}).select('email name role createdAt').sort({ createdAt: 1 });
  res.json(team);
});

// POST /api/admin/team
// Invites a new admin/subadmin/employee account -- Admin Prime only (see
// models/Admin.js's role comment). Role determines fulfillment pipeline
// permissions for admin/subadmin (see requireSeniorAdmin); 'employee' is
// scoped to the encode tool only (see requireEncodeAccess). 'primeadmin'
// is deliberately NOT an accepted value here -- it's a singleton, never
// created via ordinary invite, only via POST /team/:id/promote-to-prime.
// Returns the temp password once, same handoff pattern as client creation.
router.post('/team', requireAdminPrime, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }
    if (role && !['admin', 'subadmin', 'employee'].includes(role)) {
      return res.status(400).json({ error: "role must be 'admin', 'subadmin', or 'employee'" });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An admin with this email already exists' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await Admin.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: role || 'admin',
      mustChangePassword: true,
    });

    res.status(201).json({ email: email.toLowerCase(), tempPassword, name, role: role || 'admin' });
  } catch (err) {
    console.error('[admin/team POST]', err);
    res.status(500).json({ error: 'Failed to create team account' });
  }
});

// DELETE /api/admin/team/:id -- Admin Prime only. Guardrails: the Admin
// Prime account itself can NEVER be deleted by anyone, including itself
// (only requireAdminPrime can even reach this route, so this specifically
// blocks Prime from deleting their own account); an admin can't delete
// their own account otherwise (avoids accidentally locking themselves out
// mid-session); and the last remaining admin account can't be deleted at
// all (avoids locking EVERYONE out with no way back in short of touching
// the database directly).
router.delete('/team/:id', requireAdminPrime, async (req, res) => {
  try {
    const target = await Admin.findById(req.params.id).select('role');
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.role === 'primeadmin') {
      return res.status(400).json({ error: "The Admin Prime account can't be deleted." });
    }
    if (req.params.id === req.admin.adminId) {
      return res.status(400).json({ error: "You can't delete your own account while logged in as it." });
    }

    const totalAdmins = await Admin.countDocuments({});
    if (totalAdmins <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining admin account.' });
    }

    await Admin.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/team DELETE]', err);
    res.status(500).json({ error: 'Failed to delete team account' });
  }
});

// PATCH /api/admin/team/:id -- edit a team member's name/email/role.
// Admin Prime only. Role can be changed freely between
// 'admin'/'subadmin'/'employee', but this route will never set OR change
// AWAY FROM 'primeadmin' -- that's exclusively handled by the dedicated
// promote-to-prime transfer above, which also guarantees the singleton.
router.patch('/team/:id', requireAdminPrime, async (req, res) => {
  try {
    const target = await Admin.findById(req.params.id).select('role');
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    const { name, email, role } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (role !== undefined) {
      if (target.role === 'primeadmin') {
        return res.status(400).json({ error: "Use the Promote to Prime action to change who holds Admin Prime, not this." });
      }
      if (!['admin', 'subadmin', 'employee'].includes(role)) {
        return res.status(400).json({ error: "role must be 'admin', 'subadmin', or 'employee'" });
      }
      updates.role = role;
    }

    if (updates.email) {
      const existing = await Admin.findOne({ email: updates.email, _id: { $ne: req.params.id } });
      if (existing) return res.status(409).json({ error: 'An admin with this email already exists' });
    }

    const updated = await Admin.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).select('email name role createdAt');
    res.json(updated);
  } catch (err) {
    console.error('[admin/team PATCH]', err);
    res.status(500).json({ error: 'Failed to update team account' });
  }
});

// POST /api/admin/team/:id/reset-password -- Admin Prime only. Generates
// a new temp password and sets mustChangePassword, same handoff pattern
// as inviting a new account (POST /team) -- shown once in the response,
// never stored/logged in plaintext.
router.post('/team/:id/reset-password', requireAdminPrime, async (req, res) => {
  try {
    const target = await Admin.findById(req.params.id).select('email name');
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await Admin.updateOne({ _id: req.params.id }, { $set: { passwordHash, mustChangePassword: true } });

    res.json({ email: target.email, name: target.name, tempPassword });
  } catch (err) {
    console.error('[admin/team reset-password POST]', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST /api/admin/team/:id/promote-to-prime -- Admin Prime only. A
// TRANSFER, not a duplication: atomically promotes the target and demotes
// the current Prime (the requester) to 'admin' in the same operation, so
// there is never more than one Admin Prime at a time by construction.
router.post('/team/:id/promote-to-prime', requireAdminPrime, async (req, res) => {
  try {
    const target = await Admin.findById(req.params.id).select('role email');
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.role === 'employee') {
      return res.status(400).json({ error: 'An employee account must be promoted to admin first, not directly to Admin Prime.' });
    }
    if (String(target._id) === req.admin.adminId) {
      return res.status(400).json({ error: 'You are already Admin Prime.' });
    }

    await Admin.updateOne({ _id: req.admin.adminId }, { $set: { role: 'admin' } });
    await Admin.updateOne({ _id: target._id }, { $set: { role: 'primeadmin' } });

    res.json({ ok: true, newPrime: target.email });
  } catch (err) {
    console.error('[admin/team promote-to-prime POST]', err);
    res.status(500).json({ error: 'Failed to transfer Admin Prime' });
  }
});

// -----------------------------------------------------------------------
// Card requests (upgrade / new card, submitted by clients)
// -----------------------------------------------------------------------

// GET /api/admin/requests?status=pending
router.get('/requests', requireAdmin, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const requests = await CardRequest.find(filter).sort({ createdAt: -1 });

  // Attach basic client info (name) for display -- requests only store
  // clientId, so join it here rather than making the frontend do a
  // second round trip per row.
  const clientIds = [...new Set(requests.map((r) => r.clientId))];
  const clients = await Client.find({ clientId: { $in: clientIds } }).select('clientId fullName');
  const clientMap = Object.fromEntries(clients.map((c) => [c.clientId, c.fullName]));

  // Resolve each variantBreakdown entry's variantId into a real name/shape
  // for display -- requests only store the ObjectId reference (see
  // CardRequest.variantBreakdown's own comment), joined here the same way
  // clientName above is, rather than making the frontend do its own
  // per-plan lookup.
  const planKeys = [...new Set(requests.map((r) => r.requestedPlan).filter(Boolean))];
  const plans = await CardPlan.find({ key: { $in: planKeys } }).select('key variants');
  const variantMap = {}; // `${planKey}:${variantId}` -> { name, shape }
  plans.forEach((p) => {
    p.variants.forEach((v) => {
      variantMap[`${p.key}:${v._id.toString()}`] = { name: v.name, shape: v.shape };
    });
  });

  res.json(
    requests.map((r) => {
      const obj = r.toObject();
      return {
        ...obj,
        clientName: clientMap[r.clientId] || '(deleted client)',
        variantBreakdown: (obj.variantBreakdown || []).map((entry) => ({
          ...entry,
          ...(variantMap[`${obj.requestedPlan}:${String(entry.variantId)}`] || {}),
        })),
      };
    })
  );
});

// PATCH /api/admin/requests/:id
// Approving an 'upgrade' request actually applies the cardType change to
// the client record -- this is the one place a request becomes real.
// Approving a 'new_card' request does NOT auto-create a second client
// account (too ambiguous to automate safely); admin creates that manually
// from the Clients screen, then marks this 'fulfilled' once done.
router.patch('/requests/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected', 'fulfilled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await CardRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (status === 'approved' && request.type === 'upgrade') {
      await Client.findOneAndUpdate({ clientId: request.clientId }, { $set: { cardType: request.requestedPlan } });
    }

    request.status = status;
    await request.save();
    res.json(request);
  } catch (err) {
    console.error('[admin/requests PATCH]', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// DELETE /api/admin/requests/:id -- remove a single request from history.
// Purely a cleanup action, doesn't touch the client or their card in any
// way (that already happened when the request was approved, if it was).
router.delete('/requests/:id', requireAdmin, async (req, res) => {
  const request = await CardRequest.findByIdAndDelete(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  res.json({ ok: true });
});

// DELETE /api/admin/requests -- bulk clear everything EXCEPT pending
// requests, so nothing still awaiting a decision gets wiped by mistake.
router.delete('/requests', requireAdmin, async (req, res) => {
  const result = await CardRequest.deleteMany({ status: { $ne: 'pending' } });
  res.json({ ok: true, deletedCount: result.deletedCount });
});

// -----------------------------------------------------------------------
// Contact messages -- submissions from the public Contact Us page.
// -----------------------------------------------------------------------

// GET /api/admin/contact-messages
router.get('/contact-messages', requireAdmin, async (req, res) => {
  const messages = await ContactMessage.find({}).sort({ createdAt: -1 });
  res.json(messages);
});

// PATCH /api/admin/contact-messages/:id -- mark read/unread
router.patch('/contact-messages/:id', requireAdmin, async (req, res) => {
  const { read } = req.body;
  const message = await ContactMessage.findByIdAndUpdate(req.params.id, { $set: { read: !!read } }, { new: true });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  res.json(message);
});

// DELETE /api/admin/contact-messages/:id
router.delete('/contact-messages/:id', requireAdmin, async (req, res) => {
  const message = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
});

// -----------------------------------------------------------------------
// Card tickets -- "Raise a ticket" submissions from the public tap page,
// shown there when a specific card is temporarily deactivated (see
// routes/public.js's POST /card-tickets/:clientId and PublicProfile.jsx).
// Distinct from contact messages above: these carry which client/card
// they're about, so they're joined with the client's name here the same
// way GET /requests already resolves clientName for CardRequest.
// -----------------------------------------------------------------------

// GET /api/admin/card-tickets
router.get('/card-tickets', requireAdmin, async (req, res) => {
  const tickets = await CardTicket.find({}).sort({ createdAt: -1 });
  const clientIds = [...new Set(tickets.map((t) => t.clientId))];
  const clients = await Client.find({ clientId: { $in: clientIds } }).select('clientId fullName');
  const nameMap = Object.fromEntries(clients.map((c) => [c.clientId, c.fullName]));
  res.json(tickets.map((t) => ({ ...t.toObject(), clientName: nameMap[t.clientId] || '(deleted client)' })));
});

// PATCH /api/admin/card-tickets/:id -- mark open/resolved
router.patch('/card-tickets/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['open', 'resolved'].includes(status)) return res.status(400).json({ error: 'status must be open or resolved' });
  const ticket = await CardTicket.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

// DELETE /api/admin/card-tickets/:id
router.delete('/card-tickets/:id', requireAdmin, async (req, res) => {
  const ticket = await CardTicket.findByIdAndDelete(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ ok: true });
});

// GET /api/admin/ar-layout -- the DEFAULT AR layout template, used as the
// starting point for any client who hasn't customized their own (clients
// now set their own arrangement from their dashboard). Creates the
// default document on first access if none exists yet.
router.get('/ar-layout', requireAdmin, async (req, res) => {
  try {
    let layout = await ArLayout.findOne({ key: 'global' });
    if (!layout) layout = await ArLayout.create({ key: 'global' });
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/ar-layout -- save new positions from the drag-and-drop
// editor. Each field is optional so the editor can send only what
// actually moved.
router.put('/ar-layout', requireAdmin, async (req, res) => {
  try {
    const {
      qr,
      video,
      contact,
      portfolio,
      social,
      huntsworld,
      model,
      modelRotationX,
      modelRotationY,
      modelRotationZ,
      modelScale,
      videoRotationX,
      videoRotationY,
      videoRotationZ,
      videoScaleX,
      videoScaleY,
      customElements,
    } = req.body || {};
    const updates = { updatedBy: req.admin?.email || 'unknown' };
    if (qr) updates.qr = qr;
    if (video) updates.video = video;
    if (contact) updates.contact = contact;
    if (portfolio) updates.portfolio = portfolio;
    if (social) updates.social = social;
    if (huntsworld) updates.huntsworld = huntsworld;
    if (model) updates.model = model;
    if (modelRotationX !== undefined) updates.modelRotationX = modelRotationX;
    if (modelRotationY !== undefined) updates.modelRotationY = modelRotationY;
    if (modelRotationZ !== undefined) updates.modelRotationZ = modelRotationZ;
    if (modelScale !== undefined) updates.modelScale = modelScale;
    if (videoRotationX !== undefined) updates.videoRotationX = videoRotationX;
    if (videoRotationY !== undefined) updates.videoRotationY = videoRotationY;
    if (videoRotationZ !== undefined) updates.videoRotationZ = videoRotationZ;
    if (videoScaleX !== undefined) updates.videoScaleX = videoScaleX;
    if (videoScaleY !== undefined) updates.videoScaleY = videoScaleY;
    // Positions for AR-flagged attributes (see AttributeDefinition.arComponent)
    // -- a whole-map replace, same as every other field here being
    // "whatever the editor actually sent," not a per-key merge.
    if (customElements && typeof customElements === 'object') updates.customElements = customElements;

    const layout = await ArLayout.findOneAndUpdate(
      { key: 'global' },
      { $set: updates },
      { new: true, upsert: true }
    );
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/ar-icons -- current logo per attribute, if any.
router.get('/ar-icons', requireAdmin, async (req, res) => {
  try {
    let icons = await ArIcon.findOne({ key: 'global' });
    if (!icons) icons = await ArIcon.create({ key: 'global' });
    res.json(mergeArIcons(icons));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/ar-icons/:key -- upload/replace the logo for one
// attribute. Removes the previous file for that key first, if any, so
// re-uploads don't pile up orphaned images on disk.
router.post('/ar-icons/:key', requireAdmin, uploadArIcon.single('icon'), async (req, res) => {
  try {
    const { key } = req.params;
    const validKeys = await getValidArIconKeys();
    if (!validKeys.has(key)) {
      return res.status(400).json({ error: `Unknown attribute "${key}"` });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const icons = (await ArIcon.findOne({ key: 'global' })) || new ArIcon({ key: 'global' });
    const previousUrl = icons.sectionIcons.get(key) || icons[key];
    icons.sectionIcons.set(key, `${process.env.BACKEND_URL}/uploads/ar-icons/${req.file.filename}`);
    icons.updatedBy = req.admin?.email || 'unknown';
    await icons.save();

    if (previousUrl) {
      const previousPath = path.join(AR_ICONS_DIR, path.basename(previousUrl));
      fs.unlink(previousPath, () => {}); // best-effort -- a leftover orphaned file isn't worth failing the request over
    }

    res.json(mergeArIcons(icons));
  } catch (err) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 2MB.' : err.message;
    res.status(400).json({ error: message });
  }
});

// DELETE /api/admin/ar-icons/:key -- revert that attribute back to its
// plain colored text pill.
router.delete('/ar-icons/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const validKeys = await getValidArIconKeys();
    if (!validKeys.has(key)) {
      return res.status(400).json({ error: `Unknown attribute "${key}"` });
    }
    const icons = await ArIcon.findOne({ key: 'global' });
    const previousUrl = icons?.sectionIcons?.get(key) || icons?.[key];
    if (previousUrl) {
      const previousPath = path.join(AR_ICONS_DIR, path.basename(previousUrl));
      fs.unlink(previousPath, () => {});
      icons.sectionIcons.delete(key);
      // Also clear the legacy named field, if this key is one of the
      // original five and still had a value stored there.
      if (['video', 'contact', 'portfolio', 'social', 'huntsworld'].includes(key)) icons[key] = undefined;
      icons.updatedBy = req.admin?.email || 'unknown';
      await icons.save();
    }
    res.json(mergeArIcons(icons));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Magic Art -- a collection of admin-managed "packs" (target image +
// overlay video each), see MagicArt.js. Consumed publicly via
// GET /api/public/magic-art (array, complete packs only) and scanned
// client-side via mind-ar-js on the client dashboard's Magic Camera page.
// "Art 1"/"Art 2"/etc. in the admin UI are just list position, not
// stored -- ordering is createdAt ascending.
// ---------------------------------------------------------------------
const MAGIC_ART_DIR = path.join(__dirname, '..', 'uploads', 'magic-art');
fs.mkdirSync(MAGIC_ART_DIR, { recursive: true });
const magicArtStorage = multer.diskStorage({
  destination: MAGIC_ART_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const magicArtImageUpload = multer({
  storage: magicArtStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB -- admin's crop tool already resizes before upload, but a real photo can still be large
  fileFilter: (req, file, cb) => {
    if (!THEME_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});
// Same video mimetypes/limit as profile.js's arBannerUpload -- always a
// video here (unlike arBannerUpload's video-OR-image slot), so the filter
// only accepts video mimetypes, no image fallback.
const MAGIC_ART_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'];
const magicArtVideoUpload = multer({
  storage: magicArtStorage,
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
  fileFilter: (req, file, cb) => {
    if (!MAGIC_ART_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only MP4 or MOV videos are allowed'));
    }
    cb(null, true);
  },
});

function serializeMagicArt(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    description: doc.description,
    imageUrl: doc.imageUrl,
    imageWidth: doc.imageWidth,
    imageHeight: doc.imageHeight,
    videoUrl: doc.videoUrl,
    videoCropX: doc.videoCropX,
    videoCropY: doc.videoCropY,
    videoCropWidth: doc.videoCropWidth,
    videoCropHeight: doc.videoCropHeight,
    active: doc.active,
    updatedBy: doc.updatedBy,
  };
}

// GET /api/admin/magic-art -- every pack, oldest first ("Art 1" = index 0).
router.get('/magic-art', requireAdmin, async (req, res) => {
  try {
    const docs = await MagicArt.find({}).sort({ createdAt: 1 });
    res.json(docs.map(serializeMagicArt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/magic-art -- create one new empty pack ("+ Add Art").
router.post('/magic-art', requireAdmin, async (req, res) => {
  try {
    const doc = await MagicArt.create({ updatedBy: req.admin?.email || 'unknown' });
    res.status(201).json(serializeMagicArt(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/magic-art/:id -- update a pack's name/description.
router.patch('/magic-art/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (req.body.name !== undefined) doc.name = req.body.name;
    if (req.body.description !== undefined) doc.description = req.body.description;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    res.json(serializeMagicArt(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/magic-art/:id/activate -- add this pack to the set the
// client dashboard's Magic Camera scans. NOT exclusive -- several packs
// can be active at once; Magic Camera auto-detects which one it's
// pointed at (mind-ar tracks against every registered target by
// default, see MagicCamera.jsx's own comment for the confirmation).
router.post('/magic-art/:id/activate', requireAdmin, async (req, res) => {
  try {
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!doc.name?.trim() || !doc.imageUrl || !doc.videoUrl) {
      return res.status(400).json({ error: 'This pack needs a name, an image, and a video before it can be activated.' });
    }
    doc.active = true;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    const docs = await MagicArt.find({}).sort({ createdAt: 1 });
    res.json(docs.map(serializeMagicArt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/magic-art/:id/deactivate -- remove this pack from the
// active set (it stops being scanned, but the pack itself and its files
// are untouched).
router.post('/magic-art/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    doc.active = false;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    const docs = await MagicArt.find({}).sort({ createdAt: 1 });
    res.json(docs.map(serializeMagicArt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/magic-art/:id -- remove a whole pack (both files + the doc).
router.delete('/magic-art/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.imageUrl) fs.unlink(path.join(MAGIC_ART_DIR, path.basename(doc.imageUrl)), () => {});
    if (doc.videoUrl) fs.unlink(path.join(MAGIC_ART_DIR, path.basename(doc.videoUrl)), () => {});
    await doc.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/magic-art/:id/image -- upload/replace one pack's target
// image. `width`/`height` are the dimensions the admin's crop tool already
// resized to client-side. Removes the previous file first, if any, so
// re-uploads don't pile up orphaned files on disk.
router.post('/magic-art/:id/image', requireAdmin, magicArtImageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const previousUrl = doc.imageUrl;
    doc.imageUrl = `${process.env.BACKEND_URL}/uploads/magic-art/${req.file.filename}`;
    doc.imageWidth = Number(req.body.width) || undefined;
    doc.imageHeight = Number(req.body.height) || undefined;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    if (previousUrl) {
      fs.unlink(path.join(MAGIC_ART_DIR, path.basename(previousUrl)), () => {});
    }
    res.json(serializeMagicArt(doc));
  } catch (err) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 50MB.' : err.message;
    res.status(400).json({ error: message });
  }
});

// POST /api/admin/magic-art/:id/video -- upload/replace one pack's overlay
// video. cropX/cropY/cropWidth/cropHeight (fractional 0-1) describe a
// display-only crop -- the file itself is stored exactly as uploaded.
router.post('/magic-art/:id/video', requireAdmin, magicArtVideoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const previousUrl = doc.videoUrl;
    doc.videoUrl = `${process.env.BACKEND_URL}/uploads/magic-art/${req.file.filename}`;
    doc.videoCropX = Number(req.body.cropX) || 0;
    doc.videoCropY = Number(req.body.cropY) || 0;
    doc.videoCropWidth = Number(req.body.cropWidth) || 1;
    doc.videoCropHeight = Number(req.body.cropHeight) || 1;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    if (previousUrl) {
      fs.unlink(path.join(MAGIC_ART_DIR, path.basename(previousUrl)), () => {});
    }
    res.json(serializeMagicArt(doc));
  } catch (err) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 80MB.' : err.message;
    res.status(400).json({ error: message });
  }
});

// DELETE /api/admin/magic-art/:id/:field -- clear just the image or video
// of one pack (the pack itself, and its other field, stay put).
router.delete('/magic-art/:id/:field', requireAdmin, async (req, res) => {
  try {
    const { field } = req.params;
    if (field !== 'image' && field !== 'video') {
      return res.status(400).json({ error: 'Unknown field' });
    }
    const doc = await MagicArt.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (field === 'image') {
      if (doc.imageUrl) fs.unlink(path.join(MAGIC_ART_DIR, path.basename(doc.imageUrl)), () => {});
      doc.imageUrl = undefined;
      doc.imageWidth = undefined;
      doc.imageHeight = undefined;
    } else {
      if (doc.videoUrl) fs.unlink(path.join(MAGIC_ART_DIR, path.basename(doc.videoUrl)), () => {});
      doc.videoUrl = undefined;
      doc.videoCropX = undefined;
      doc.videoCropY = undefined;
      doc.videoCropWidth = undefined;
      doc.videoCropHeight = undefined;
    }
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    res.json(serializeMagicArt(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Magic Business Card -- one personal AR image+video pair PER CLIENT
// (unlike Magic Art's shared gallery above), see MagicBusinessCard.js.
// Admin-curated: only this route block ever writes it. Consumed by the
// client themselves via GET /api/profile/magic-card (client-app's
// MagicBusinessCard.jsx dashboard page, read-only there).
// ---------------------------------------------------------------------
const MAGIC_CARD_DIR = path.join(__dirname, '..', 'uploads', 'magic-cards');
fs.mkdirSync(MAGIC_CARD_DIR, { recursive: true });
const magicCardStorage = multer.diskStorage({
  destination: MAGIC_CARD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const magicCardImageUpload = multer({
  storage: magicCardStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!THEME_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});
const magicCardVideoUpload = multer({
  storage: magicCardStorage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!MAGIC_ART_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only MP4 or MOV videos are allowed'));
    }
    cb(null, true);
  },
});
function serializeMagicCard(doc) {
  return {
    _id: doc._id,
    clientId: doc.clientId,
    cardType: doc.cardType,
    imageUrl: doc.imageUrl,
    imageWidth: doc.imageWidth,
    imageHeight: doc.imageHeight,
    videoUrl: doc.videoUrl,
    videoCropX: doc.videoCropX,
    videoCropY: doc.videoCropY,
    videoCropWidth: doc.videoCropWidth,
    videoCropHeight: doc.videoCropHeight,
    active: doc.active,
    updatedBy: doc.updatedBy,
  };
}

// One doc per client, implicitly created on first touch -- there's no
// separate "+ Add" step like Magic Art has, since every client gets
// exactly one (empty until admin uploads into it). Every route below
// upserts rather than 404ing on a missing doc.
async function findOrCreateMagicCard(clientId) {
  return MagicBusinessCard.findOneAndUpdate(
    { clientId },
    { $setOnInsert: { clientId } },
    { upsert: true, new: true }
  );
}

// GET /api/admin/clients/:clientId/magic-card
router.get('/clients/:clientId/magic-card', requireAdmin, async (req, res) => {
  try {
    const doc = await findOrCreateMagicCard(req.params.clientId);
    res.json(serializeMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:clientId/magic-card/card-type -- 'vertical' or
// 'horizontal' (85x55mm either way, just rotated). Saved independently of
// the image upload so the choice persists even before an image exists --
// the admin UI gates image upload on this being set first.
router.post('/clients/:clientId/magic-card/card-type', requireAdmin, async (req, res) => {
  try {
    const { cardType } = req.body;
    if (cardType !== 'vertical' && cardType !== 'horizontal') {
      return res.status(400).json({ error: "cardType must be 'vertical' or 'horizontal'" });
    }
    const doc = await findOrCreateMagicCard(req.params.clientId);
    doc.cardType = cardType;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    res.json(serializeMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:clientId/magic-card/activate -- requires an
// image plus EITHER a video or a 3D model (no name field here, unlike
// Magic Art -- a personal card doesn't need one). Model is optional/
// additive, not a replacement for video -- see MagicBusinessCard.js.
router.post('/clients/:clientId/magic-card/activate', requireAdmin, async (req, res) => {
  try {
    const doc = await findOrCreateMagicCard(req.params.clientId);
    if (!doc.imageUrl || !doc.videoUrl) {
      return res.status(400).json({ error: 'This card needs both an image and a video before it can be activated.' });
    }
    doc.active = true;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    res.json(serializeMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:clientId/magic-card/deactivate
router.post('/clients/:clientId/magic-card/deactivate', requireAdmin, async (req, res) => {
  try {
    const doc = await findOrCreateMagicCard(req.params.clientId);
    doc.active = false;
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    res.json(serializeMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:clientId/magic-card/image
router.post(
  '/clients/:clientId/magic-card/image',
  requireAdmin,
  magicCardImageUpload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const doc = await findOrCreateMagicCard(req.params.clientId);
      const previousUrl = doc.imageUrl;
      doc.imageUrl = `${process.env.BACKEND_URL}/uploads/magic-cards/${req.file.filename}`;
      doc.imageWidth = Number(req.body.width) || undefined;
      doc.imageHeight = Number(req.body.height) || undefined;
      doc.updatedBy = req.admin?.email || 'unknown';
      await doc.save();
      if (previousUrl) {
        fs.unlink(path.join(MAGIC_CARD_DIR, path.basename(previousUrl)), () => {});
      }
      res.json(serializeMagicCard(doc));
    } catch (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 50MB.' : err.message;
      res.status(400).json({ error: message });
    }
  }
);

// POST /api/admin/clients/:clientId/magic-card/video
router.post(
  '/clients/:clientId/magic-card/video',
  requireAdmin,
  magicCardVideoUpload.single('video'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const doc = await findOrCreateMagicCard(req.params.clientId);
      const previousUrl = doc.videoUrl;
      doc.videoUrl = `${process.env.BACKEND_URL}/uploads/magic-cards/${req.file.filename}`;
      doc.videoCropX = Number(req.body.cropX) || 0;
      doc.videoCropY = Number(req.body.cropY) || 0;
      doc.videoCropWidth = Number(req.body.cropWidth) || 1;
      doc.videoCropHeight = Number(req.body.cropHeight) || 1;
      doc.updatedBy = req.admin?.email || 'unknown';
      await doc.save();
      if (previousUrl) {
        fs.unlink(path.join(MAGIC_CARD_DIR, path.basename(previousUrl)), () => {});
      }
      res.json(serializeMagicCard(doc));
    } catch (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 80MB.' : err.message;
      res.status(400).json({ error: message });
    }
  }
);

// DELETE /api/admin/clients/:clientId/magic-card/:field
router.delete('/clients/:clientId/magic-card/:field', requireAdmin, async (req, res) => {
  try {
    const { field } = req.params;
    if (field !== 'image' && field !== 'video') {
      return res.status(400).json({ error: 'Unknown field' });
    }
    const doc = await findOrCreateMagicCard(req.params.clientId);
    if (field === 'image') {
      if (doc.imageUrl) fs.unlink(path.join(MAGIC_CARD_DIR, path.basename(doc.imageUrl)), () => {});
      doc.imageUrl = undefined;
      doc.imageWidth = undefined;
      doc.imageHeight = undefined;
    } else {
      if (doc.videoUrl) fs.unlink(path.join(MAGIC_CARD_DIR, path.basename(doc.videoUrl)), () => {});
      doc.videoUrl = undefined;
      doc.videoCropX = undefined;
      doc.videoCropY = undefined;
      doc.videoCropWidth = undefined;
      doc.videoCropHeight = undefined;
    }
    doc.updatedBy = req.admin?.email || 'unknown';
    await doc.save();
    res.json(serializeMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Attributes -- admin-defined extra profile fields (e.g. "Telegram" under
// Contact). Definitions only; each client's actual value lives in their
// own Client.customAttributes map (see profile.js's PUT /me route).
// ---------------------------------------------------------------------
function slugifyAttributeKey(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const RESERVED_SECTIONS = ['contact', 'portfolio', 'social', 'huntsworld'];

// Resolves whatever the client sent for `section` into a real section slug
// plus (only when this is the first attribute to use a brand new custom
// section) a human label to remember for it. The admin UI sends either one
// of the four built-in keys as-is, an EXISTING custom section's slug
// (picked from a dropdown, already known), or free-typed text for a new
// one -- this one function handles all three without the caller needing
// to know which case it is.
async function resolveSection(rawSection) {
  const trimmed = String(rawSection || '').trim();
  if (RESERVED_SECTIONS.includes(trimmed)) return { section: trimmed, sectionLabel: undefined };

  const slug = slugifyAttributeKey(trimmed);
  if (!slug) return null;
  const existing = await AttributeDefinition.exists({ section: slug });
  // First time this slug's been used -- remember the label the admin
  // actually typed so the frontend has something nicer than the slug to
  // show as the tab name. Already-existing sections keep whatever label
  // their first attribute set; no need to touch it again here.
  return { section: slug, sectionLabel: existing ? undefined : trimmed };
}

router.get('/attributes', requireAdmin, async (req, res) => {
  try {
    const attributes = await AttributeDefinition.find().sort({ section: 1, order: 1 });
    res.json(attributes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attributes', requireAdmin, async (req, res) => {
  try {
    const { label, section, fieldType, order, arComponent, magicComponent } = req.body || {};
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'Label is required' });
    const resolved = await resolveSection(section);
    if (!resolved) return res.status(400).json({ error: 'Section is required' });

    const baseKey = slugifyAttributeKey(label);
    if (!baseKey) return res.status(400).json({ error: 'Label must contain at least one letter or number' });
    // Slug collisions (e.g. two labels that both reduce to "phone_2") get a
    // numeric suffix rather than rejecting the create outright.
    let key = baseKey;
    let suffix = 2;
    while (await AttributeDefinition.exists({ key })) {
      key = `${baseKey}_${suffix++}`;
    }

    const attribute = await AttributeDefinition.create({
      key,
      label: String(label).trim(),
      section: resolved.section,
      sectionLabel: resolved.sectionLabel,
      fieldType: ['text', 'phone', 'url', 'email'].includes(fieldType) ? fieldType : 'text',
      order: Number.isFinite(order) ? order : 0,
      arComponent: Boolean(arComponent),
      magicComponent: Boolean(magicComponent),
    });
    res.status(201).json(attribute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/attributes/:id', requireAdmin, async (req, res) => {
  try {
    const { label, section, fieldType, order, active, arComponent, magicComponent } = req.body || {};
    const updates = {};
    if (label !== undefined) updates.label = String(label).trim();
    if (section !== undefined) {
      const resolved = await resolveSection(section);
      if (!resolved) return res.status(400).json({ error: 'Section is required' });
      updates.section = resolved.section;
      if (resolved.sectionLabel !== undefined) updates.sectionLabel = resolved.sectionLabel;
    }
    if (fieldType !== undefined) {
      if (!['text', 'phone', 'url', 'email'].includes(fieldType)) {
        return res.status(400).json({ error: 'Invalid field type' });
      }
      updates.fieldType = fieldType;
    }
    if (order !== undefined) updates.order = order;
    if (active !== undefined) updates.active = Boolean(active);
    if (arComponent !== undefined) updates.arComponent = Boolean(arComponent);
    if (magicComponent !== undefined) updates.magicComponent = Boolean(magicComponent);

    const attribute = await AttributeDefinition.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });
    res.json(attribute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/attributes/:id', requireAdmin, async (req, res) => {
  try {
    const attribute = await AttributeDefinition.findByIdAndDelete(req.params.id);
    if (!attribute) return res.status(404).json({ error: 'Attribute not found' });
    // Clients' saved values for this key are left in place (harmless,
    // unused Map entries) -- not worth a bulk update across every client
    // just to scrub a key nothing reads anymore.
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------------------------------------------------------------
// Catalog -- admin picks a card type and uploads the showcase video
// clients see on the public Catalog page.
// ---------------------------------------------------------------------

// GET /api/admin/catalog -- every card type, each with its current video
// (null if none uploaded yet), so the page can list all types in one go.
router.get('/catalog', requireAdmin, async (req, res) => {
  try {
    const plans = await CardPlan.find().sort({ createdAt: 1 });
    const videos = await CatalogVideo.find();
    const videoByType = {};
    videos.forEach((v) => { videoByType[v.cardType] = v; });

    const result = plans.map((p) => ({
      cardType: p.key,
      name: p.name,
      active: p.active,
      video: videoByType[p.key] || null,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/catalog/:cardType -- multipart/form-data, field name
// "video". Upserts -- re-uploading for the same card type replaces it.
router.post('/catalog/:cardType', requireAdmin, (req, res) => {
  uploadCatalogVideo.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No video file received' });
    try {
      const cardType = req.params.cardType.toLowerCase();
      const plan = await CardPlan.findOne({ key: cardType });
      if (!plan) return res.status(404).json({ error: 'No card type matches that key' });

      const videoUrl = `${process.env.BACKEND_URL}/uploads/catalog/${req.file.filename}`;
      const video = await CatalogVideo.findOneAndUpdate(
        { cardType },
        { $set: { videoUrl, uploadedBy: req.admin?.email || 'unknown' } },
        { new: true, upsert: true }
      );
      res.json(video);
    } catch (err2) {
      console.error('[admin/catalog POST]', err2);
      res.status(500).json({ error: 'Could not save the video' });
    }
  });
});

// DELETE /api/admin/catalog/:cardType -- removes the video; the card
// type just drops off the public Catalog page until a new one is added.
router.delete('/catalog/:cardType', requireAdmin, async (req, res) => {
  try {
    await CatalogVideo.deleteOne({ cardType: req.params.cardType.toLowerCase() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Encode-tool support routes -- these exist so the NFC encode tool
// (encode-tool/) never needs its own direct MongoDB connection string.
// Previously it connected straight to the database with a raw URI in
// its .env file; once that tool is packaged and installed on multiple
// employees' machines, a baked-in database credential would mean anyone
// who ever extracted it could read/write the whole clients collection,
// completely bypassing login. These three routes give the encode tool
// everything it needs through the same authenticated admin session
// every other admin action already uses.
// ---------------------------------------------------------------------

// GET /api/admin/encode/client/:clientId -- full profile lookup, used by
// the encode tool's "Write" panel to find and display any client (no
// paid/chipEncoded filter -- the point there is fixing up a specific
// person's details, not listing who's ready for a card). Also returns
// this client's existing Card records, so the tool can show "N cards
// already encoded -- write another?" instead of assuming at most one.
router.get('/encode/client/:clientId', requireEncodeAccess, async (req, res) => {
  try {
    const rawId = (req.params.clientId || '').trim();
    if (!rawId) return res.status(400).json({ error: 'Client ID required' });

    let client = await Client.findOne({ clientId: rawId }).select(
      'clientId fullName phone loginEmail cardType paid chipEncoded jobTitle bio whatsapp publicEmail instagramUrl twitterUrl portfolioUrl huntsworldUrl'
    );

    if (!client) {
      const escaped = rawId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      client = await Client.findOne({ clientId: { $regex: new RegExp(`^${escaped}$`, 'i') } }).select(
        'clientId fullName phone loginEmail cardType paid chipEncoded jobTitle bio whatsapp publicEmail instagramUrl twitterUrl portfolioUrl huntsworldUrl'
      );
    }

    if (!client) return res.status(404).json({ error: `No client found with ID "${req.params.clientId}"` });

    const cards = await Card.find({ clientId: client.clientId }).select('-passwordEncrypted').sort({ cardNumber: 1 });
    const clientObj = client.toObject();
    clientObj.cards = cards;

    // The variant choices for this client's current plan, if it has any --
    // lets the "Create a card" flow offer a style picker when reserving a
    // new card slot, the same way a real purchase's checkout does.
    if (client.cardType) {
      const plan = await CardPlan.findOne({ key: client.cardType }).select('variants');
      clientObj.planVariants = plan ? plan.variants.map((v) => ({ _id: v._id, name: v.name, shape: v.shape })) : [];
    } else {
      clientObj.planVariants = [];
    }

    res.json(clientObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/encode/pending -- paid clients who don't have a card
// encoded yet, for the "Create a card" list. Kept as chipEncoded-based
// (legacy single-card flag) since it's specifically "never had a first
// card" -- a client with existing Card records but wanting an extra one
// goes through the picker + "Encode a new card" action instead, not this
// list.
router.get('/encode/pending', requireEncodeAccess, async (req, res) => {
  try {
    const pending = await Client.find({ paid: true, chipEncoded: false }).select(
      'clientId fullName cardType phone loginEmail'
    );
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Per-card records (see models/Card.js) -- one profile can have several
// physical cards now, each independently tracked/encoded/deactivated.
// ---------------------------------------------------------------------

// GET /api/admin/clients/:clientId/cards -- list, NEVER includes the
// password (see the dedicated reveal route below for that).
router.get('/clients/:clientId/cards', requireAdmin, async (req, res) => {
  try {
    const cards = await Card.find({ clientId: req.params.clientId }).select('-passwordEncrypted').sort({ cardNumber: 1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:clientId/cards -- claims a card slot to write to
// BEFORE the physical write happens, so the encode tool knows what ?card=N
// to put in the chip's own URL. cardNumber is sequential per client, not a
// global ID.
//
// A paid purchase now pre-creates unencoded Card placeholders (see
// routes/profile.js's createCardsForPurchase) so a repeat/multi-quantity
// order has somewhere to be tracked before anyone touches the encode tool.
// This route has to know about that: it reuses the client's oldest
// not-yet-encoded card instead of always minting a new slot on top, or
// arming the encode tool for a client with an unencoded placeholder would
// create a second, genuinely orphaned slot -- the placeholder would sit
// forever as a phantom "needs attention" row nothing physical will ever
// satisfy.
router.post('/clients/:clientId/cards', requireEncodeAccess, async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId cardType');
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { cardType, cardVariantId, label } = req.body || {};

    const existing = await Card.findOne({ clientId: client.clientId, encoded: false }).sort({ cardNumber: 1 });
    if (existing) {
      // Reusing a placeholder (e.g. auto-created by a purchase) shouldn't
      // silently drop a label/variant the caller just specified for it --
      // apply whatever was actually provided this time, leave the rest as
      // it was.
      if (label !== undefined) existing.label = label || null;
      if (cardVariantId !== undefined) existing.cardVariantId = cardVariantId || null;
      if (cardType) existing.cardType = cardType;
      await existing.save();
      return res.status(200).json({ cardId: existing._id, cardNumber: existing.cardNumber });
    }

    const last = await Card.findOne({ clientId: client.clientId }).sort({ cardNumber: -1 }).select('cardNumber');
    const cardNumber = (last?.cardNumber || 0) + 1;
    const card = await Card.create({
      clientId: client.clientId,
      cardNumber,
      cardType: cardType || client.cardType || null,
      cardVariantId: cardVariantId || null,
      label: label || null,
    });
    res.status(201).json({ cardId: card._id, cardNumber: card.cardNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/cards/:cardId/password -- a separate, explicit-action
// route rather than part of the list response above, so the decrypted
// password isn't casually exposed every time the card list loads.
router.get('/cards/:cardId/password', requireAdmin, async (req, res) => {
  try {
    const card = await Card.findById(req.params.cardId).select('passwordEncrypted');
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (!card.passwordEncrypted) {
      // Either never encoded yet, or migrated from the old single-card
      // model where only a one-way hash existed -- the original raw
      // password genuinely can't be recovered in that case.
      return res.json({ password: null });
    }
    res.json({ password: cardCrypto.decrypt(card.passwordEncrypted) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/cards/:cardId -- active/cardType/cardVariantId/label,
// plus a direct `delivered` toggle for cards handed to the client in
// person (gifted/manually created ones especially) rather than shipped --
// that path has no tracking ID or dispatch step to go through, so this
// skips straight past the postal claim/assign/dispatch pipeline
// (/fulfillment/cards/:cardId/*, further up) instead of forcing it through
// stages that don't apply. Password/encoded status change exclusively via
// mark-encoded below.
router.patch('/cards/:cardId', requireAdmin, async (req, res) => {
  try {
    const updates = {};
    for (const field of ['active', 'cardType', 'cardVariantId', 'label']) {
      if (field in req.body) updates[field] = req.body[field];
    }
    if ('delivered' in req.body) {
      updates.delivered = Boolean(req.body.delivered);
      updates.deliveredAt = updates.delivered ? new Date() : null;
    }
    const card = await Card.findByIdAndUpdate(req.params.cardId, { $set: updates }, { new: true, runValidators: true }).select(
      '-passwordEncrypted'
    );
    if (!card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/cards/:cardId
router.delete('/cards/:cardId', requireAdmin, async (req, res) => {
  try {
    const result = await Card.deleteOne({ _id: req.params.cardId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Card not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/cards/:cardId/mark-encoded -- called right after a real
// hardware write+lock succeeds. Takes the RAW chip password (not a hash
// -- see the Context note in the plan: encode-tool already has this value
// in memory right after lockCard() succeeds, it's just discarded after
// hashing today) and encrypts it at rest via utils/crypto.js, so it can
// later be shown back to an admin. encodedBy comes from the admin's own
// verified token, never the request body, so this can't be spoofed as
// someone else.
router.post('/cards/:cardId/mark-encoded', requireEncodeAccess, async (req, res) => {
  try {
    const { chipPassword } = req.body || {};
    if (!chipPassword) return res.status(400).json({ error: 'chipPassword required' });
    const card = await Card.findByIdAndUpdate(
      req.params.cardId,
      {
        $set: {
          encoded: true,
          passwordEncrypted: cardCrypto.encrypt(chipPassword),
          encodedAt: new Date(),
          encodedBy: req.admin.email,
        },
      },
      { new: true }
    ).select('-passwordEncrypted');
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Keep the legacy single-card fields on Client in sync for card #1
    // specifically -- everything that still reads Client.chipEncoded
    // directly (e.g. the /encode/pending list above, dispatch gating
    // elsewhere in this file) keeps working for a client's first card
    // without needing to be migrated in this same pass.
    if (card.cardNumber === 1) {
      await Client.updateOne(
        { clientId: card.clientId },
        { $set: { chipEncoded: true, encodedAt: card.encodedAt, encodedBy: card.encodedBy } }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// Encode-tool installer upload -- Admin Prime only. Replaces the manual
// `npm run dist` + copy-the-file-by-hand step: always overwrites the same
// fixed filename (same path client-app/admin's "Download Encode Tool"
// link already serves via the static /uploads route), so that link never
// needs to change as the tool gets updated.
// ---------------------------------------------------------------------
const ENCODE_TOOL_DIR = path.join(__dirname, '..', 'uploads', 'encode-tool');
fs.mkdirSync(ENCODE_TOOL_DIR, { recursive: true });
const encodeToolStorage = multer.diskStorage({
  destination: ENCODE_TOOL_DIR,
  filename: (req, file, cb) => cb(null, 'HuntsTAG-Encode-Tool-Setup.exe'),
});
const uploadEncodeTool = multer({
  storage: encodeToolStorage,
  limits: { fileSize: 300 * 1024 * 1024 }, // generous -- Electron installers commonly run 80-150MB+
  fileFilter: (req, file, cb) => {
    // Browsers report wildly inconsistent mimetypes for .exe depending on
    // OS/browser -- the file extension is the reliable signal here, not
    // content-type sniffing, same trade-off any installer-hosting service
    // has to make.
    if (path.extname(file.originalname).toLowerCase() !== '.exe') {
      return cb(new Error('Only a .exe installer is allowed'));
    }
    cb(null, true);
  },
});

// POST /api/admin/encode-tool/upload
router.post('/encode-tool/upload', requireAdminPrime, uploadEncodeTool.single('installer'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ ok: true, size: req.file.size });
});

// ---------------------------------------------------------------------
// Blank-card inventory (see models/CardInventory.js) -- physical stock on
// hand before it's ever assigned to a client, distinct from the per-
// client Card model above. Admin Prime only.
// ---------------------------------------------------------------------

// GET /api/admin/inventory
router.get('/inventory', requireAdminPrime, async (req, res) => {
  const items = await CardInventory.find({}).sort({ color: 1 });
  res.json(items);
});

// POST /api/admin/inventory -- add a new color bucket.
router.post('/inventory', requireAdminPrime, async (req, res) => {
  try {
    const { color, quantity } = req.body || {};
    const trimmedColor = (color || '').toString().trim().toLowerCase();
    if (!trimmedColor) return res.status(400).json({ error: 'color is required' });

    const existing = await CardInventory.findOne({ color: trimmedColor });
    if (existing) return res.status(409).json({ error: 'This color already has an inventory entry -- edit it instead.' });

    const item = await CardInventory.create({ color: trimmedColor, quantity: Number(quantity) || 0 });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/inventory/:id -- set a new quantity.
router.patch('/inventory/:id', requireAdminPrime, async (req, res) => {
  try {
    const { quantity } = req.body || {};
    if (quantity === undefined || Number(quantity) < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative number' });
    }
    const item = await CardInventory.findByIdAndUpdate(req.params.id, { $set: { quantity: Number(quantity) } }, { new: true });
    if (!item) return res.status(404).json({ error: 'Inventory entry not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/inventory/:id
router.delete('/inventory/:id', requireAdminPrime, async (req, res) => {
  try {
    const result = await CardInventory.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Inventory entry not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
