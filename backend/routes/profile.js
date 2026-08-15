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
const MagicBusinessCard = require('../models/MagicBusinessCard');
const CardRequest = require('../models/CardRequest');
const CardPlan = require('../models/CardPlan');
const Card = require('../models/Card');
const AttributeDefinition = require('../models/AttributeDefinition');
const { getChargeAmount } = require('../utils/pricing');
const { sendEmail } = require('../utils/email');

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
const AR_MODELS_DIR = path.join(__dirname, '..', 'uploads', 'ar-models');
const AR_BANNERS_DIR = path.join(__dirname, '..', 'uploads', 'ar-banners');
const LOGOS_DIR = path.join(__dirname, '..', 'uploads', 'logos');
// multer does NOT create destination directories -- make sure both exist
// so a fresh clone doesn't 500 on first upload. Note: uploads/ar-videos/
// (legacy) isn't created here anymore since nothing writes to it, but any
// files already there keep being served fine by server.js's static
// /uploads mount regardless.
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(BANNERS_DIR, { recursive: true });
fs.mkdirSync(AR_MODELS_DIR, { recursive: true });
fs.mkdirSync(AR_BANNERS_DIR, { recursive: true });
fs.mkdirSync(LOGOS_DIR, { recursive: true });

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

const logoUpload = multer({
  storage: makeStorage(LOGOS_DIR),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

// Green-screen AR video mimetypes -- much larger than the image limits
// above (even a short 10-15s clip easily runs 20-50MB), reused below by
// the combined banner filter since it accepts video as one of two options.
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime']; // .mp4, .mov -- matches ViroVideo's supported formats

// "HuntsAR World Banner" -- one upload slot accepting EITHER a video or a
// still image (client picks whichever they have); arBannerType records
// which one this actually was, set from the file's own mimetype below.
// Ceiling matches the video limit -- an image is always well under that
// anyway, no need for two separate size limits.
const arBannerFileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, WEBP images or MP4/MOV videos are allowed'));
  }
  cb(null, true);
};
const arBannerUpload = multer({
  storage: makeStorage(AR_BANNERS_DIR),
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
  fileFilter: arBannerFileFilter,
});

// "3D Model" slot -- a real .glb or .fbx model OR a flat cutout image
// (arModelType records which, set below from whichever check matched).
// .glb/.fbx are gated on file EXTENSION, not mimetype -- unlike images,
// browsers/OSes are inconsistent about what (if any) MIME type they
// report for 3D model files, so mimetype sniffing here would reject
// legitimate files as often as it'd catch bad ones. Images use the
// normal mimetype check, same as every other image upload in this file.
const MODEL_EXTENSIONS = ['.glb', '.fbx'];
const glbOrImageFileFilter = (req, file, cb) => {
  const isModel = MODEL_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());
  const isImage = ALLOWED_MIME_TYPES.includes(file.mimetype);
  if (!isModel && !isImage) {
    return cb(new Error('Only .glb/.fbx 3D model files or JPEG/PNG/WEBP images are allowed'));
  }
  cb(null, true);
};
const arModelUpload = multer({
  storage: makeStorage(AR_MODELS_DIR),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB -- GLBs/FBXs vary a lot with texture complexity
  fileFilter: glbOrImageFileFilter,
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

// Every mutation route below returns the updated client so the dashboard
// can setProfile(updated) straight from the response instead of refetching
// -- but a raw Client document doesn't carry arEnabled/zingEnabled (those
// are computed from the client's CardPlan, not stored on Client itself).
// Without this, any UI gated on profile.arEnabled (e.g. the 3D model
// section) would flash into its "not included in your plan" state right
// after a successful upload, since the fresh response has arEnabled
// missing/falsy even though the plan really does include it. Mirrors GET
// /me's own computation exactly, including the customAttributes Map fix
// (see that route for why).
async function withPlanFlags(client) {
  const plan = await CardPlan.findOne({ key: client.cardType }).select('arEnabled zingEnabled variants');
  const clientObj = client.toObject();
  clientObj.arEnabled = !!plan?.arEnabled;
  clientObj.zingEnabled = !!plan?.zingEnabled;
  // The physical card's actual shape -- picked at purchase time (see
  // CardPlanVariantSchema.shape) and needed by the AR layout system to
  // size/orient itself to match instead of always assuming landscape. See
  // the matching computation in public.js's GET /profile/:clientId.
  const variant = plan?.variants?.find((v) => v._id.toString() === String(client.cardVariantId));
  clientObj.cardShape = variant?.shape || 'horizontal';
  clientObj.customAttributes = Object.fromEntries(client.customAttributes || []);
  return clientObj;
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

      res.json(await withPlanFlags(client));
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

      res.json(await withPlanFlags(client));
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
    res.json(await withPlanFlags(client));
  } catch (err) {
    console.error('[profile/banner DELETE]', err);
    res.status(500).json({ error: 'Failed to remove banner' });
  }
});

