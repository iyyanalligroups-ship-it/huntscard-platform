const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const Razorpay = require('razorpay');
const { requireAuth } = require('../middleware/auth');
const Client = require('../models/Client');
const CardRequest = require('../models/CardRequest');
const CardPlan = require('../models/CardPlan');
const AttributeDefinition = require('../models/AttributeDefinition');
const { getChargeAmount } = require('../utils/pricing');

const router = express.Router();

// Only construct the Razorpay client if keys are actually set -- lets the
// rest of the app run fine before you've configured payments, and gives a
// clear error (not a crash) if someone hits the payment routes too early.
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Multiple cards per purchase = multiple PHYSICAL copies of the same
// profile (spare cards), not separate accounts -- so this only ever
// multiplies the amount charged and the count admin needs to encode, it
// never changes how many Client documents get created. Capped well below
// anything a real bulk order would need, just to keep a typo (or an
// abusive request) from creating a runaway Razorpay order.
const MAX_CARD_QUANTITY = 20;
function parseQuantity(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_CARD_QUANTITY);
}

// ---------------------------------------------------------------------
// Photo upload -- stored on local disk under backend/uploads/photos,
// served statically (see server.js). This is the actual "upload a file"
// version photoUrl was designed to be swapped out for -- clients no
// longer need to paste a link to an already-hosted image.
// ---------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const PHOTOS_DIR = path.join(__dirname, '..', 'uploads', 'photos');
const BANNERS_DIR = path.join(__dirname, '..', 'uploads', 'banners');
const AR_VIDEOS_DIR = path.join(__dirname, '..', 'uploads', 'ar-videos');
const AR_MODELS_DIR = path.join(__dirname, '..', 'uploads', 'ar-models');
// multer does NOT create destination directories -- make sure both exist
// so a fresh clone doesn't 500 on first upload.
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(BANNERS_DIR, { recursive: true });
fs.mkdirSync(AR_VIDEOS_DIR, { recursive: true });
fs.mkdirSync(AR_MODELS_DIR, { recursive: true });

function makeStorage(dir) {
  return multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => {
      // Unique filename per upload -- clientId + random suffix, so a
      // re-upload doesn't collide with (or silently overwrite in a way
      // that could race with) an in-flight request for the old one.
      const ext = path.extname(file.originalname) || '.jpg';
      const unique = crypto.randomBytes(6).toString('hex');
      cb(null, `${req.user.clientId}-${unique}${ext}`);
    },
  });
}

const imageFileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
  }
  cb(null, true);
};

const upload = multer({
  storage: makeStorage(PHOTOS_DIR),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

const bannerUpload = multer({
  storage: makeStorage(BANNERS_DIR),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

// Green-screen AR video for HuntsAR World. Much larger than the image
// limits above -- even a short (10-15s) green-screen clip is easily
// 20-50MB depending on resolution/bitrate, unlike a compressed photo.
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime']; // .mp4, .mov -- matches ViroVideo's supported formats
const videoFileFilter = (req, file, cb) => {
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only MP4 or MOV videos are allowed'));
  }
  cb(null, true);
};
const arVideoUpload = multer({
  storage: makeStorage(AR_VIDEOS_DIR),
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
  fileFilter: videoFileFilter,
});

// Real 3D model for HuntsAR World. Gated on the .glb file EXTENSION, not
// mimetype -- unlike images/video, browsers and OSes are inconsistent
// about what (if any) MIME type they report for .glb, so mimetype
// sniffing here would reject legitimate files as often as it'd catch bad
// ones.
const glbFileFilter = (req, file, cb) => {
  if (path.extname(file.originalname).toLowerCase() !== '.glb') {
    return cb(new Error('Only .glb 3D model files are allowed'));
  }
  cb(null, true);
};
const arModelUpload = multer({
  storage: makeStorage(AR_MODELS_DIR),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB -- GLBs vary a lot with texture complexity
  fileFilter: glbFileFilter,
});

// Multer's own message for an oversize file is just "File too large" --
// no mention of what the actual limit was, which isn't actionable for the
// person hitting it. Swap in the real limit for that one case; every other
// multer/fileFilter error (bad mimetype, etc.) already carries a clear
// message of its own, so those pass through unchanged.
function uploadErrorMessage(err, maxSizeLabel) {
  if (err.code === 'LIMIT_FILE_SIZE') return `File is too large -- max ${maxSizeLabel}.`;
  return err.message;
}

// POST /api/profile/photo -- multipart/form-data, field name "photo"
router.post('/photo', requireAuth, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: uploadErrorMessage(err, '5MB') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file received' });
    }

    try {
      const photoUrl = `${process.env.BACKEND_URL}/uploads/photos/${req.file.filename}`;
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { photoUrl } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(client);
    } catch (err2) {
      console.error('[profile/photo POST]', err2);
      res.status(500).json({ error: 'Failed to save photo' });
    }
  });
});

