const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const Razorpay = require('razorpay');
const Client = require('../models/Client');
const CardPlan = require('../models/CardPlan');
const CardRequest = require('../models/CardRequest');
const ContactMessage = require('../models/ContactMessage');
const Contact = require('../models/Contact');
const Notification = require('../models/Notification');
const Card = require('../models/Card');
const { sendPushToClient } = require('../utils/push');
const ArLayout = require('../models/ArLayout');
const ArIcon = require('../models/ArIcon');
const AttributeDefinition = require('../models/AttributeDefinition');
const CatalogVideo = require('../models/CatalogVideo');
const { getChargeAmount } = require('../utils/pricing');

const router = express.Router();

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomFillSync(new Uint8Array(12)))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

// Two independent gates: the whole-profile pause (Client.cardActive, see
// Settings.jsx's "Card status") is always checked -- the overall kill
// switch. The optional ?card=N query param additionally targets ONE
// specific physical card (see models/Card.js), since every card for a
// client used to encode the identical URL with no way to tell them apart
// -- cards written before this feature has no ?card= and so can't be
// individually blocked, only the whole-profile switch applies to them.
// Used by every public route below that exposes real client data.
async function isCardBlocked(clientId, cardNumberParam) {
  const cardNumber = Number(cardNumberParam);
  if (!cardNumberParam || !Number.isFinite(cardNumber)) return false;
  const card = await Card.findOne({ clientId, cardNumber }).select('active');
  return Boolean(card && !card.active);
}

// GET /api/public/plans
// Active card plans, for the client dashboard's "upgrade" picker. Plan
// names/prices aren't sensitive -- same info a public pricing page would
// show -- so this is deliberately unauthenticated.
router.get('/plans', async (req, res) => {
  const plans = await CardPlan.find({ active: true })
    .select('name key price priceAmount description images variants requiresDesignUpload')
    .sort({ createdAt: 1 });
  // chargeAmount is what checkout actually uses -- priceAmount if admin set
  // it, else a plain-number `price` (e.g. "499") parsed as a fallback. Sent
  // as its own field so the frontend doesn't have to duplicate that parsing.
  res.json(plans.map((p) => ({ ...p.toObject(), chargeAmount: getChargeAmount(p) })));
});

// GET /api/public/catalog -- active card types that have a showcase
// video uploaded (see admin.js), for the public Catalog page. Types
// without a video simply don't appear -- no placeholder/blank entries.
router.get('/catalog', async (req, res) => {
  try {
    const plans = await CardPlan.find({ active: true }).select('name key').sort({ createdAt: 1 });
    const videos = await CatalogVideo.find();
    const videoByType = {};
    videos.forEach((v) => { videoByType[v.cardType] = v.videoUrl; });

    const result = plans
      .filter((p) => videoByType[p.key])
      .map((p) => ({ cardType: p.key, name: p.name, videoUrl: videoByType[p.key] }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/public/themes removed -- Card Designs feature retired.

// -----------------------------------------------------------------------
// Shop -- self-service purchase for someone who doesn't have an account
// yet. Same real Razorpay verification as the logged-in "Buy New Card"
// flow (backend/routes/profile.js), just without requireAuth, since
// there's no existing account to authenticate. Payment verification IS
// the trust boundary here, same as any public checkout.
// -----------------------------------------------------------------------

// POST /api/public/shop-order
router.post('/shop-order', async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) return res.status(503).json({ error: 'Payments are not configured yet.' });

    const { requestedPlan, fullName, loginEmail } = req.body;
    if (!requestedPlan || !fullName || !loginEmail) {
      return res.status(400).json({ error: 'requestedPlan, fullName, and loginEmail are required' });
    }

    const plan = await CardPlan.findOne({ key: requestedPlan.toLowerCase(), active: true });
    if (!plan) return res.status(400).json({ error: 'requestedPlan must match an active card plan' });
    const chargeAmount = getChargeAmount(plan);
    if (!chargeAmount) {
      return res.status(400).json({ error: 'This plan has no price set yet -- contact us to order it manually.' });
    }

    const existing = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in instead.' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(chargeAmount * 100),
      currency: 'INR',
      receipt: `shop_${Date.now()}`,
      notes: { fullName, loginEmail: loginEmail.toLowerCase(), requestedPlan: plan.key },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
    });
  } catch (err) {
    console.error('[public/shop-order POST]', err);
    res.status(500).json({ error: 'Failed to start payment' });
  }
});