// ---------------------------------------------------------------------
// Logo upload -- the client's own (e.g. company) logo, for print
// production on the physical card. Direct client upload, mirrors the
// photo/banner flow exactly -- admin downloads it from the Clients page.
// ---------------------------------------------------------------------

// POST /api/profile/logo -- multipart/form-data, field name "logo"
router.post('/logo', requireAuth, (req, res) => {
  logoUpload.single('logo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: uploadErrorMessage(err, '5MB') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file received' });
    }

    try {
      const logoUrl = `${process.env.BACKEND_URL}/uploads/logos/${req.file.filename}`;
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { logoUrl } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(await withPlanFlags(client));
    } catch (err2) {
      console.error('[profile/logo POST]', err2);
      res.status(500).json({ error: 'Failed to save logo' });
    }
  });
});

// DELETE /api/profile/logo -- go back to no logo
router.delete('/logo', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { logoUrl: null } },
      { new: true }
    ).select('-passwordHash -chipPasswordHash');
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(await withPlanFlags(client));
  } catch (err) {
    console.error('[profile/logo DELETE]', err);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
});

// POST /api/profile/ar-banner -- "HuntsAR World Banner", one upload slot
// for EITHER a green-screen video or a still image (arBannerType records
// which). Replaces the old video-only /ar-video route; arVideoUrl stays
// on the schema as a read-only fallback for whatever was uploaded before
// this existed (see Client.js), but nothing writes to it anymore.
router.post('/ar-banner', requireAuth, (req, res) => {
  arBannerUpload.single('banner')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: uploadErrorMessage(err, '80MB') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file received' });
    }

    try {
      const arBannerUrl = `${process.env.BACKEND_URL}/uploads/ar-banners/${req.file.filename}`;
      const arBannerType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { arBannerUrl, arBannerType } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(await withPlanFlags(client));
    } catch (err2) {
      console.error('[profile/ar-banner POST]', err2);
      res.status(500).json({ error: 'Failed to save banner' });
    }
  });
});

// DELETE /api/profile/ar-banner -- go back to the plain photo/text panel
// in AR. Clears the legacy arVideoUrl too, so removing the banner really
// empties the slot regardless of which field it came from.
router.delete('/ar-banner', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { arBannerUrl: null, arBannerType: null, arVideoUrl: null } },
      { new: true }
    ).select('-passwordHash -chipPasswordHash');
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(await withPlanFlags(client));
  } catch (err) {
    console.error('[profile/ar-banner DELETE]', err);
    res.status(500).json({ error: 'Failed to remove banner' });
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
      const ext = path.extname(req.file.originalname).toLowerCase();
      const arModelType = ext === '.glb' ? 'glb' : ext === '.fbx' ? 'fbx' : 'image';
      const client = await Client.findOneAndUpdate(
        { clientId: req.user.clientId },
        { $set: { arModelUrl, arModelType } },
        { new: true }
      ).select('-passwordHash -chipPasswordHash');

      res.json(await withPlanFlags(client));
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
      { $set: { arModelUrl: null, arModelType: null } },
      { new: true }
    ).select('-passwordHash -chipPasswordHash');
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(await withPlanFlags(client));
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
  // Admin-only fields -- editable here, but never returned by the public
  // profile route or rendered on the tap page (see Client.js comment).
  'gender',
  'dateOfBirth',
];

// GET /api/profile/me -- return the logged-in client's own full profile
router.get('/me', requireAuth, async (req, res) => {
  const client = await Client.findOne({ clientId: req.user.clientId }).select('-passwordHash -chipPasswordHash');
  if (!client) return res.status(404).json({ error: 'Client not found' });

  res.json(await withPlanFlags(client));
});