// ---------------------------------------------------------------------
// Banner upload -- cover image shown behind the profile photo on the tap
// page. Direct client upload, mirrors the photo flow exactly. This is
// NOT a rebuild of the removed "Card Designs" admin gallery.
// ---------------------------------------------------------------------

// POST /api/profile/banner -- multipart/form-data, field name "banner"
router.post('/banner', requireAuth, (req, res) => {
  bannerUpload.single('banner')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: uploadErrorMessage(err, '5MB') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No banner file received' });
    }

    try {
      const bannerUrl = `${process.env.BACKEND_URL}/uploads/banners/${req.file.filename}`;
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { bannerUrl } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(client);
    } catch (err2) {
      console.error('[profile/banner POST]', err2);
      res.status(500).json({ error: 'Failed to save banner' });
    }
  });
});

// DELETE /api/profile/banner -- go back to no banner
router.delete('/banner', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { bannerUrl: null } },
      { new: true }
    ).select('-passwordHash -chipPasswordHash');
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('[profile/banner DELETE]', err);
    res.status(500).json({ error: 'Failed to remove banner' });
  }
});

// POST /api/profile/ar-video -- green-screen video for HuntsAR World.
// Same upload/store/update pattern as photo and banner above.
router.post('/ar-video', requireAuth, (req, res) => {
  arVideoUpload.single('video')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: uploadErrorMessage(err, '80MB') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No video file received' });
    }

    try {
      const arVideoUrl = `${process.env.BACKEND_URL}/uploads/ar-videos/${req.file.filename}`;
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { arVideoUrl } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(client);
    } catch (err2) {
      console.error('[profile/ar-video POST]', err2);
      res.status(500).json({ error: 'Failed to save video' });
    }
  });
});

// DELETE /api/profile/ar-video -- go back to the plain photo panel in AR
router.delete('/ar-video', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { arVideoUrl: null } },
      { new: true }
    ).select('-passwordHash -chipPasswordHash');
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('[profile/ar-video DELETE]', err);
    res.status(500).json({ error: 'Failed to remove video' });
  }
});

// POST /api/profile/ar-model -- real .glb 3D model for HuntsAR World.
// Same upload/store/update pattern as photo/banner/ar-video above.
// AR-plan-gated like /ar-layout -- no point uploading a model that never
// gets used by a client whose plan doesn't include AR at all.
router.post('/ar-model', requireAuth, (req, res) => {
  arModelUpload.single('model')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: uploadErrorMessage(err, '50MB') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No model file received' });
    }

    try {
      const client0 = await Client.findOne({ clientId: req.user.clientId }).select('cardType');
      const plan = await CardPlan.findOne({ key: client0?.cardType }).select('arEnabled');
      if (!plan?.arEnabled) {
        return res.status(403).json({ error: 'The 3D model is not included in your current plan.' });
      }

      const arModelUrl = `${process.env.BACKEND_URL}/uploads/ar-models/${req.file.filename}`;
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { arModelUrl } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(client);
    } catch (err2) {
      console.error('[profile/ar-model POST]', err2);
      res.status(500).json({ error: 'Failed to save model' });
    }
  });
});

// DELETE /api/profile/ar-model
router.delete('/ar-model', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { arModelUrl: null } },
      { new: true }
    ).select('-passwordHash -chipPasswordHash');
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('[profile/ar-model DELETE]', err);
    res.status(500).json({ error: 'Failed to remove model' });
  }
});


// Fields a client is allowed to edit themselves. Deliberately does NOT
// include clientId, loginEmail, passwordHash, cardType, paid,
// chipEncoded, chipPasswordHash, encodedAt, mustChangePassword -- those
// are admin/system-only. cardType in particular is set once by admin at
// account creation and shown read-only on the client dashboard.
const EDITABLE_FIELDS = [
  'fullName',
  'jobTitle',
  'bio',
  'phone',
  'whatsapp',
  'publicEmail',
  'instagramUrl',
  'twitterUrl',
  'portfolioUrl',
  'huntsworldUrl',
];

