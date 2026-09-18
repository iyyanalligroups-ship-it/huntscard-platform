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
const CatalogEntry = require('../models/CatalogEntry');
const CardRequest = require('../models/CardRequest');
const ContactMessage = require('../models/ContactMessage');
const Contact = require('../models/Contact');
const Notification = require('../models/Notification');
const Card = require('../models/Card');
const CardTicket = require('../models/CardTicket');
const { sendPushToClient } = require('../utils/push');
const ArLayout = require('../models/ArLayout');
const ArIcon = require('../models/ArIcon');
const MagicArt = require('../models/MagicArt');
const StreetArt = require('../models/StreetArt');
const VideoShort = require('../models/VideoShort');
const MagicBusinessCard = require('../models/MagicBusinessCard');
const AttributeDefinition = require('../models/AttributeDefinition');
const SiteSetting = require('../models/SiteSetting');
const FaqEntry = require('../models/FaqEntry');
const { getChargeAmount } = require('../utils/pricing');
const { getGlobalMagicLayoutDefault, mergeMagicLayout } = require('../utils/magicLayout');
const { buildVariantMap, resolveCardVariant } = require('../utils/cardVariant');

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

// Three independent ways a tap can be blocked, returned as a reason string
// (or null if it's fine) so the frontend can show wording specific to
// which one actually happened, instead of one generic message for all of
// them:
//   'owner'       -- Client.cardActive is off (see Settings.jsx's "Card
//                     status") -- the profile owner paused everything
//                     themselves, reversible by them.
//   'deactivated' -- this ONE physical card's own Card.active is off (see
//                     models/Card.js) -- admin turned it off, reversible by
//                     admin (Reactivate).
//   'deleted'     -- a ?card=N was given but no Card record exists for it
//                     anymore -- admin PERMANENTLY deleted it (see DELETE
//                     /api/admin/cards/:cardId); this can never be undone,
//                     that card number is gone for good.
// Cards written before individual card tracking existed have no ?card= in
// their URL at all, so they can only ever hit 'owner' -- there's no way to
// target just one of them individually.
async function cardBlockReason(client, cardNumberParam) {
  if (!client.cardActive) return 'owner';
  const cardNumber = Number(cardNumberParam);
  if (!cardNumberParam || !Number.isFinite(cardNumber)) return null;
  const card = await Card.findOne({ clientId: client.clientId, cardNumber }).select('active');
  if (!card) return 'deleted';
  if (!card.active) return 'deactivated';
  return null;
}

// GET /api/public/plans
// Active card plans, for the client dashboard's "upgrade" picker. Plan
// names/prices aren't sensitive -- same info a public pricing page would
// show -- so this is deliberately unauthenticated.
router.get('/plans', async (req, res) => {
  const plans = await CardPlan.find({ active: true })
    .select(
      'name key price priceAmount description images variants requiresDesignUpload arEnabled zingEnabled magicEnabled isSpecialEdition'
    )
    .sort({ createdAt: 1 });
  // chargeAmount is what checkout actually uses -- priceAmount if admin set
  // it, else a plain-number `price` (e.g. "499") parsed as a fallback. Sent
  // as its own field so the frontend doesn't have to duplicate that parsing.
  res.json(plans.map((p) => ({ ...p.toObject(), chargeAmount: getChargeAmount(p) })));
});