// Magic Business Card -- self-service now (client can edit their own,
// same as admin's ClientDetail.jsx can -- both operate on the exact same
// doc/files, scoped here by req.user.clientId instead of an admin-
// supplied :clientId param). Files land in the SAME uploads/magic-cards/
// dir admin's routes (backend/routes/admin.js) already use, via the
// SAME makeStorage() helper this file already uses for photo/banner/etc.
const MAGIC_CARDS_DIR = path.join(__dirname, '..', 'uploads', 'magic-cards');
fs.mkdirSync(MAGIC_CARDS_DIR, { recursive: true });
const magicCardImageUpload = multer({
  storage: makeStorage(MAGIC_CARDS_DIR),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});
const magicCardVideoUpload = multer({
  storage: makeStorage(MAGIC_CARDS_DIR),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only MP4 or MOV videos are allowed'));
    }
    cb(null, true);
  },
});
function serializeMyMagicCard(doc) {
  return {
    cardType: doc.cardType || null,
    imageUrl: doc.imageUrl || null,
    imageWidth: doc.imageWidth,
    imageHeight: doc.imageHeight,
    videoUrl: doc.videoUrl || null,
    videoCrop: {
      x: doc.videoCropX ?? 0,
      y: doc.videoCropY ?? 0,
      width: doc.videoCropWidth ?? 1,
      height: doc.videoCropHeight ?? 1,
    },
    active: Boolean(doc.active),
    qrPosition: { x: doc.qrX ?? 82, y: doc.qrY ?? 82 },
    componentPositions: {
      contact: { x: doc.contactX ?? 20, y: doc.contactY ?? 120, z: doc.contactZ ?? 0, rotation: doc.contactRotation ?? 0 },
      portfolio: { x: doc.portfolioX ?? 50, y: doc.portfolioY ?? 120, z: doc.portfolioZ ?? 0, rotation: doc.portfolioRotation ?? 0 },
      social: { x: doc.socialX ?? 80, y: doc.socialY ?? 120, z: doc.socialZ ?? 0, rotation: doc.socialRotation ?? 0 },
      huntsworld: { x: doc.huntsworldX ?? 50, y: doc.huntsworldY ?? 145, z: doc.huntsworldZ ?? 0, rotation: doc.huntsworldRotation ?? 0 },
    },
    // Admin-defined custom components (see AttributeDefinition.magicComponent)
    // -- flattened from the Map the same way ArLayout.customElements is
    // for the main AR Layout system.
    magicElements: Object.fromEntries(doc.magicElements || []),
  };
}

async function findOrCreateMyMagicCard(clientId) {
  return MagicBusinessCard.findOneAndUpdate(
    { clientId },
    { $setOnInsert: { clientId } },
    { upsert: true, new: true }
  );
}

// GET /api/profile/magic-card -- the logged-in client's own Magic
// Business Card (see backend/models/MagicBusinessCard.js). Returns the
// CURRENT state regardless of active/draft status -- this used to filter
// to active-only back when only admin could edit (hiding an in-progress
// admin draft from a client who had no way to affect it), but now the
// client is an editor of their own card too, so hiding their own draft
// from themselves makes no sense. `active` in the response drives the
// dashboard's publish/unpublish control instead.
router.get('/magic-card', requireAuth, async (req, res) => {
  const doc = await findOrCreateMyMagicCard(req.user.clientId);
  res.json(serializeMyMagicCard(doc));
});