// GET /api/profile/me -- return the logged-in client's own full profile
router.get('/me', requireAuth, async (req, res) => {
  const client = await Client.findOne({ clientId: req.user.clientId }).select('-passwordHash -chipPasswordHash');
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Whether this client's plan includes the AR feature -- the dashboard
  // uses this to gate the AR Layout page to clients who've actually
  // purchased a plan that includes it. Zing is gated the same way.
  const plan = await CardPlan.findOne({ key: client.cardType }).select('arEnabled zingEnabled');
  const clientObj = client.toObject();
  clientObj.arEnabled = !!plan?.arEnabled;
  clientObj.zingEnabled = !!plan?.zingEnabled;
  // client.toObject() does NOT flatten Map-type fields the way a Mongoose
  // document's own toJSON() would -- left as-is, customAttributes would
  // silently serialize as {} below, since a plain Map instance nested in a
  // plain object has no JSON.stringify-visible keys.
  clientObj.customAttributes = Object.fromEntries(client.customAttributes || []);

  res.json(clientObj);
});

// PUT /api/profile/me -- update the logged-in client's own profile.
// Note: clientId comes from req.user (the verified JWT), never from the
// request body or URL. This is the ownership check that prevents one
// client from editing another client's data.
router.put('/me', requireAuth, async (req, res) => {
  try {
    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }

    // Admin-defined extra fields (see AttributeDefinition) -- only keys
    // that are currently a real, active definition get saved; anything
    // else in the submitted object is silently dropped rather than
    // trusted, same spirit as EDITABLE_FIELDS above. Merged onto the
    // EXISTING map (not replaced outright) so a value saved for an
    // attribute the admin later deactivates isn't wiped out just because
    // Profile Settings -- which only ever shows active attributes -- can't
    // round-trip a key it was never shown in the first place.
    if (req.body.customAttributes && typeof req.body.customAttributes === 'object') {
      const activeKeys = new Set((await AttributeDefinition.find({ active: true }).select('key')).map((a) => a.key));
      const current = await Client.findOne({ clientId: req.user.clientId }).select('customAttributes');
      const merged = Object.fromEntries(current?.customAttributes || []);
      for (const [key, value] of Object.entries(req.body.customAttributes)) {
        if (activeKeys.has(key)) merged[key] = value;
      }
      updates.customAttributes = merged;
    }

    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash -chipPasswordHash');

    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('[profile/me PUT]', err);
    // Surface validation problems (e.g. a required field failing) as a
    // 400 with the real message, so the client UI can show the user what
    // to fix instead of a generic "Update failed".
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Update failed' });
  }
});

// -----------------------------------------------------------------------
// Razorpay upgrade payment flow -- separate from the plain POST /requests
// below on purpose. Only used when the target plan has a real priceAmount
// set; plans without pricing configured still go through the manual
// "we'll contact you" flow via POST /requests directly.
// -----------------------------------------------------------------------

// POST /api/profile/upgrade-order
// Creates a Razorpay order for the requested plan. Does NOT create a
// CardRequest yet -- that only happens after payment is verified, so a
// cancelled/failed checkout never leaves an orphaned pending request.
router.post('/upgrade-order', requireAuth, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({ error: 'Payments are not configured yet.' });
    }

    const { requestedPlan } = req.body;
    if (!requestedPlan) return res.status(400).json({ error: 'requestedPlan is required' });
    const quantity = parseQuantity(req.body.quantity);

    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase(), active: true });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an active card plan' });
    const chargeAmount = getChargeAmount(plan);
    if (!chargeAmount) {
      return res.status(400).json({ error: 'This plan has no price set yet -- ask admin to set one, or use the request-only flow.' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(chargeAmount * quantity * 100), // Razorpay wants paise, the smallest unit
      currency: 'INR',
      receipt: `upg_${req.user.clientId}_${Date.now()}`,
      notes: { clientId: req.user.clientId, requestedPlan: plan.key, quantity },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
      quantity,
    });
  } catch (err) {
    console.error('[profile/upgrade-order POST]', err);
    res.status(500).json({ error: 'Failed to start payment' });
  }
});

