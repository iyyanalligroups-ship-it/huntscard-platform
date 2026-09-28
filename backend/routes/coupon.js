const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const Client = require('../models/Client');
const CardPlan = require('../models/CardPlan');
const ClientAddress = require('../models/ClientAddress');
const CardRequest = require('../models/CardRequest');
const Card = require('../models/Card');
const { getChargeAmount } = require('../utils/pricing');
const { nextOrderNumber } = require('../utils/orderNumber');
const { peekHuntstagCoupon, redeemHuntstagCoupon } = require('../utils/huntsworldCouponClient');
const createCardsForPurchase = require('../utils/createCardsForPurchase');

// HuntsWorld coupon claim -- a completely separate checkout path from the
// normal Razorpay upgrade flow (see /upgrade-order, /upgrade-confirm).
// A coupon always claims exactly ONE card, no Razorpay round trip, and the
// whole order (card + delivery + GST) is free -- the merchant already paid
// for this entitlement on huntsworld.com.

// POST /api/profile/coupon/preview
// Read-only: tells the UI what this code unlocks, without consuming it.
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Enter a coupon code.' });

    const client = await Client.findOne({ clientId: req.user.clientId });
    if (!client?.phone) {
      return res.status(400).json({ error: 'Add a phone number to your profile before using a coupon.' });
    }

    const result = await peekHuntstagCoupon(code, client.phone);
    if (!result?.valid) {
      return res.status(400).json({ error: result?.reason || 'This coupon code is not valid.' });
    }

    const plan = await CardPlan.findOne({ key: result.huntstagPlanKey, active: true });
    if (!plan) {
      return res.status(400).json({ error: 'This coupon\'s plan is not currently available -- contact support.' });
    }

    res.json({
      valid: true,
      plan: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        requiresDesignUpload: plan.requiresDesignUpload,
        variants: plan.variants.map((v) => ({ _id: v._id, name: v.name, shape: v.shape, frontImageUrl: v.frontImageUrl, backImageUrl: v.backImageUrl })),
      },
    });
  } catch (err) {
    console.error('[coupon/preview POST]', err);
    res.status(502).json({ error: 'Could not reach the coupon service -- try again shortly.' });
  }
});

// POST /api/profile/coupon/claim
// Consumes the coupon (one-time use, enforced atomically on huntsworld's
// side) and creates the CardRequest immediately -- no payment step.
router.post('/claim', requireAuth, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    const { deliveryAddressId, variantId, designFrontUrl, designBackUrl } = req.body;
    if (!code) return res.status(400).json({ error: 'Enter a coupon code.' });
    if (!deliveryAddressId) return res.status(400).json({ error: 'Choose a delivery address before claiming.' });

    const client = await Client.findOne({ clientId: req.user.clientId });
    if (!client?.phone) {
      return res.status(400).json({ error: 'Add a phone number to your profile before using a coupon.' });
    }

    // Check first (does not consume) so a request that's about to fail
    // validation below never burns the one-time code.
    const peek = await peekHuntstagCoupon(code, client.phone);
    if (!peek?.valid) {
      return res.status(400).json({ error: peek?.reason || 'This coupon code is not valid.' });
    }

    const plan = await CardPlan.findOne({ key: peek.huntstagPlanKey, active: true });
    if (!plan) {
      return res.status(400).json({ error: 'This coupon\'s plan is not currently available -- contact support.' });
    }

    let variant = null;
    if (plan.variants.length > 0) {
      if (!variantId) return res.status(400).json({ error: 'Choose a card style.' });
      variant = plan.variants.id(variantId);
      if (!variant) return res.status(400).json({ error: 'That card style is not part of this plan.' });
    }

    if (plan.requiresDesignUpload && !(designFrontUrl && designBackUrl)) {
      return res.status(400).json({ error: 'Upload both a front and back design before claiming.' });
    }

    const deliveryAddress = await ClientAddress.findOne({ _id: deliveryAddressId, clientId: req.user.clientId });
    if (!deliveryAddress) return res.status(400).json({ error: 'The selected delivery address was not found.' });

    // Consume the coupon -- atomic on huntsworld's side, so a retried/
    // duplicate submit here can never claim twice even if this request
    // handler itself runs more than once.
    const redemption = await redeemHuntstagCoupon(code, client.phone, req.user.clientId);
    if (!redemption?.valid) {
      return res.status(409).json({ error: redemption?.reason || 'This coupon has already been used.' });
    }

    const chargeAmount = getChargeAmount(plan); // display-only here -- the actual charge is 0
    const invoiceItems = [
      {
        name: variant ? `${plan.name} - ${variant.name}` : plan.name,
        unitPrice: 0,
        quantity: 1,
      },
    ];

    const hadAnyCardsBefore = Boolean(await Card.exists({ clientId: req.user.clientId }));
    const request = await CardRequest.create({
      clientId: req.user.clientId,
      type: 'upgrade',
      requestedPlan: plan.key,
      // A verified, atomically redeemed coupon is the payment/entitlement
      // decision. Match Razorpay checkout and approve immediately.
      status: 'approved',
      paymentStatus: 'paid',
      orderNumber: await nextOrderNumber(),
      quantity: 1,
      variantBreakdown: variant ? [{ variantId: variant._id, quantity: 1 }] : [],
      invoiceItems,
      subtotal: 0,
      deliveryFee: 0,
      gstPercent: 0,
      gstAmount: 0,
      amount: 0,
      amountPaid: 0,
      delivery: {
        name: deliveryAddress.name,
        phone: deliveryAddress.phone,
        line1: deliveryAddress.line1,
        line2: deliveryAddress.line2 || '',
        country: deliveryAddress.country,
        state: deliveryAddress.state,
        city: deliveryAddress.city,
        pincode: deliveryAddress.pincode,
      },
      couponCode: code.toUpperCase(),
      couponSource: 'huntsworld',
    });

    // Same as the paid Razorpay checkout (routes/profile.js's
    // /upgrade-confirm) -- payment (here: a verified one-time coupon
    // redemption) is what actually entitles the client to a physical
    // card, so it's minted now, not deferred until admin separately
    // approves the request. Without this, the request would sit as
    // "Paid" with nothing for AR Layout/Magic Business Card/Card
    // Fulfillment to ever show -- Client.cardType would be set (once
    // admin approves) but no real Card record would exist behind it.
    await createCardsForPurchase({
      clientId: req.user.clientId,
      cardType: plan.key,
      quantity: 1,
      variantBreakdown: variant ? [{ variantId: variant._id, quantity: 1 }] : [],
      purchaseRequestId: request._id,
      orderNumber: request.orderNumber,
    });

    const clientUpdates = { paid: true };
    if (!hadAnyCardsBefore) {
      clientUpdates.cardType = plan.key;
      clientUpdates.cardVariantId = variant?._id || null;
    }
    // Keep the existing account-level fallback for legacy/public URLs.
    // Buying a non-Custom plan never clears an older Custom design.
    if (plan.requiresDesignUpload) {
      clientUpdates.customDesignFrontUrl = designFrontUrl;
      clientUpdates.customDesignBackUrl = designBackUrl;
    }
    await Client.updateOne({ clientId: req.user.clientId }, { $set: clientUpdates });

    res.json({ request, planName: plan.name, listPrice: chargeAmount });
  } catch (err) {
    console.error('[coupon/claim POST]', err);
    res.status(502).json({ error: 'Could not complete the free-card claim -- try again shortly.' });
  }
});

module.exports = router;