// POST /api/public/shop-confirm
router.post('/shop-confirm', async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Payments are not configured yet.' });

    const {
      requestedPlan, fullName, loginEmail, razorpay_order_id, razorpay_payment_id, razorpay_signature,
      cardVariantId, designFrontUrl, designBackUrl,
    } = req.body;
    if (!requestedPlan || !fullName || !loginEmail || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed -- signature mismatch.' });
    }

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

    const existing = await Client.findOne({ loginEmail: loginEmail.toLowerCase() });
    if (existing) {
      // Payment already succeeded -- don't lose track of it even though
      // we can't create the account. Surface the payment ID so support
      // can resolve it manually.
      return res.status(409).json({
        error: 'Payment succeeded, but an account with this email already exists. Contact support with your payment ID: ' + razorpay_payment_id,
      });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const clientId = nanoid(10);

    const newClient = await Client.create({
      clientId,
      loginEmail: loginEmail.toLowerCase(),
      passwordHash,
      fullName,
      cardType: requestedPlan.toLowerCase(),
      cardVariantId: plan.variants.length > 0 ? cardVariantId : null,
      customDesignFrontUrl: plan.requiresDesignUpload ? designFrontUrl : null,
      customDesignBackUrl: plan.requiresDesignUpload ? designBackUrl : null,
      paid: true,
      mustChangePassword: true,
    });

    await CardRequest.create({
      clientId: newClient.clientId,
      type: 'new_card',
      note: 'Self-service purchase via Shop',
      status: 'fulfilled',
      paymentStatus: 'paid',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    res.status(201).json({
      clientId: newClient.clientId,
      loginEmail: newClient.loginEmail,
      tempPassword,
      cardType: newClient.cardType,
      publicUrl: `${process.env.PUBLIC_BASE_URL}/c/${newClient.clientId}`,
    });
  } catch (err) {
    console.error('[public/shop-confirm POST]', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// -----------------------------------------------------------------------
// Custom plan design upload -- front/back artwork the customer supplies
// at Shop checkout, printed as-is on their card. Public (no auth), same
// trust model as shop-order/shop-confirm above -- an unauthenticated
// buyer has no token to gate behind at this point in the flow. Upload
// happens immediately on file-select (mirroring the AR upload pattern in
// profile.js): this returns just a URL, which the frontend holds in
// React state and includes in shop-confirm / upgrade-confirm /
// new-card-confirm once payment actually completes.
// -----------------------------------------------------------------------

const DESIGN_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'designs');
fs.mkdirSync(DESIGN_UPLOADS_DIR, { recursive: true });
const DESIGN_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const designStorage = multer.diskStorage({
  destination: DESIGN_UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `design-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});
const uploadDesign = multer({
  storage: designStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB -- print artwork runs larger than a profile photo
  fileFilter: (req, file, cb) => {
    if (!DESIGN_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/public/design-upload -- multipart/form-data, field "design"
router.post('/design-upload', (req, res) => {
  uploadDesign.single('design')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large -- max 10MB.' : err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${process.env.BACKEND_URL}/uploads/designs/${req.file.filename}` });
  });
});

// -----------------------------------------------------------------------
// Contact Us -- no email sending is configured, so this genuinely just
// saves the message for admin to review (see GET /api/admin/contact-
// messages). Honest about what it does rather than pretending an email
// gets sent somewhere.
// -----------------------------------------------------------------------

