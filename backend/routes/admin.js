const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { requireAdmin, requireSeniorAdmin } = require('../middleware/auth');
const Client = require('../models/Client');
const Admin = require('../models/Admin');
const CardPlan = require('../models/CardPlan');
const ArLayout = require('../models/ArLayout');
const ArIcon = require('../models/ArIcon');
const AttributeDefinition = require('../models/AttributeDefinition');
const CardRequest = require('../models/CardRequest');
const ContactMessage = require('../models/ContactMessage');
const CatalogVideo = require('../models/CatalogVideo');

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
// Not a fixed list anymore -- the four built-ins are always valid, and any
// section an admin has created via the Attributes page becomes valid too
// the moment an attribute exists in it (same discovery the Attributes page
// itself uses).
async function getValidArIconKeys() {
  const customSections = await AttributeDefinition.distinct('section');
  return new Set(['video', 'contact', 'portfolio', 'social', 'huntsworld', ...customSections]);
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
// Dashboard stats
// -----------------------------------------------------------------------

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  const [totalClients, paid, encoded, adminCount, planCount, latestClient, monthlyAgg, pendingRequests, cardsByPlanAgg, recentClients, unclaimedOrders, unreadMessages] = await Promise.all([
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
  ]);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const clientsByMonth = monthlyAgg.map((m) => ({
    label: MONTH_NAMES[m._id.month - 1],
    count: m.count,
  }));

  // Attach plan display names to the raw key-based aggregation.
  const allPlans = await CardPlan.find({}).select('key name');
  const planNameByKey = Object.fromEntries(allPlans.map((p) => [p.key, p.name]));
  const cardsByPlan = cardsByPlanAgg.map((c) => ({
    key: c._id,
    name: planNameByKey[c._id] || c._id,
    count: c.count,
  }));

  res.json({
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
  });
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

// POST /api/admin/plans
router.post('/plans', requireAdmin, (req, res) => {
  uploadPlanImages.array('images', 6)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { name, price, priceAmount, description, arEnabled, zingEnabled } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      let key = slugify(name);
      // Handle a name that collapses to an existing key (e.g. "Elite" and
      // "elite!!" both slugify to "elite") by appending a short suffix.
      const existing = await CardPlan.findOne({ key });
      if (existing) key = `${key}-${crypto.randomBytes(2).toString('hex')}`;

      const images = (req.files || []).map((f) => `${process.env.PUBLIC_BASE_URL}/uploads/plans/${f.filename}`);

      const plan = await CardPlan.create({
        name,
        key,
        price,
        priceAmount: priceAmount !== undefined && priceAmount !== '' ? Number(priceAmount) : null,
        description,
        images,
        arEnabled: arEnabled === 'true' || arEnabled === true,
        zingEnabled: zingEnabled === 'true' || zingEnabled === true,
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
router.patch('/plans/:id', requireAdmin, async (req, res) => {
  try {
    const { name, price, priceAmount, description, active, arEnabled, zingEnabled } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = price;
    if (priceAmount !== undefined) updates.priceAmount = priceAmount === '' ? null : Number(priceAmount);
    if (description !== undefined) updates.description = description;
    if (active !== undefined) updates.active = active;
    if (arEnabled !== undefined) updates.arEnabled = arEnabled === 'true' || arEnabled === true;
    if (zingEnabled !== undefined) updates.zingEnabled = zingEnabled === 'true' || zingEnabled === true;

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

      const newUrls = req.files.map((f) => `${process.env.PUBLIC_BASE_URL}/uploads/plans/${f.filename}`);
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
    const { fullName, loginEmail, cardType, phone } = req.body;
    if (!fullName || !loginEmail) {
      return res.status(400).json({ error: 'fullName and loginEmail are required' });
    }

    if (cardType) {
      const plan = await CardPlan.findOne({ key: cardType.toLowerCase(), active: true });
      if (!plan) return res.status(400).json({ error: 'cardType must match an active card plan' });
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
    .select('clientId fullName loginEmail phone cardType paid blocked chipEncoded encodedAt encodedBy createdAt')
    .sort({ createdAt: -1 });
  res.json(clients);
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
      fullName, loginEmail, phone, cardType, blocked,
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
      }
      updates.cardType = cardType ? cardType.toLowerCase() : null;
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

// -----------------------------------------------------------------------
// Fulfillment pipeline (new card purchases only -- upgrades never need
// physical re-encoding, so they never appear here). Stages, derived from
// existing + new fields rather than a separate status to keep in sync:
//   Paid -> claimedBy set -> assignedTo set -> chipEncoded true (the
//   encode tool sets this directly -- "Created" IS this flag, not a
//   parallel one) -> dispatched true.
// Claim/assign/dispatch are requireSeniorAdmin -- subadmins can be
// assigned work and the encode tool still works for them exactly as
// before, they just can't claim or hand off orders themselves.
// -----------------------------------------------------------------------

// GET /api/admin/fulfillment
// Every paid client, for the fulfillment pipeline view. Includes already-
// dispatched ones too (filter client-side) so the page can show history.
router.get('/fulfillment', requireAdmin, async (req, res) => {
  const clients = await Client.find({ paid: true })
    .select('clientId fullName cardType claimedBy assignedTo chipEncoded encodedAt encodedBy dispatched dispatchedAt dispatchedBy trackingId delivered deliveredAt createdAt')
    .sort({ createdAt: -1 });
  res.json(clients);
});

// PATCH /api/admin/fulfillment/:clientId/claim
router.patch('/fulfillment/:clientId/claim', requireSeniorAdmin, async (req, res) => {
  const client = await Client.findOne({ clientId: req.params.clientId });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (client.claimedBy) return res.status(409).json({ error: `Already claimed by ${client.claimedBy}` });

  client.claimedBy = req.admin.email;
  await client.save();
  res.json(client);
});

// PATCH /api/admin/fulfillment/:clientId/assign
// body: { subadminEmail }
router.patch('/fulfillment/:clientId/assign', requireSeniorAdmin, async (req, res) => {
  try {
    const { subadminEmail } = req.body;
    if (!subadminEmail) return res.status(400).json({ error: 'subadminEmail is required' });

    const subadmin = await Admin.findOne({ email: subadminEmail.toLowerCase() });
    if (!subadmin) return res.status(400).json({ error: 'No admin account with that email' });

    const client = await Client.findOne({ clientId: req.params.clientId });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.claimedBy) {
      return res.status(400).json({ error: 'Claim this order before assigning it.' });
    }

    client.assignedTo = subadmin.email;
    await client.save();
    res.json(client);
  } catch (err) {
    console.error('[admin/fulfillment assign]', err);
    res.status(500).json({ error: 'Failed to assign' });
  }
});

// PATCH /api/admin/fulfillment/:clientId/dispatch
// Blocked until the card is actually encoded -- can't ship what doesn't
// physically exist yet. Now requires a tracking ID, since that's what
// the client-facing Track page shows them once it's shipped.
router.patch('/fulfillment/:clientId/dispatch', requireSeniorAdmin, async (req, res) => {
  const { trackingId } = req.body;
  if (!trackingId) return res.status(400).json({ error: 'trackingId is required to mark as dispatched' });

  const client = await Client.findOne({ clientId: req.params.clientId });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!client.chipEncoded) {
    return res.status(400).json({ error: 'Card must be encoded before it can be dispatched.' });
  }

  client.dispatched = true;
  client.dispatchedAt = new Date();
  client.dispatchedBy = req.admin.email;
  client.trackingId = trackingId;
  await client.save();
  res.json(client);
});

// PATCH /api/admin/fulfillment/:clientId/deliver
// Final stage -- confirms the card actually reached the client.
router.patch('/fulfillment/:clientId/deliver', requireSeniorAdmin, async (req, res) => {
  const client = await Client.findOne({ clientId: req.params.clientId });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!client.dispatched) {
    return res.status(400).json({ error: 'Card must be dispatched before it can be marked delivered.' });
  }

  client.delivered = true;
  client.deliveredAt = new Date();
  await client.save();
  res.json(client);
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
// Invites a new admin/support account. Role determines fulfillment
// pipeline permissions (see requireSeniorAdmin) -- everything else stays
// full-parity for both roles, per the original decision. Returns the
// temp password once, same handoff pattern as client creation.
router.post('/team', requireAdmin, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }
    if (role && !['admin', 'subadmin'].includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'subadmin'" });
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

// DELETE /api/admin/team/:id
// Two guardrails: an admin can't delete their own account (avoids
// accidentally locking themselves out mid-session), and the last
// remaining admin account can't be deleted at all (avoids locking
// EVERYONE out with no way back in short of touching the database
// directly).
router.delete('/team/:id', requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.admin.adminId) {
      return res.status(400).json({ error: "You can't delete your own account while logged in as it." });
    }

    const totalAdmins = await Admin.countDocuments({});
    if (totalAdmins <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining admin account.' });
    }

    const deleted = await Admin.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Admin not found' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/team DELETE]', err);
    res.status(500).json({ error: 'Failed to delete team account' });
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

  res.json(
    requests.map((r) => ({
      ...r.toObject(),
      clientName: clientMap[r.clientId] || '(deleted client)',
    }))
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
      videoScale,
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
    if (videoScale !== undefined) updates.videoScale = videoScale;

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
    icons.sectionIcons.set(key, `${process.env.PUBLIC_BASE_URL}/uploads/ar-icons/${req.file.filename}`);
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
    const { label, section, fieldType, order } = req.body || {};
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
    });
    res.status(201).json(attribute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/attributes/:id', requireAdmin, async (req, res) => {
  try {
    const { label, section, fieldType, order, active } = req.body || {};
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

      const videoUrl = `${process.env.PUBLIC_BASE_URL}/uploads/catalog/${req.file.filename}`;
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
// person's details, not listing who's ready for a card).
router.get('/encode/client/:clientId', requireAdmin, async (req, res) => {
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
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/encode/pending -- paid clients who don't have a card
// encoded yet, for the "Create a card" list.
router.get('/encode/pending', requireAdmin, async (req, res) => {
  try {
    const pending = await Client.find({ paid: true, chipEncoded: false }).select(
      'clientId fullName cardType phone loginEmail'
    );
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/encode/mark-encoded/:clientId -- called right after a
// real hardware write+lock succeeds, to flip chipEncoded and store the
// password hash. encodedBy comes from the admin's own verified token,
// never from the request body, so this can't be spoofed as someone else.
router.post('/encode/mark-encoded/:clientId', requireAdmin, async (req, res) => {
  try {
    const { chipPasswordHash } = req.body || {};
    if (!chipPasswordHash) return res.status(400).json({ error: 'chipPasswordHash required' });
    const client = await Client.findOneAndUpdate(
      { clientId: req.params.clientId },
      {
        $set: {
          chipEncoded: true,
          chipPasswordHash,
          encodedAt: new Date(),
          encodedBy: req.admin.email,
        },
      },
      { new: true }
    );
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