// POST /api/profile/magic-card/card-type -- 'vertical' or 'horizontal'
// (85x55mm either way, just rotated). Chosen before the image, since it
// determines the crop aspect ratio the image gets locked to.
router.post('/magic-card/card-type', requireAuth, async (req, res) => {
  try {
    const { cardType } = req.body;
    if (cardType !== 'vertical' && cardType !== 'horizontal') {
      return res.status(400).json({ error: "cardType must be 'vertical' or 'horizontal'" });
    }
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    doc.cardType = cardType;
    await doc.save();
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/magic-card/qr-position -- where the client dragged
// the AR QR onto their own card design (see MagicBusinessCard.jsx),
// percentages 0-100 on each axis. Composited into the printable download
// at this spot, so this can be saved/changed independently of (and more
// often than) the image/video themselves.
router.post('/magic-card/qr-position', requireAuth, async (req, res) => {
  try {
    const { x, y } = req.body;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 100 || y < 0 || y > 100) {
      return res.status(400).json({ error: 'x and y must be numbers between 0 and 100' });
    }
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    doc.qrX = x;
    doc.qrY = y;
    await doc.save();
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MAGIC_CARD_BUILTIN_COMPONENT_KEYS = ['contact', 'portfolio', 'social', 'huntsworld'];
// POST /api/profile/magic-card/component-position -- where the client
// placed one AR component relative to their tracked card, in
// MagicCamera.jsx's own 3D scene -- completely separate from the main AR
// Layout system's positions (only the underlying link values are shared,
// see that system's own `layout.contact` etc.). `key` is either one of
// the 3 built-ins (own dedicated x/y/z fields) or an admin-defined
// custom component's key (see AttributeDefinition.magicComponent),
// stored in the magicElements Map instead -- same "built-in fields +
// dynamic Map for the rest" split the main AR Layout system already uses
// between its own named fields and ArLayout.customElements.
router.post('/magic-card/component-position', requireAuth, async (req, res) => {
  try {
    const { key, x, y, z, rotation } = req.body;
    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ error: 'x and y must be numbers' });
    }
    if (z !== undefined && (typeof z !== 'number' || z < 0 || z > 100)) {
      return res.status(400).json({ error: 'z must be a number between 0 and 100' });
    }
    if (rotation !== undefined && (typeof rotation !== 'number' || rotation < -180 || rotation > 180)) {
      return res.status(400).json({ error: 'rotation must be a number between -180 and 180' });
    }
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    if (MAGIC_CARD_BUILTIN_COMPONENT_KEYS.includes(key)) {
      doc[`${key}X`] = x;
      doc[`${key}Y`] = y;
      if (z !== undefined) doc[`${key}Z`] = z;
      if (rotation !== undefined) doc[`${key}Rotation`] = rotation;
    } else {
      const validKey = await AttributeDefinition.exists({ key, active: true, magicComponent: true });
      if (!validKey) return res.status(400).json({ error: 'Unknown or inactive Magic component key' });
      if (!doc.magicElements) doc.magicElements = new Map();
      const existing = doc.magicElements.get(key);
      doc.magicElements.set(key, {
        x,
        y,
        z: z ?? existing?.z ?? 0,
        rotation: rotation ?? existing?.rotation ?? 0,
      });
    }
    await doc.save();
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/magic-card/activate -- requires both an image and a
// video (same rule as admin's version of this route).
router.post('/magic-card/activate', requireAuth, async (req, res) => {
  try {
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    if (!doc.imageUrl || !doc.videoUrl) {
      return res.status(400).json({ error: 'Add both an image and a video before activating.' });
    }
    doc.active = true;
    await doc.save();
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/magic-card/deactivate', requireAuth, async (req, res) => {
  try {
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    doc.active = false;
    await doc.save();
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/magic-card/image', requireAuth, magicCardImageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    const previousUrl = doc.imageUrl;
    doc.imageUrl = `${process.env.BACKEND_URL}/uploads/magic-cards/${req.file.filename}`;
    doc.imageWidth = Number(req.body.width) || undefined;
    doc.imageHeight = Number(req.body.height) || undefined;
    await doc.save();
    if (previousUrl) fs.unlink(path.join(MAGIC_CARDS_DIR, path.basename(previousUrl)), () => {});
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 50MB.' : err.message;
    res.status(400).json({ error: message });
  }
});

router.post('/magic-card/video', requireAuth, magicCardVideoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    const previousUrl = doc.videoUrl;
    doc.videoUrl = `${process.env.BACKEND_URL}/uploads/magic-cards/${req.file.filename}`;
    doc.videoCropX = Number(req.body.cropX) || 0;
    doc.videoCropY = Number(req.body.cropY) || 0;
    doc.videoCropWidth = Number(req.body.cropWidth) || 1;
    doc.videoCropHeight = Number(req.body.cropHeight) || 1;
    await doc.save();
    if (previousUrl) fs.unlink(path.join(MAGIC_CARDS_DIR, path.basename(previousUrl)), () => {});
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 80MB.' : err.message;
    res.status(400).json({ error: message });
  }
});

router.delete('/magic-card/:field', requireAuth, async (req, res) => {
  try {
    const { field } = req.params;
    if (field !== 'image' && field !== 'video') {
      return res.status(400).json({ error: 'Unknown field' });
    }
    const doc = await findOrCreateMyMagicCard(req.user.clientId);
    if (field === 'image') {
      if (doc.imageUrl) fs.unlink(path.join(MAGIC_CARDS_DIR, path.basename(doc.imageUrl)), () => {});
      doc.imageUrl = undefined;
      doc.imageWidth = undefined;
      doc.imageHeight = undefined;
    } else {
      if (doc.videoUrl) fs.unlink(path.join(MAGIC_CARDS_DIR, path.basename(doc.videoUrl)), () => {});
      doc.videoUrl = undefined;
      doc.videoCropX = undefined;
      doc.videoCropY = undefined;
      doc.videoCropWidth = undefined;
      doc.videoCropHeight = undefined;
    }
    await doc.save();
    res.json(serializeMyMagicCard(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/me -- update the logged-in client's own profile.
// Note: clientId comes from req.user (the verified JWT), never from the
// request body or URL. This is the ownership check that prevents one
// client from editing another client's data.
router.put('/me', requireAuth, async (req, res) => {
  try {
    if (req.body.gender && !['male', 'female', 'other'].includes(req.body.gender)) {
      return res.status(400).json({ error: 'gender must be male, female, or other' });
    }

    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) updates[field] = req.body[field];
    }
    // Empty string means "cleared" from the Profile Settings form -- for
    // dateOfBirth Mongoose would otherwise try to cast '' to a Date and
    // throw; for gender, '' isn't one of the enum's allowed values
    // (only 'male'/'female'/'other'/null are) and would fail validation.
    if (updates.dateOfBirth === '') updates.dateOfBirth = null;
    if (updates.gender === '') updates.gender = null;

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
    res.json(await withPlanFlags(client));
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
// Deactivate/pause card -- hides the public profile/vCard/AR experience
// from anyone who taps or scans it (see routes/public.js's cardActive
// checks), e.g. because the physical card was lost or stolen. Two
// dedicated routes rather than folding into PUT /me's EDITABLE_FIELDS --
// a security-sensitive on/off switch is safer as an explicit action than
// a field a client could flip by sending the wrong boolean.
// -----------------------------------------------------------------------

router.post('/pause-card', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { cardActive: false } },
      { new: true }
    ).select('loginEmail');
    if (client?.loginEmail) {
      sendEmail(
        client.loginEmail,
        'Your HuntsTAG card has been frozen',
        "Your card has just been frozen -- nobody can tap or scan it to see your profile until you turn it back on. If this wasn't you, log in and reactivate it from your dashboard right away."
      ).catch((err) => console.error('[pause-card] confirmation email failed:', err.message));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[pause-card POST]', err);
    res.status(500).json({ error: 'Failed to pause card' });
  }
});

router.post('/unpause-card', requireAuth, async (req, res) => {
  try {
    const client = await Client.findOneAndUpdate(
      { clientId: req.user.clientId },
      { $set: { cardActive: true } },
      { new: true }
    ).select('loginEmail');
    if (client?.loginEmail) {
      sendEmail(
        client.loginEmail,
        'Your HuntsTAG card is active again',
        'Your card is active again -- tapping or scanning it now shows your live profile as normal.'
      ).catch((err) => console.error('[unpause-card] confirmation email failed:', err.message));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[unpause-card POST]', err);
    res.status(500).json({ error: 'Failed to reactivate card' });
  }
});

// -----------------------------------------------------------------------
// Per-card records (see models/Card.js) -- the whole-profile pause above
// is the overall kill switch; these let a client see/deactivate their
// OWN individual physical cards. Never exposes the password (that's
// admin-only, see routes/admin.js's dedicated reveal route) -- these
// routes don't even select passwordEncrypted, so it can't leak here.
// -----------------------------------------------------------------------

router.get('/cards', requireAuth, async (req, res) => {
  try {
    const cards = await Card.find({ clientId: req.user.clientId })
      .select('cardNumber cardType active encoded')
      .sort({ cardNumber: 1 });
    res.json(cards);
  } catch (err) {
    console.error('[cards GET]', err);
    res.status(500).json({ error: 'Failed to load cards' });
  }
});

router.post('/cards/:cardNumber/pause', requireAuth, async (req, res) => {
  try {
    const card = await Card.findOneAndUpdate(
      { clientId: req.user.clientId, cardNumber: Number(req.params.cardNumber) },
      { $set: { active: false } },
      { new: true }
    ).select('cardNumber cardType active encoded');
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const client = await Client.findOne({ clientId: req.user.clientId }).select('loginEmail');
    if (client?.loginEmail) {
      sendEmail(
        client.loginEmail,
        `Card #${card.cardNumber} has been frozen`,
        `Card #${card.cardNumber} has just been frozen -- nobody can tap or scan THIS specific card until you turn it back on. Your other cards, if any, are unaffected. If this wasn't you, log in and reactivate it from your dashboard right away.`
      ).catch((err) => console.error('[card pause] confirmation email failed:', err.message));
    }
    res.json(card);
  } catch (err) {
    console.error('[card pause POST]', err);
    res.status(500).json({ error: 'Failed to deactivate card' });
  }
});

router.post('/cards/:cardNumber/unpause', requireAuth, async (req, res) => {
  try {
    const card = await Card.findOneAndUpdate(
      { clientId: req.user.clientId, cardNumber: Number(req.params.cardNumber) },
      { $set: { active: true } },
      { new: true }
    ).select('cardNumber cardType active encoded');
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const client = await Client.findOne({ clientId: req.user.clientId }).select('loginEmail');
    if (client?.loginEmail) {
      sendEmail(
        client.loginEmail,
        `Card #${card.cardNumber} is active again`,
        `Card #${card.cardNumber} is active again -- tapping or scanning it now shows your live profile as normal.`
      ).catch((err) => console.error('[card unpause] confirmation email failed:', err.message));
    }
    res.json(card);
  } catch (err) {
    console.error('[card unpause POST]', err);
    res.status(500).json({ error: 'Failed to reactivate card' });
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

    const {
      requestedPlan, razorpay_order_id, razorpay_payment_id, razorpay_signature,
      cardVariantId, designFrontUrl, designBackUrl,
    } = req.body;
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

    // Variant/design fields don't affect the charge amount (unlike
    // quantity below), so there's no tampering risk in trusting them
    // straight from this request body -- same trust level requestedPlan
    // itself already has here (no order.notes cross-check exists for it
    // either).
    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase() });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an existing card plan' });
    if (plan.variants.length > 0) {
      if (!cardVariantId || !plan.variants.some((v) => v._id.toString() === cardVariantId)) {
        return res.status(400).json({ error: 'A valid card variant must be selected for this plan.' });
      }
    }
    if (plan.requiresDesignUpload && (!designFrontUrl || !designBackUrl)) {
      return res.status(400).json({ error: 'Front and back design uploads are required for this plan.' });
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
      { $set: {
          cardType: requestedPlan.toLowerCase(),
          paid: true,
          cardVariantId: plan.variants.length > 0 ? cardVariantId : null,
          customDesignFrontUrl: plan.requiresDesignUpload ? designFrontUrl : null,
          customDesignBackUrl: plan.requiresDesignUpload ? designBackUrl : null,
        } }
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
      cardVariantId,
      designFrontUrl,
      designBackUrl,
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

    // Same reasoning as upgrade-confirm above: variant/design don't
    // affect the charge amount, so trusting them from this request body
    // (rather than order.notes) carries no tampering risk.
    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase() });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an existing card plan' });
    if (plan.variants.length > 0) {
      if (!cardVariantId || !plan.variants.some((v) => v._id.toString() === cardVariantId)) {
        return res.status(400).json({ error: 'A valid card variant must be selected for this plan.' });
      }
    }
    if (plan.requiresDesignUpload && (!designFrontUrl || !designBackUrl)) {
      return res.status(400).json({ error: 'Front and back design uploads are required for this plan.' });
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
      cardVariantId: plan.variants.length > 0 ? cardVariantId : null,
      customDesignFrontUrl: plan.requiresDesignUpload ? designFrontUrl : null,
      customDesignBackUrl: plan.requiresDesignUpload ? designBackUrl : null,
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
        videoScaleX: fallback.videoScaleX,
        videoScaleY: fallback.videoScaleY,
        customElements: fallback.customElements,
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
      videoScaleX,
      videoScaleY,
      customElements,
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
    if (videoScaleX !== undefined) updates.videoScaleX = videoScaleX;
    if (videoScaleY !== undefined) updates.videoScaleY = videoScaleY;
    // Positions for AR-flagged attributes (see AttributeDefinition.arComponent)
    // -- a whole-map replace, same as every other field here.
    if (customElements && typeof customElements === 'object') updates.customElements = customElements;

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