// POST /api/profile/upgrade-confirm
// Verifies the payment signature Razorpay's checkout returns, and only
// creates the CardRequest once that verification passes. This is the step
// that actually proves the payment is real -- never trust the frontend's
// word alone that a payment succeeded.
router.post('/upgrade-confirm', requireAuth, async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Payments are not configured yet.' });
    }

    const { requestedPlan, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!requestedPlan || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed -- signature mismatch.' });
    }

    // Quantity comes from the ORDER we created (server-controlled at
    // create-order time), never from this request's body -- otherwise
    // someone could pay for 1 card and just claim quantity: 100 here to
    // get free spare cards. The order's notes are the source of truth for
    // what was actually paid for.
    const order = await getRazorpay().orders.fetch(razorpay_order_id);
    const quantity = parseQuantity(order?.notes?.quantity);

    // Payment is verified above -- that IS the trust step now, so this
    // applies immediately rather than sitting in the admin queue waiting
    // for a manual Approve. The old manual flow (no price set) still goes
    // through admin review, since nothing has actually proven payment
    // there. Also sets paid: true unconditionally -- this same endpoint
    // now doubles as "get your first card" for a freshly self-registered
    // client with no cardType yet, not just later upgrades.
    await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { cardType: requestedPlan.toLowerCase(), paid: true } }
    );

    const request = await CardRequest.create({
      clientId: req.user.clientId,
      type: 'upgrade',
      requestedPlan: requestedPlan.toLowerCase(),
      status: 'approved', // auto-approved -- verified payment already happened
      paymentStatus: 'paid',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amountPaid: order.amount / 100, // the actual charged total, straight from Razorpay's own order record
      quantity,
    });

    res.status(201).json(request);
  } catch (err) {
    console.error('[profile/upgrade-confirm POST]', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// -----------------------------------------------------------------------
// New card purchase -- real purchase, same pattern as upgrade above.
// Since a new physical card means a brand new account (its own clientId,
// its own login), payment confirmation here actually creates that
// account automatically -- generates login credentials the same way the
// admin's "create client" flow does, and hands them back to whoever paid
// so they can pass them along (to themselves, or to whoever the card is
// actually for).
// -----------------------------------------------------------------------

function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomFillSync(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

// POST /api/profile/new-card-order
router.post('/new-card-order', requireAuth, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({ error: 'Payments are not configured yet.' });
    }

    const { requestedPlan, recipientName, recipientEmail } = req.body;
    if (!requestedPlan || !recipientName || !recipientEmail) {
      return res.status(400).json({ error: 'requestedPlan, recipientName, and recipientEmail are required' });
    }
    const quantity = parseQuantity(req.body.quantity);

    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase(), active: true });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an active card plan' });
    const chargeAmount = getChargeAmount(plan);
    if (!chargeAmount) {
      return res.status(400).json({ error: 'This plan has no price set yet -- ask admin to set one.' });
    }

    const existing = await Client.findOne({ loginEmail: recipientEmail.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(chargeAmount * quantity * 100),
      currency: 'INR',
      receipt: `new_${req.user.clientId}_${Date.now()}`,
      notes: { purchasedBy: req.user.clientId, requestedPlan: plan.key, recipientEmail: recipientEmail.toLowerCase(), quantity },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
      quantity,
    });
  } catch (err) {
    console.error('[profile/new-card-order POST]', err);
    res.status(500).json({ error: 'Failed to start payment' });
  }
});