// POST /api/public/contact
router.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, email, and message are required' });
    }
    await ContactMessage.create({ name, email: email.toLowerCase(), message });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[public/contact POST]', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/public/profile/:clientId
// This is what the NFC chip's URL (huntstag.com/c/{clientId}) ultimately
// resolves to, and what your React public-page frontend will call to
// render the tap page. No auth -- it's meant to be open to anyone who
// taps or scans the card.
router.get('/profile/:clientId', async (req, res) => {
  const client = await Client.findOneAndUpdate(
    { clientId: req.params.clientId },
    { $inc: { tapCount: 1 } }, // simple tap analytics, per the report's spec -- kept even while paused, harmless
    { new: true }
  ).select(
    'fullName jobTitle bio photoUrl bannerUrl arVideoUrl arBannerUrl arBannerType arModelUrl arModelType phone whatsapp publicEmail instagramUrl twitterUrl portfolioUrl huntsworldUrl customAttributes cardType clientId cardActive'
  );

  if (!client) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Paused by the owner (see POST /api/profile/pause-card) -- a distinct
  // signal, not a 404, since the card genuinely exists and the owner may
  // be debugging their own link. No profile fields are sent at all.
  if (!client.cardActive || (await isCardBlocked(client.clientId, req.query.card))) {
    return res.json({ paused: true });
  }

  // Whether this client's plan includes the AR feature -- decides
  // whether the tap page shows a second QR (AR) alongside the regular
  // profile QR every client gets.
  const plan = await CardPlan.findOne({ key: client.cardType }).select('arEnabled');
  const clientObj = client.toObject();
  clientObj.arEnabled = !!plan?.arEnabled;
  // client.toObject() does NOT flatten Map-type fields the way a Mongoose
  // document's own toJSON() would -- left as-is, customAttributes would
  // silently serialize as {} below, since a plain Map instance nested in a
  // plain object has no JSON.stringify-visible keys.
  clientObj.customAttributes = Object.fromEntries(client.customAttributes || []);

  res.json(clientObj);
});

