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
// multer does NOT create destination directories -- make sure both exist
// so a fresh clone doesn't 500 on first upload.
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(BANNERS_DIR, { recursive: true });
fs.mkdirSync(AR_VIDEOS_DIR, { recursive: true });

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

// POST /api/profile/photo -- multipart/form-data, field name "photo"
router.post('/photo', requireAuth, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file received' });
    }

    try {
      const photoUrl = `${process.env.PUBLIC_BASE_URL}/uploads/photos/${req.file.filename}`;
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
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No banner file received' });
    }

    try {
      const bannerUrl = `${process.env.PUBLIC_BASE_URL}/uploads/banners/${req.file.filename}`;
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
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No video file received' });
    }

    try {
      const arVideoUrl = `${process.env.PUBLIC_BASE_URL}/uploads/ar-videos/${req.file.filename}`;
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
  // purchased a plan that includes it.
  const plan = await CardPlan.findOne({ key: client.cardType }).select('arEnabled');
  const clientObj = client.toObject();
  clientObj.arEnabled = !!plan?.arEnabled;

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

    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase(), active: true });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an active card plan' });
    if (!plan.priceAmount) {
      return res.status(400).json({ error: 'This plan has no price set yet -- ask admin to set one, or use the request-only flow.' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(plan.priceAmount * 100), // Razorpay wants paise, the smallest unit
      currency: 'INR',
      receipt: `upg_${req.user.clientId}_${Date.now()}`,
      notes: { clientId: req.user.clientId, requestedPlan: plan.key },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
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

    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase() });

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
      amountPaid: plan?.priceAmount || null,
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

    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase(), active: true });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an active card plan' });
    if (!plan.priceAmount) {
      return res.status(400).json({ error: 'This plan has no price set yet -- ask admin to set one.' });
    }

    const existing = await Client.findOne({ loginEmail: recipientEmail.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(plan.priceAmount * 100),
      currency: 'INR',
      receipt: `new_${req.user.clientId}_${Date.now()}`,
      notes: { purchasedBy: req.user.clientId, requestedPlan: plan.key, recipientEmail: recipientEmail.toLowerCase() },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
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
      note: `Purchased for ${recipientName} <${recipientEmail}> -- new clientId ${clientId}`,
      status: 'fulfilled', // account already exists, nothing left for admin to do but encode the physical card
      paymentStatus: 'paid',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    res.status(201).json({
      clientId: newClient.clientId,
      loginEmail: newClient.loginEmail,
      tempPassword, // shown once -- pass this along to whoever the card is for
      cardType: newClient.cardType,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${newClient.clientId}`,
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
        video: fallback.video,
        contact: fallback.contact,
        portfolio: fallback.portfolio,
        social: fallback.social,
        huntsworld: fallback.huntsworld,
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

    const { video, contact, portfolio, social, huntsworld } = req.body || {};
    const updates = { clientId, updatedBy: req.user.loginEmail || clientId };
    if (video) updates.video = video;
    if (contact) updates.contact = contact;
    if (portfolio) updates.portfolio = portfolio;
    if (social) updates.social = social;
    if (huntsworld) updates.huntsworld = huntsworld;

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