// POST /api/profile/new-card-confirm
router.post('/new-card-confirm', requireAuth, async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Payments are not configured yet.' });
    }

    const {
      requestedPlan,
      recipientName,
      recipientEmail,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    if (!requestedPlan || !recipientName || !recipientEmail || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed -- signature mismatch.' });
    }

    // Same as upgrade-confirm above: quantity comes from the order WE
    // created, never trusted from this request body directly.
    const order = await getRazorpay().orders.fetch(razorpay_order_id);
    const quantity = parseQuantity(order?.notes?.quantity);

    const existing = await Client.findOne({ loginEmail: recipientEmail.toLowerCase() });
    if (existing) {
      // Payment already succeeded at this point -- can't silently drop it.
      // Surface this clearly so admin can sort it out manually rather than
      // losing track of a paid-for card with nowhere to go.
      return res.status(409).json({
        error: 'Payment succeeded, but an account with this email already exists. Contact admin with your payment ID: ' + razorpay_payment_id,
      });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const clientId = nanoid(10);

    const newClient = await Client.create({
      clientId,
      loginEmail: recipientEmail.toLowerCase(),
      passwordHash,
      fullName: recipientName,
      cardType: requestedPlan.toLowerCase(),
      paid: true, // verified above -- real payment already happened
      mustChangePassword: true,
    });

    await CardRequest.create({
      clientId: req.user.clientId, // who paid, for audit -- not the new account
      type: 'new_card',
      note: `Purchased for ${recipientName} <${recipientEmail}> -- new clientId ${clientId}${quantity > 1 ? ` -- ${quantity} physical cards for this one profile` : ''}`,
      status: 'fulfilled', // account already exists, nothing left for admin to do but encode the physical card(s)
      paymentStatus: 'paid',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      quantity,
    });

    res.status(201).json({
      clientId: newClient.clientId,
      loginEmail: newClient.loginEmail,
      tempPassword, // shown once -- pass this along to whoever the card is for
      cardType: newClient.cardType,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${newClient.clientId}`,
      quantity,
    });
  } catch (err) {
    console.error('[profile/new-card-confirm POST]', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// POST /api/profile/requests
router.post('/requests', requireAuth, async (req, res) => {
  try {
    const { type, requestedPlan, note } = req.body;
    if (!['upgrade', 'new_card'].includes(type)) {
      return res.status(400).json({ error: "type must be 'upgrade' or 'new_card'" });
    }

    if (type === 'upgrade') {
      if (!requestedPlan) return res.status(400).json({ error: 'requestedPlan is required for an upgrade request' });
      const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase(), active: true });
      if (!plan) return res.status(400).json({ error: 'requestedPlan must match an active card plan' });
    }

    const request = await CardRequest.create({
      clientId: req.user.clientId,
      type,
      requestedPlan: type === 'upgrade' ? requestedPlan.toLowerCase() : null,
      note: note || '',
    });

    res.status(201).json(request);
  } catch (err) {
    console.error('[profile/requests POST]', err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// GET /api/profile/requests -- the client's own request history, so a
// submitted request doesn't just disappear from their view.
router.get('/requests', requireAuth, async (req, res) => {
  const requests = await CardRequest.find({ clientId: req.user.clientId }).sort({ createdAt: -1 });
  res.json(requests);
});

// ---------------------------------------------------------------------
// AR Layout -- lets a client position their own AR elements (video,
// contact, portfolio, social, huntsworld), instead of only admins being
// able to set one shared arrangement for everyone. If the client hasn't
// customized their own yet, the admin's global default doc is returned
// as a starting point (not saved until the client actually hits Save).
// ---------------------------------------------------------------------

const ArLayout = require('../models/ArLayout');

router.get('/ar-layout', requireAuth, async (req, res) => {
  try {
    const clientId = req.user.clientId;
    let layout = await ArLayout.findOne({ clientId });
    if (!layout) {
      const fallback = (await ArLayout.findOne({ key: 'global' })) || new ArLayout({ key: 'global' });
      layout = new ArLayout({
        clientId,
        qr: fallback.qr,
        video: fallback.video,
        contact: fallback.contact,
        portfolio: fallback.portfolio,
        social: fallback.social,
        huntsworld: fallback.huntsworld,
        model: fallback.model,
        modelRotationX: fallback.modelRotationX,
        modelRotationY: fallback.modelRotationY,
        modelRotationZ: fallback.modelRotationZ,
        modelScale: fallback.modelScale,
        videoRotationX: fallback.videoRotationX,
        videoRotationY: fallback.videoRotationY,
        videoRotationZ: fallback.videoRotationZ,
        videoScale: fallback.videoScale,
      });
    }
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/ar-layout', requireAuth, async (req, res) => {
  try {
    const clientId = req.user.clientId;

    const client = await Client.findOne({ clientId }).select('cardType');
    const plan = await CardPlan.findOne({ key: client?.cardType }).select('arEnabled');
    if (!plan?.arEnabled) {
      return res.status(403).json({ error: 'AR Layout is not included in your current plan.' });
    }

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
    const updates = { clientId, updatedBy: req.user.loginEmail || clientId };
    if (qr) updates.qr = qr;
    if (video) updates.video = video;
    if (contact) updates.contact = contact;
    if (portfolio) updates.portfolio = portfolio;
    if (social) updates.social = social;
    if (huntsworld) updates.huntsworld = huntsworld;
    if (model) updates.model = model;
    // Rotation can legitimately BE 0 (reset to default) -- unlike the
    // truthy checks above, that has to still count as "provided".
    if (modelRotationX !== undefined) updates.modelRotationX = modelRotationX;
    if (modelRotationY !== undefined) updates.modelRotationY = modelRotationY;
    if (modelRotationZ !== undefined) updates.modelRotationZ = modelRotationZ;
    if (modelScale !== undefined) updates.modelScale = modelScale;
    if (videoRotationX !== undefined) updates.videoRotationX = videoRotationX;
    if (videoRotationY !== undefined) updates.videoRotationY = videoRotationY;
    if (videoRotationZ !== undefined) updates.videoRotationZ = videoRotationZ;
    if (videoScale !== undefined) updates.videoScale = videoScale;

    const layout = await ArLayout.findOneAndUpdate(
      { clientId },
      { $set: updates },
      { new: true, upsert: true }
    );
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