// GET /api/public/vcard/:clientId
// Fallback save-to-contacts flow for any receiver, app installed or not --
// this is the path that always works regardless of MyNetwork adoption.
router.get('/vcard/:clientId', async (req, res) => {
  const client = await Client.findOne({ clientId: req.params.clientId });
  if (!client) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  if (!client.cardActive || (await isCardBlocked(client.clientId, req.query.card))) {
    return res.status(403).json({ error: 'This card has been deactivated' });
  }

  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${client.fullName || ''}`,
    client.jobTitle ? `TITLE:${client.jobTitle}` : '',
    client.phone ? `TEL;TYPE=CELL:${client.phone}` : '',
    client.publicEmail ? `EMAIL:${client.publicEmail}` : '',
    client.portfolioUrl ? `URL:${client.portfolioUrl}` : '',
    client.photoUrl ? `PHOTO;VALUE=URI:${client.photoUrl}` : '',
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\r\n');

  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', `attachment; filename="${client.fullName || 'contact'}.vcf"`);
  res.send(vcard);
});

// POST /api/public/leads/:clientId -- the reverse direction of the vCard
// route above: a visitor leaving THEIR OWN info for the card owner (see
// PublicProfile.jsx's "Exchange Contact" flow), landing in that owner's
// existing Contacts list (routes/contacts.js), tagged source: 'tap' so
// it's distinguishable from contacts the owner added/imported themselves.
// No auth -- same trust level as every other public tap-page route here.
router.post('/leads/:clientId', async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId cardActive');
    if (!client) return res.status(404).json({ error: 'Profile not found' });
    if (!client.cardActive || (await isCardBlocked(client.clientId, req.query.card))) {
      return res.status(403).json({ error: 'This card has been deactivated' });
    }

    const { name, phone, email, org } = req.body || {};
    const trimmedName = (name || '').toString().trim();
    const trimmedPhone = (phone || '').toString().trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });
    if (!trimmedPhone) return res.status(400).json({ error: 'Phone number is required' });

    // Upsert, not create -- a repeat scan by the same visitor (same phone,
    // same owner) refreshes their info instead of hitting the {clientId,
    // phone} unique index as a hard conflict the way contacts.js's own
    // owner-facing create route deliberately does (that's a single
    // deliberate action; this is a passive, repeatable tap).
    const contact = await Contact.findOneAndUpdate(
      { clientId: client.clientId, phone: trimmedPhone },
      {
        $set: {
          name: trimmedName,
          email: (email || '').toString().trim(),
          org: (org || '').toString().trim(),
          source: 'tap',
        },
        $setOnInsert: { clientId: client.clientId, phone: trimmedPhone },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Notify the owner -- in-app bell + mobile push, both best-effort and
    // fire-and-forget (never block this response on a side-channel alert),
    // same "don't await" rule appointments.js already follows for its own
    // email/SMS notifications.
    const message = `${trimmedName} shared their contact with you`;
    Notification.create({ clientId: client.clientId, message, contactId: contact._id }).catch((err) =>
      console.error('[public/leads] notification create failed:', err.message)
    );
    sendPushToClient(client.clientId, { title: 'New contact shared', body: message }).catch((err) =>
      console.error('[public/leads] push send failed:', err.message)
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[public/leads POST]', err);
    res.status(500).json({ error: 'Failed to share contact' });
  }
});

// GET /api/public/ar-targets
// Feeds the MyNetwork app's AR image recognition -- each client's own
// profile photo doubles as the AR marker image, since it's naturally
// unique per person and already collected.
//
// MVP SCOPE, NOT THE FINAL DESIGN: this currently returns the most
// recently active encoded clients, bounded to a small count, as a
// stand-in until a real "contacts/network" feature exists (saved when
// you scan someone, not everyone globally). Recognizing every client
// ever encoded would hurt AR performance and battery on-device, and
// makes no product sense once there are thousands of cards -- this
// endpoint's shape will need to change to "clients in MY network" once
// that data model exists.
router.get('/ar-targets', async (req, res) => {
  const LIMIT = 50; // keep the on-device target set small -- see note above
  const clients = await Client.find({ chipEncoded: true, photoUrl: { $exists: true, $ne: null } })
    .sort({ encodedAt: -1 })
    .limit(LIMIT)
    .select('clientId fullName jobTitle photoUrl');

  res.json(clients);
});

// GET /api/public/ar-layout/:clientId -- read-only, no auth. Feeds
// HuntsAR World's positioning of the video/photo, contact panel,
// portfolio, social icons, and Huntsworld link for THIS specific client.
// Falls back to the admin's global default template if the client hasn't
// customized their own layout yet, so the AR app never gets a 404 here.
router.get('/ar-layout/:clientId', async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId cardActive');
    if (client && (!client.cardActive || (await isCardBlocked(client.clientId, req.query.card)))) {
      // Surfaces verbatim in ArView.jsx's existing loadError UI (see
      // Promise.all([getPublicProfile, getPublicArLayout]).catch(...)) --
      // wording is user-facing as-is, not just a log message.
      return res.status(403).json({ error: 'This card has been deactivated' });
    }
    let layout = await ArLayout.findOne({ clientId: req.params.clientId });
    if (!layout) {
      layout = (await ArLayout.findOne({ key: 'global' })) || new ArLayout({ key: 'global' }); // defaults only if truly nothing saved anywhere
    }
    // HuntsAR World re-fetches this on every scan -- a stale cached copy
    // after the client just edited their layout would look exactly like a
    // "my save didn't apply" bug, so make sure it never gets one.
    res.set('Cache-Control', 'no-store');
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Every upload writes into sectionIcons now (works for any key, including
// custom sections added via the Attributes page); the five named fields
// are read only as a fallback for icons uploaded before sectionIcons
// existed, so nothing already live gets lost. Mirrors admin.js's own copy.
function mergeArIcons(doc) {
  if (!doc) return {};
  return {
    video: doc.video,
    contact: doc.contact,
    portfolio: doc.portfolio,
    social: doc.social,
    huntsworld: doc.huntsworld,
    ...Object.fromEntries(doc.sectionIcons || []),
  };
}

// GET /api/public/ar-icons -- the admin-managed logo set, shared across
// every client's card (see backend/models/ArIcon.js). Read-only, no auth.
router.get('/ar-icons', async (req, res) => {
  try {
    const icons = await ArIcon.findOne({ key: 'global' });
    res.set('Cache-Control', 'no-store');
    res.json(mergeArIcons(icons));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/attributes -- admin-defined extra profile fields (see
// AttributeDefinition), active ones only. Used by both Profile Settings
// (to know which extra inputs to render) and the public tap page (to know
// which extra rows to render, for whichever ones the client filled in).
router.get('/attributes', async (req, res) => {
  try {
    const attributes = await AttributeDefinition.find({ active: true }).sort({ section: 1, order: 1 });
    res.set('Cache-Control', 'no-store');
    res.json(attributes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/qr/:clientId -- generates a QR code PNG on the fly, no
// auth, no storage needed. Two kinds, chosen with ?type=:
//   - type=profile (default) -- encodes the plain tap page URL
//     (PUBLIC_BASE_URL/c/:clientId). Any phone's stock camera scans this
//     straight into the normal profile page -- the fallback for phones
//     without NFC.
//   - type=ar -- encodes the same tap page URL with an ?ar=1 flag. Today
//     this just opens the same normal profile page (harmless), but is
//     reserved so the HuntsAR World app can recognize this flag and
//     launch straight into AR once that route is built, without needing
//     to reissue a new QR image later.
const QRCode = require('qrcode');

// ?fg=/?bg= let the admin match the QR's colors to a physical card design
// before printing (see admin Clients.jsx) -- plain 6-digit hex, no '#',
// so it's a clean query param. Validated rather than passed straight
// through, since this ends up inside a generated image, not user-facing
// text -- an invalid value just falls back to the standard black-on-white
// instead of erroring the whole download.
const HEX_COLOR_RE = /^[0-9a-fA-F]{6}$/;
function hexColorParam(value, fallback) {
  return HEX_COLOR_RE.test(value || '') ? `#${value}` : fallback;
}

router.get('/qr/:clientId', async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId');
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
    const type = req.query.type === 'ar' ? 'ar' : 'profile';
    // Opt-in only, and only meaningful when type=ar -- lets a caller
    // (e.g. the mind-ar test pages' own composited target image) bake
    // `&engine=mindar` into the QR it embeds, without changing what a
    // real client's own `?type=ar` QR encodes by default. Only 'mindar'
    // is accepted; anything else is ignored rather than passed through
    // raw, so this can't be used to inject arbitrary query params into
    // the encoded URL.
    const engine = req.query.engine === 'mindar' ? '&engine=mindar' : '';
    const url = type === 'ar' ? `${base}/c/${client.clientId}?ar=1${engine}` : `${base}/c/${client.clientId}`;

    const dark = hexColorParam(req.query.fg, '#000000');
    let light = hexColorParam(req.query.bg, '#ffffff');
    // ?transparent=1 -- no background at all, so the QR can sit directly
    // on a colored/printed card without a visible box behind it. The
    // qrcode library accepts an 8-digit RRGGBBAA hex (see its own
    // hex2rgba) -- appending a 00 alpha byte to whichever background hex
    // was already resolved (chosen or default) makes it fully transparent
    // while keeping the same dark/light validation path for both cases.
    if (req.query.transparent === '1' || req.query.transparent === 'true') {
      light += '00';
    }

    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, url, { width: 512, margin: 2, color: { dark, light } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