// GET /api/public/catalog -- every ACTIVE Video Short (see
// admin.js/VideoShort.js) with a videoUrl actually set, for the public
// Catalog page's "See it in motion" section. Not tied to card plans --
// see VideoShort.js's own comment for why that coupling was removed.
router.get('/catalog', async (req, res) => {
  try {
    const docs = await VideoShort.find({ active: true }).sort({ createdAt: 1 });
    res.json(
      docs
        .filter((d) => d.videoUrl) // a freshly-created, still-blank clip shouldn't appear
        .map((d) => ({ _id: d._id, title: d.title, videoUrl: d.videoUrl }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/public/catalog-entries -- active card variants (see
// models/CatalogEntry.js) for the public Catalog page's tier grid
// (image gallery, price, features). Distinct from GET /catalog above,
// which is just the tap-demo video showcase -- both feed the same
// Catalog.jsx page, in separate sections.
router.get('/catalog-entries', async (req, res) => {
  try {
    const entries = await CatalogEntry.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 });
    res.json(entries);
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
    'fullName jobTitle bio photoUrl bannerUrl arVideoUrl arBannerUrl arBannerType arModelUrl arModelType phone whatsapp publicEmail loginEmail instagramUrl twitterUrl portfolioUrl huntsworldUrl customAttributes cardType cardVariantId clientId cardActive customDesignFrontUrl'
  );

  if (!client) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Blocked (any reason -- see cardBlockReason's own comment) -- a
  // distinct signal, not a 404, since the card genuinely exists and
  // whoever's looking may be debugging their own link. No profile fields
  // are sent at all.
  const blockReason = await cardBlockReason(client, req.query.card);
  if (blockReason) {
    return res.json({ paused: true, reason: blockReason });
  }

  const clientObj = client.toObject();
  // No public contact email set -- fall back to the login email rather
  // than leaving the card's Contact tab with no email row at all. Applied
  // here (not stored) so Profile Settings' own "Public email" field still
  // shows genuinely empty when it's genuinely empty.
  clientObj.publicEmail = clientObj.publicEmail || clientObj.loginEmail;
  delete clientObj.loginEmail;
  // The physical card's actual shape -- picked at purchase time (see
  // CardPlanVariantSchema.shape) and needed by the AR layout system to
  // size/orient itself to match instead of always assuming landscape.
  // Resolved from the SPECIFIC card that was tapped (?card=N) when
  // present -- a client can own several physical cards on different
  // plans/variants (see models/Card.js), so Client.cardType/cardVariantId
  // (which really just mirrors card #1) would silently show the wrong
  // shape/AR-enabled flag for any other card. No ?card= at all (a legacy
  // tap URL predating per-card tracking) falls back to the old
  // Client-level fields unchanged.
  const cardNumberParam = Number(req.query.card);
  const tappedCard = Number.isFinite(cardNumberParam)
    ? await Card.findOne({ clientId: client.clientId, cardNumber: cardNumberParam }).select('cardType cardVariantId')
    : null;
  const resolved = await resolveCardVariant(tappedCard || client);
  clientObj.arEnabled = resolved.arEnabled;
  clientObj.cardShape = resolved.shape;
  // The actual purchased design for the tapped card -- deliberately its
  // OWN field, not a repurposed clientObj.bannerUrl, since bannerUrl is a
  // genuine separate cover-photo upload shown elsewhere on this same
  // profile (see PublicProfile.jsx). Most plans (Apex included) don't let
  // the client upload their own card image at all, so the AR tracking
  // target (see arTargetImage.js) needs to come from here instead: the
  // checkout-uploaded design for Custom Card, or the purchased variant's
  // own image for every other plan -- same resolution Magic Business
  // Card's derived image already uses (see GET /magic-card below).
  clientObj.cardDesignUrl = resolved.requiresDesignUpload ? client.customDesignFrontUrl || null : resolved.frontImageUrl;
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
  const vcardBlockReason = await cardBlockReason(client, req.query.card);
  if (vcardBlockReason) {
    return res.status(403).json({ error: 'This card has been deactivated', reason: vcardBlockReason });
  }

  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${client.fullName || ''}`,
    client.jobTitle ? `TITLE:${client.jobTitle}` : '',
    client.phone ? `TEL;TYPE=CELL:${client.phone}` : '',
    client.publicEmail || client.loginEmail ? `EMAIL:${client.publicEmail || client.loginEmail}` : '',
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
    const leadsBlockReason = await cardBlockReason(client, req.query.card);
    if (leadsBlockReason) {
      return res.status(403).json({ error: 'This card has been deactivated', reason: leadsBlockReason });
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

// POST /api/public/card-tickets/:clientId
// "Raise a ticket" -- shown on the tap page in place of a raw phone/email
// when a card is temporarily deactivated (see PublicProfile.jsx's
// 'deactivated' branch), so whoever tapped it has an actual way to reach
// support instead of just being told to call/email somewhere. Deliberately
// does NOT gate on cardBlockReason the way leads/vcard/ar-layout do --
// this route's whole purpose is to still work while the card is blocked,
// not despite it.
router.post('/card-tickets/:clientId', async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId');
    if (!client) return res.status(404).json({ error: 'Profile not found' });

    const { name, contactNumber, issue, email } = req.body || {};
    const trimmedName = (name || '').toString().trim();
    const trimmedContactNumber = (contactNumber || '').toString().trim();
    const trimmedIssue = (issue || '').toString().trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });
    if (!trimmedContactNumber) return res.status(400).json({ error: 'Contact number is required' });
    if (!trimmedIssue) return res.status(400).json({ error: 'Please describe the issue' });

    const cardNumber = Number(req.query.card);
    const ticket = await CardTicket.create({
      clientId: client.clientId,
      cardNumber: Number.isFinite(cardNumber) ? cardNumber : null,
      name: trimmedName,
      contactNumber: trimmedContactNumber,
      email: (email || '').toString().trim() || null,
      issue: trimmedIssue,
    });

    res.status(201).json({ ok: true, ticketId: ticket._id });
  } catch (err) {
    console.error('[public/card-tickets POST]', err);
    res.status(500).json({ error: 'Failed to submit ticket' });
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
    const arBlockReason = client ? await cardBlockReason(client, req.query.card) : null;
    if (arBlockReason) {
      // Surfaces verbatim in ArView.jsx's existing loadError UI (see
      // Promise.all([getPublicProfile, getPublicArLayout]).catch(...)) --
      // wording is user-facing as-is, not just a log message.
      return res.status(403).json({ error: 'This card has been deactivated', reason: arBlockReason });
    }
    // Which of this client's physical cards was actually tapped -- each
    // can have its own saved arrangement (see models/ArLayout.js's own
    // cardNumber comment). No ?card= at all (a legacy tap URL predating
    // this feature) defaults to card #1, same convention cardBlockReason
    // already uses.
    const cardNumber = Number(req.query.card) || 1;
    let layout = await ArLayout.findOne({ clientId: req.params.clientId, cardNumber });
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

// GET /api/public/magic-art -- every COMPLETE admin-managed Magic Art
// pack (see backend/models/MagicArt.js), oldest first. Read-only, no
// auth. Filtered to packs with an image and at least one overlay clip
// that has its own video -- an in-progress pack the admin hasn't
// finished shouldn't be publicly visible or scannable. Returns [] (not a
// 404) when none exist yet.
router.get('/magic-art', async (req, res) => {
  try {
    const docs = await MagicArt.find({ imageUrl: { $ne: null } }).sort({ createdAt: 1 });
    res.set('Cache-Control', 'no-store');
    res.json(
      docs
        .map((doc) => ({
          _id: doc._id,
          name: doc.name,
          description: doc.description,
          imageUrl: doc.imageUrl,
          imageWidth: doc.imageWidth,
          imageHeight: doc.imageHeight,
          // One positioned box per clip (see StreetArt.js's identical
          // shape) -- consumed by client-app's MagicCamera.jsx
          // (getTargetOverlays), which renders each as its own video
          // plane instead of one video stretched across the whole image.
          overlays: (doc.overlays || [])
            .filter((o) => o.videoUrl)
            .map((o) => ({
              videoUrl: o.videoUrl,
              videoCrop: {
                x: o.videoCropX ?? 0,
                y: o.videoCropY ?? 0,
                width: o.videoCropWidth ?? 1,
                height: o.videoCropHeight ?? 1,
              },
              x: o.x,
              y: o.y,
              width: o.width,
              height: o.height,
            })),
          active: doc.active,
        }))
        .filter((piece) => piece.overlays.length > 0)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/magic-cards -- every ACTIVE Magic Business Card (see
// backend/models/MagicBusinessCard.js) with both a resolvable image and a
// video. Read-only, no auth, no clientId in the response -- not needed
// for the AR effect itself. Scanned by client-app's MagicCamera.jsx
// alongside Magic Art, both merged into one target list there.
//
// Same image-sourcing rule as the singular /magic-card/:clientId route
// (see its own comment) -- resolved per (clientId, cardNumber) pair in
// one batch rather than looped, so this stays a handful of queries
// regardless of how many active cards exist.
router.get('/magic-cards', async (req, res) => {
  try {
    const docs = await MagicBusinessCard.find({ active: true, videoUrl: { $ne: null } });
    if (docs.length === 0) {
      res.set('Cache-Control', 'no-store');
      return res.json([]);
    }

    const cards = await Card.find({ $or: docs.map((d) => ({ clientId: d.clientId, cardNumber: d.cardNumber })) })
      .select('clientId cardNumber cardType cardVariantId');
    const cardByKey = Object.fromEntries(cards.map((c) => [`${c.clientId}:${c.cardNumber}`, c]));
    const maps = await buildVariantMap(cards);

    const customDesignClientIds = [...new Set(
      cards.filter((c) => maps.planByKey[c.cardType]?.requiresDesignUpload).map((c) => c.clientId)
    )];
    const customDesignClients = customDesignClientIds.length
      ? await Client.find({ clientId: { $in: customDesignClientIds } }).select('clientId customDesignFrontUrl')
      : [];
    const customDesignByClientId = Object.fromEntries(customDesignClients.map((c) => [c.clientId, c.customDesignFrontUrl]));

    const results = [];
    for (const doc of docs) {
      const card = cardByKey[`${doc.clientId}:${doc.cardNumber}`];
      if (!card) continue;
      const resolved = await resolveCardVariant(card, maps);
      const isSpecialEdition = Boolean(maps.planByKey[card.cardType]?.isSpecialEdition);
      // Same priority order as the singular GET /magic-card/:clientId
      // route -- this card's own client-set override (doc.imageUrl)
      // wins over the checkout design for Custom Card, since that design
      // is shared across ALL of an account's Custom Card purchases and
      // would otherwise show the wrong one once a client owns more than one.
      const imageUrl = resolved.requiresDesignUpload
        ? doc.imageUrl || customDesignByClientId[card.clientId] || null
        : resolved.hasVariant
        ? resolved.frontImageUrl || doc.imageUrl || null
        : doc.imageUrl || null; // admin-set fallback escape hatch
      if (!imageUrl) continue; // nothing resolvable -- not shown, same as "no active card" today

      results.push({
        imageUrl,
        imageWidth: doc.imageWidth,
        imageHeight: doc.imageHeight,
        videoUrl: doc.videoUrl,
        isSpecialEdition,
        audioUrl: isSpecialEdition ? doc.audioUrl : null,
        videoCrop: {
          x: doc.videoCropX ?? 0,
          y: doc.videoCropY ?? 0,
          width: doc.videoCropWidth ?? 1,
          height: doc.videoCropHeight ?? 1,
        },
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/street-art -- every ACTIVE Street Art piece (see
// backend/models/StreetArt.js) with an image and at least one overlay clip
// that has its own video. Read-only, no auth -- same trust model as
// /magic-art and /magic-cards above (this data was always effectively
// public info, just never linked from a page). Deliberately NOT rendered
// as a browsable gallery anywhere in client-app, unlike Magic Art --
// scanned by MagicCamera.jsx purely as extra tracking targets, nothing
// links to this route or lists these pieces by name/location.
router.get('/street-art', async (req, res) => {
  try {
    const docs = await StreetArt.find({ active: true, imageUrl: { $ne: null } });
    const results = docs
      .map((doc) => ({
        imageUrl: doc.imageUrl,
        imageWidth: doc.imageWidth,
        imageHeight: doc.imageHeight,
        overlays: (doc.overlays || [])
          .filter((o) => o.videoUrl)
          .map((o) => ({
            videoUrl: o.videoUrl,
            videoCrop: {
              x: o.videoCropX ?? 0,
              y: o.videoCropY ?? 0,
              width: o.videoCropWidth ?? 1,
              height: o.videoCropHeight ?? 1,
            },
            x: o.x,
            y: o.y,
            width: o.width,
            height: o.height,
          })),
      }))
      .filter((piece) => piece.overlays.length > 0);

    res.set('Cache-Control', 'no-store');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/magic-card/:clientId?card=N -- ONE specific PHYSICAL
// card's ACTIVE Magic Business Card, same field shape as the plural
// /magic-cards above. Read-only, no auth. Feeds MagicCamera.jsx's
// client-scoped mode (reached via the "choose AR or Magic" screen off a
// specific card's own AR QR, see PublicProfile.jsx) -- compiling and
// tracking just this one image instead of every active client's card
// gallery-wide is both faster and less prone to false-matching against a
// similar-looking design. No ?card= (a legacy link) defaults to card #1.
//
// The image is no longer a Magic-Business-Card-specific upload for most
// plans -- see utils/cardVariant.js. Custom Card reuses the design
// uploaded at checkout (Client.customDesignFrontUrl); every other plan
// uses its purchased variant's own frontImageUrl. A card with neither
// (no variant resolvable, e.g. legacy data) simply has no Magic Business
// Card available -- same 404 as "not active" today, not a broken preview.
router.get('/magic-card/:clientId', async (req, res) => {
  try {
    const cardNumber = Number(req.query.card) || 1;
    const doc = await MagicBusinessCard.findOne({
      clientId: req.params.clientId,
      cardNumber,
      active: true,
      videoUrl: { $ne: null },
    });
    if (!doc) return res.status(404).json({ error: 'No active Magic Business Card for this card' });

    const card = await Card.findOne({ clientId: req.params.clientId, cardNumber }).select('cardType cardVariantId');
    const resolved = card ? await resolveCardVariant(card) : null;
    const plan = card ? await CardPlan.findOne({ key: card.cardType }) : null;
    const isSpecialEdition = Boolean(plan?.isSpecialEdition);

    let imageUrl = null;
    if (resolved?.requiresDesignUpload) {
      // Custom Card only -- this card's own client-set override (see
      // POST /api/profile/magic-card/image) takes priority over the
      // checkout design, same order profile.js's serializeMyMagicCard
      // uses, so what a live scan shows matches the client's own
      // dashboard exactly instead of always falling back to whichever
      // checkout most recently overwrote Client.customDesignFrontUrl.
      imageUrl = doc.imageUrl || null;
      if (!imageUrl) {
        const client = await Client.findOne({ clientId: req.params.clientId }).select('customDesignFrontUrl');
        imageUrl = client?.customDesignFrontUrl || null;
      }
    } else if (resolved?.hasVariant) {
      imageUrl = resolved.frontImageUrl || doc.imageUrl || null; // doc.imageUrl here is an admin-only escape hatch
    } else {
      imageUrl = doc.imageUrl || null; // no resolvable variant -- admin-set fallback escape hatch
    }
    if (!imageUrl) return res.status(404).json({ error: 'Magic Business Card is not available for this card yet' });

    res.set('Cache-Control', 'no-store');
    // Falls back to admin's global Magic Layout default for a card that
    // hasn't been customized yet -- see utils/magicLayout.js's
    // mergeMagicLayout for the precedence rule.
    const { componentPositions, magicElements } = mergeMagicLayout(doc, await getGlobalMagicLayoutDefault());
    res.json({
      imageUrl,
      imageWidth: doc.imageWidth,
      imageHeight: doc.imageHeight,
      videoUrl: doc.videoUrl,
      isSpecialEdition,
      audioUrl: isSpecialEdition ? doc.audioUrl : null,
      videoCrop: {
        x: doc.videoCropX ?? 0,
        y: doc.videoCropY ?? 0,
        width: doc.videoCropWidth ?? 1,
        height: doc.videoCropHeight ?? 1,
      },
      // Only meaningful (and only sent) for this single-client route --
      // the gallery-wide /magic-cards above deliberately omits these,
      // see MagicCamera.jsx's own scoped-mode-only AR component bar.
      componentPositions,
      // Admin-defined custom components (see AttributeDefinition.magicComponent).
      magicElements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/site-settings -- currently just which homepage design
// to render (see App.jsx). No auth -- read on every client-app load,
// before we know if anyone's logged in. Defaults to 'default' if the
// admin has never touched the toggle yet (no doc created).
router.get('/site-settings', async (req, res) => {
  try {
    const doc = await SiteSetting.findOne({ key: 'global' });
    res.set('Cache-Control', 'no-store');
    res.json({ homeTheme: doc?.homeTheme || 'default' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/faq -- active entries only, in admin's chosen order
// (see models/FaqEntry.js). Feeds client-app's Faq.jsx, which used to
// hardcode this list.
router.get('/faq', async (req, res) => {
  try {
    const entries = await FaqEntry.find({ active: true }).sort({ order: 1, createdAt: 1 }).select('question answer');
    res.json(entries);
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

// GET /api/public/qr/magic-camera -- a fixed QR (no dynamic input at all,
// unlike /qr/:clientId below) pointing at the now-public /magic-camera
// page. Registered BEFORE the /:clientId param route below so Express
// doesn't treat "magic-camera" as a clientId value. Used by the public
// Magic Art gallery's "scan to see the effect" popup (client-app's
// MagicArt.jsx), matching the real Artivive product's own QR-popup
// pattern -- except this one opens straight in the browser, no app
// install needed.
router.get('/qr/magic-camera', async (req, res) => {
  try {
    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, `${base}/magic-camera`, { width: 512, margin: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    // Which PHYSICAL card this QR is actually for -- a client can own
    // several (see models/Card.js), each needing its own printed QR so
    // scanning it resolves that specific card's shape/AR layout/Magic
    // Business Card instead of always landing on card #1's. Opt-in (a
    // legacy caller that never passes ?card= still gets the old
    // card-less URL, which PublicProfile.jsx already treats as "card #1,
    // pre-per-card-tracking" -- see its own comment).
    const cardParam = Number(req.query.card);
    const cardSuffix = Number.isFinite(cardParam) ? `card=${cardParam}` : '';
    const url =
      type === 'ar'
        ? `${base}/c/${client.clientId}?ar=1${engine}${cardSuffix ? `&${cardSuffix}` : ''}`
        : `${base}/c/${client.clientId}${cardSuffix ? `?${cardSuffix}` : ''}`;

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
