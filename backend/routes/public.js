const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const Razorpay = require('razorpay');
const Client = require('../models/Client');
const CardPlan = require('../models/CardPlan');
const CardRequest = require('../models/CardRequest');
const ContactMessage = require('../models/ContactMessage');
const ArLayout = require('../models/ArLayout');
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

// GET /api/public/plans
// Active card plans, for the client dashboard's "upgrade" picker. Plan
// names/prices aren't sensitive -- same info a public pricing page would
// show -- so this is deliberately unauthenticated.
router.get('/plans', async (req, res) => {
  const plans = await CardPlan.find({ active: true }).select('name key price priceAmount description images').sort({ createdAt: 1 });
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

    const { requestedPlan, fullName, loginEmail, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
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
    { $inc: { tapCount: 1 } }, // simple tap analytics, per the report's spec
    { new: true }
  ).select('fullName jobTitle bio photoUrl bannerUrl arVideoUrl phone whatsapp publicEmail instagramUrl twitterUrl portfolioUrl huntsworldUrl cardType clientId');

  if (!client) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Whether this client's plan includes the AR feature -- decides
  // whether the tap page shows a second QR (AR) alongside the regular
  // profile QR every client gets.
  const plan = await CardPlan.findOne({ key: client.cardType }).select('arEnabled');
  const clientObj = client.toObject();
  clientObj.arEnabled = !!plan?.arEnabled;

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
    let layout = await ArLayout.findOne({ clientId: req.params.clientId });
    if (!layout) {
      layout = (await ArLayout.findOne({ key: 'global' })) || new ArLayout({ key: 'global' }); // defaults only if truly nothing saved anywhere
    }
    res.json(layout);
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

router.get('/qr/:clientId', async (req, res) => {
  try {
    const client = await Client.findOne({ clientId: req.params.clientId }).select('clientId');
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
    const type = req.query.type === 'ar' ? 'ar' : 'profile';
    const url = type === 'ar' ? `${base}/c/${client.clientId}?ar=1` : `${base}/c/${client.clientId}`;

    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, url, { width: 512, margin: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
